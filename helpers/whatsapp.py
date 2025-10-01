import os
import json
import time
import threading
from queue import Queue, Empty
from typing import Dict, Any, List, Optional
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WA_CONFIG_PATH = os.path.join(BASE_DIR, 'config', 'config_whatsapp.json')

# Internal state
_wa_cfg: Dict[str, Any] = {}
_q: "Queue[Dict[str, Any]]" = Queue()
_worker_started = False
_dedupe_map: Dict[str, float] = {}
_dedupe_lock = threading.Lock()
_rate_lock = threading.Lock()
_last_sent_ts: List[float] = []  # timestamps for simple rate-limit window


def load_wa_config() -> Dict[str, Any]:
    global _wa_cfg
    try:
        with open(WA_CONFIG_PATH, 'r', encoding='utf-8') as f:
            _wa_cfg = json.load(f) or {}
    except Exception:
        _wa_cfg = {}
    return _wa_cfg


def _rate_limited(rate_limit_per_min: int) -> None:
    """Block until allowed to send under a simple sliding window limiter."""
    if rate_limit_per_min <= 0:
        return
    window = 60.0
    while True:
        now = time.time()
        with _rate_lock:
            # drop old
            while _last_sent_ts and now - _last_sent_ts[0] > window:
                _last_sent_ts.pop(0)
            if len(_last_sent_ts) < rate_limit_per_min:
                _last_sent_ts.append(now)
                return
        time.sleep(0.2)


def _dedupe_allowed(key: str, cooldown: int) -> bool:
    now = time.time()
    with _dedupe_lock:
        last = _dedupe_map.get(key, 0)
        if now - last < max(0, cooldown):
            return False
        _dedupe_map[key] = now
        return True


def _http_post_json(url: str, payload: Dict[str, Any], headers: Dict[str, str], timeout: float = 6.0) -> int:
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.getcode() or 0
    except Exception:
        return 0

def _send_http_bulk(msg: str, cfg: Dict[str, Any], targets: Optional[List[int]]) -> bool:
    url = cfg.get('endpoint_url')
    if not url:
        return False
    ids = targets or cfg.get('supervisor_ids') or []
    if not isinstance(ids, list) or not ids:
        return False
    payload = {
        'user_ids': ids,
        'message': msg,
        'source': cfg.get('source') or 'FaceRecognitionApp',
        'use_hr_id': bool(cfg.get('use_hr_id', True)),
    }
    headers = {'Content-Type': 'application/json'}
    status = _http_post_json(url, payload, headers)
    return 200 <= status < 300


def _send_meta_text(to: str, body: str, cfg: Dict[str, Any]) -> bool:
    phone_id = cfg.get('phone_number_id')
    token_env = cfg.get('access_token_env', 'WHATSAPP_ACCESS_TOKEN')
    access_token = os.environ.get(token_env)
    if not phone_id or not access_token or not to:
        return False
    url = f"https://graph.facebook.com/v20.0/{phone_id}/messages"
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    payload = {
        'messaging_product': 'whatsapp',
        'to': to,
        'type': 'text',
        'text': { 'body': body }
    }
    status = _http_post_json(url, payload, headers)
    return status >= 200 and status < 300


def _worker_loop():
    cfg = load_wa_config()
    rate = int(cfg.get('rate_limit_per_min') or 30)
    cooldown = int(cfg.get('dedupe_cooldown_sec') or 60)
    provider = (cfg.get('provider') or 'meta').lower()
    while True:
        try:
            item = _q.get(timeout=1.0)
        except Empty:
            continue
        try:
            msg = item.get('msg')
            ok = False
            if provider == 'meta':
                to = item.get('to')
                key = item.get('key') or f"{to}:{hash(msg)}"
                if not _dedupe_allowed(key, cooldown):
                    continue
                _rate_limited(rate)
                ok = _send_meta_text(to, msg, cfg)
            elif provider == 'http':
                targets = item.get('targets')  # list of HR IDs
                # For bulk, dedupe by message + joined targets or provided key
                key = item.get('key') or f"bulk:{hash(msg)}"
                if not _dedupe_allowed(key, cooldown):
                    continue
                _rate_limited(rate)
                ok = _send_http_bulk(msg, cfg, targets)
            # could add other providers here
            # print success/fail lightly
            if not ok:
                print(f"[WA] send failed (provider={provider})")
        except Exception as e:
            print(f"[WA] worker error: {e}")
        finally:
            _q.task_done()


def init_sender():
    global _worker_started
    cfg = load_wa_config()
    if not bool(cfg.get('enabled', False)):
        return
    if _worker_started:
        return
    t = threading.Thread(target=_worker_loop, daemon=True)
    t.start()
    _worker_started = True
    print("[WA] sender initialized")


def enqueue_to_supervisors(message: str, key_hint: Optional[str] = None) -> int:
    cfg = load_wa_config()
    if not bool(cfg.get('enabled', False)):
        return 0
    provider = (cfg.get('provider') or 'meta').lower()
    if provider == 'http':
        targets = cfg.get('supervisor_ids') or []
        _q.put({'msg': message, 'key': key_hint, 'targets': targets})
        return 1 if targets else 0
    else:
        sups = cfg.get('supervisors') or []
        count = 0
        for to in sups:
            if not to:
                continue
            _q.put({'to': to, 'msg': message, 'key': f"{to}:{key_hint}" if key_hint else None})
            count += 1
        return count
