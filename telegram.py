import os
import json
import time
import threading
from typing import Dict, Any, List, Optional
import urllib.request
import datetime as dt
# --- Database Connection (Isolated) ---
# This section makes telegram.py independent from app.py's models.
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    DateTime,
    Boolean,
    Date,
    ForeignKey,
)
from sqlalchemy.orm import sessionmaker, declarative_base, relationship, joinedload

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TG_CONFIG_PATH = os.path.join(BASE_DIR, 'config', 'config_telegram.json')

# --- PostgreSQL Database Configuration (aligned with database_models.py) ---
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_NAME = os.getenv("POSTGRES_DB", "FR")
DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "778899")
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"

Base = declarative_base()
engine = create_engine(DATABASE_URL, echo=False, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)

# --- Mirrored DB Models for telegram.py ---
class Employee(Base):
    __tablename__ = 'employees'
    id = Column(Integer, primary_key=True)
    employee_code = Column(String)
    name = Column(String)
    department = Column(String)

class Camera(Base):
    __tablename__ = 'cameras'
    id = Column(Integer, primary_key=True)
    name = Column(String)
    area = Column(String)

class FaceTemplate(Base):
    __tablename__ = 'face_templates'
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'))
    pose_label = Column(String)
    # We only need these columns for finding the image path

class Attendance(Base):
    __tablename__ = 'attendances'
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'))
    date = Column(Date)

class AlertLog(Base):
    __tablename__ = 'alert_logs'
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'))
    timestamp = Column(DateTime, default=dt.datetime.utcnow)
    camera_id = Column(Integer, ForeignKey('cameras.id'))
    message = Column(String)
    alert_type = Column(String)
    notified_telegram = Column(Boolean, default=False, index=True)
    schedule_work_hours = Column(String)
    schedule_lunch_break = Column(String)
    schedule_is_manual_pause = Column(Boolean)
    schedule_tracking_active = Column(Boolean)
    employee = relationship("Employee", lazy="joined")
    camera = relationship("Camera")

# --- Internal State ---
_tg_cfg: Dict[str, Any] = {}
_first_start_processed = False # Flag to ensure old alerts are flushed only once
_last_known_schedule_status: Optional[str] = None # Tracks 'work_hours', 'lunch_break', 'off_hours'
_conversation_state: Dict[int, Dict[str, Any]] = {} # {chat_id: {state: 'awaiting_date', data: {}}}
_bot_active_chats = set() # Menyimpan chat_id yang sudah mengaktifkan bot
_last_update_id = 0

def _safe_name(name: Optional[str]) -> str:
    """Replicates the safe name logic from app.py for directory naming."""
    try:
        s = (name or '').strip()
        if not s:
            return 'unknown'
        cleaned = ''.join(ch for ch in s if ch.isalnum() or ch in (' ', '-', '_'))
        cleaned = '_'.join(part for part in cleaned.split())
        return cleaned[:64]
    except Exception:
        return 'unknown'

def get_latest_capture_path(cam_id: int) -> Optional[str]:
    """Get path to latest capture file for given camera ID."""
    try:
        captures_dir = os.path.join(BASE_DIR, 'captures', str(cam_id))
        if not os.path.isdir(captures_dir):
            return None

        # List all .jpg files
        files = [f for f in os.listdir(captures_dir) if f.lower().endswith('.jpg')]
        if not files:
            return None

        # Sort by filename (timestamp format: YYYYMMDD_HHMMSS.jpg)
        files.sort()
        latest_file = files[-1]

        return os.path.join(captures_dir, latest_file)
    except Exception as e:
        print(f"[get_latest_capture_path] Error for cam {cam_id}: {e}")
        return None

def load_tg_config() -> Dict[str, Any]:
    """Loads the Telegram configuration from JSON file."""
    global _tg_cfg
    try:
        with open(TG_CONFIG_PATH, 'r', encoding='utf-8') as f:
            _tg_cfg = json.load(f) or {}
    except Exception as e:
        print(f"[Error] Could not load config/config_telegram.json: {e}")
        _tg_cfg = {}
    return _tg_cfg

_schedule_state_cache = {}
def _get_live_schedule_state() -> Dict[str, Any]:
    """Fetches the live schedule state from the main app's API."""
    global _schedule_state_cache
    try:
        with urllib.request.urlopen('http://127.0.0.1:5000/api/schedule/state', timeout=2.0) as resp:
            _schedule_state_cache = json.loads(resp.read().decode())
            return _schedule_state_cache
    except Exception:
        # On failure, return last known good state or a default
        return _schedule_state_cache or {'tracking_active': True, 'suppress_alerts': False}

def _is_alertable_time(ts_utc: dt.datetime) -> bool:
    """Checks if a UTC timestamp falls within the alertable work schedule (WIB)."""
    try:
        # Instead of reading a static file, get the live state from the app.
        # This respects manual pauses and auto-schedule toggles.
        schedule_state = _get_live_schedule_state()
        is_tracking_active = schedule_state.get('tracking_active', True)
        are_alerts_suppressed = schedule_state.get('suppress_alerts', False)
        # An alert should only be sent if tracking is active AND alerts are not suppressed.
        return is_tracking_active and not are_alerts_suppressed
    except Exception:
        return True # Default to true if schedule parsing fails

def send_telegram_message(chat_id: str, message: str, bot_token: str, reply_markup: Optional[Dict] = None) -> bool:
    """Sends a message to a specific Telegram chat."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        'chat_id': chat_id,
        'text': message,
        'parse_mode': 'HTML',
        'disable_web_page_preview': True,
    }
    if reply_markup:
        payload['reply_markup'] = reply_markup
    headers = {'Content-Type': 'application/json'}
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            if resp.getcode() != 200:
                print(f"[Telegram] Send failed to {chat_id}: {resp.read().decode()}")
                return False
            return True
    except Exception as e:
        print(f"[Telegram] Send error to {chat_id}: {e}")
        return False

def send_telegram_photo(chat_id: str, photo_path: str, caption: str, bot_token: str) -> bool:
    """Sends a photo with a caption."""
    url = f"https://api.telegram.org/bot{bot_token}/sendPhoto"
    boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
    headers = {'Content-Type': f'multipart/form-data; boundary={boundary}'}
    
    parts = [
        f'--{boundary}', 'Content-Disposition: form-data; name="chat_id"', '', str(chat_id),
        f'--{boundary}', 'Content-Disposition: form-data; name="caption"', '', caption,
        f'--{boundary}', 'Content-Disposition: form-data; name="parse_mode"', '', 'HTML',
        f'--{boundary}', f'Content-Disposition: form-data; name="photo"; filename="{os.path.basename(photo_path)}"', 'Content-Type: image/jpeg', ''
    ]
    data = '\r\n'.join(parts).encode('utf-8')
    with open(photo_path, 'rb') as f:
        data += b'\r\n' + f.read() + b'\r\n'
    data += f'--{boundary}--\r\n'.encode('utf-8')

    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            return 200 <= resp.getcode() < 300
    except Exception as e:
        print(f"[Telegram] Photo send error: {e}")
        return False

def get_updates(bot_token: str, offset: int) -> List[Dict]:
    """Fetches new updates from Telegram using long polling."""
    url = f"https://api.telegram.org/bot{bot_token}/getUpdates?offset={offset}&timeout=30"
    try:
        with urllib.request.urlopen(url, timeout=35.0) as resp:
            data = json.loads(resp.read().decode())
            return data.get('result', [])
    except Exception:
        return []

def handle_callback_query(query: Dict, bot_token: str):
    """Handles presses on inline keyboard buttons."""
    chat_id = query.get('message', {}).get('chat', {}).get('id')
    data = query.get('data', '')
    state_info = _conversation_state.get(chat_id)

    if not state_info:
        return

    if state_info['state'] == 'awaiting_date' and data.startswith('date_'):
        selected_date_str = data.split('_', 1)[1]
        state_info['data']['date'] = selected_date_str
        
        # Find employees with attendance on that date
        with SessionLocal() as db:
            employees = db.query(Employee).join(Attendance).filter(
                Attendance.date == dt.datetime.strptime(selected_date_str, '%Y-%m-%d').date()
            ).order_by(Employee.name).all()

        if not employees:
            send_telegram_message(chat_id, "Tidak ada data absensi untuk tanggal tersebut.", bot_token)
            _conversation_state.pop(chat_id, None)
            return

        # Create employee selection keyboard
        keyboard = {
            "inline_keyboard": [
                [{"text": f"{emp.name}", "callback_data": f"emp_{emp.id}"}] for emp in employees
            ]
        }
        send_telegram_message(chat_id, "Silakan pilih karyawan:", bot_token, reply_markup=keyboard)
        state_info['state'] = 'awaiting_employee'

    elif state_info['state'] == 'awaiting_employee' and data.startswith('emp_'):
        emp_id = int(data.split('_', 1)[1])
        date_str = state_info['data']['date']

        # Fetch and send the attendance preview
        send_attendance_preview(chat_id, emp_id, date_str, bot_token)
        _conversation_state.pop(chat_id, None) # End conversation

    elif state_info['state'] == 'awaiting_camera_selection' and data.startswith('cam_'):
        try:
            cam_id = int(data.split('_', 1)[1])

            # Get camera info from database
            with SessionLocal() as db:
                camera = db.get(Camera, cam_id)

            if not camera:
                send_telegram_message(chat_id, "❌ Kamera tidak ditemukan.", bot_token)
                _conversation_state.pop(chat_id, None)
                return

            # Get latest capture path
            capture_path = get_latest_capture_path(cam_id)

            if not capture_path or not os.path.isfile(capture_path):
                send_telegram_message(
                    chat_id,
                    f"⚠️ Tidak ada capture tersedia untuk {camera.name or f'CAM{cam_id}'}.",
                    bot_token
                )
                _conversation_state.pop(chat_id, None)
                return

            # Extract timestamp from filename (YYYYMMDD_HHMMSS.jpg)
            filename = os.path.basename(capture_path)
            timestamp_str = filename.replace('.jpg', '').replace('.JPG', '')
            try:
                timestamp = dt.datetime.strptime(timestamp_str, '%Y%m%d_%H%M%S')
                formatted_time = timestamp.strftime('%d %b %Y, %H:%M:%S')
            except:
                formatted_time = timestamp_str

            # Format caption
            area_name = camera.area or 'Area Unknown'
            cam_name = camera.name or f'CAM{cam_id}'
            caption = f"Berikut Capture di area {area_name}-{cam_name}:\n📸 Timestamp: {formatted_time}"

            # Send photo
            success = send_telegram_photo(chat_id, capture_path, caption, bot_token)

            if not success:
                send_telegram_message(chat_id, "❌ Gagal mengirim foto capture.", bot_token)

            _conversation_state.pop(chat_id, None) # End conversation

        except Exception as e:
            print(f"[Camera Capture Callback] Error: {e}")
            send_telegram_message(chat_id, "❌ Terjadi kesalahan saat mengambil capture.", bot_token)
            _conversation_state.pop(chat_id, None)

def send_attendance_preview(chat_id: int, emp_id: int, date_str: str, bot_token: str):
    """Fetches and sends the final attendance preview with images."""
    capture_dir = os.path.join(BASE_DIR, 'attendance_captures', date_str, str(emp_id))
    meta_path = os.path.join(capture_dir, 'meta.json')

    if not os.path.isdir(capture_dir) or not os.path.isfile(meta_path):
        send_telegram_message(chat_id, "Data capture tidak ditemukan untuk karyawan dan tanggal ini.", bot_token)
        return

    with open(meta_path, 'r') as f:
        meta = json.load(f)

    with SessionLocal() as db:
        emp = db.get(Employee, emp_id)
        emp_name = emp.name if emp else "Unknown"
        emp_code = emp.employee_code if emp else "N/A"

    send_telegram_message(chat_id, f"Berikut attendance report dari {emp_code} - {emp_name}:", bot_token)

    # First In
    first_in_data = meta.get('first_in')
    if first_in_data:
        # Correctly parse UTC timestamp and convert to local time (WIB)
        ts_utc = dt.datetime.fromisoformat(first_in_data['ts'].replace('Z', '+00:00'))
        wib_tz = dt.timezone(dt.timedelta(hours=7))
        ts_wib = ts_utc.astimezone(wib_tz)
        ts = ts_wib.strftime('%H:%M:%S')
        cam_str = f"{first_in_data.get('cam_name', '')} - {first_in_data.get('cam_area', '')}"
        caption = f"🟢 <b>First In</b>\nTimestamp: {ts}\nCamera: {cam_str}"
        img_path = os.path.join(capture_dir, first_in_data['file'])
        if os.path.isfile(img_path):
            send_telegram_photo(chat_id, img_path, caption, bot_token)
        else:
            send_telegram_message(chat_id, caption + "\n(Capture image not found)", bot_token)

    # Last Out
    last_out_data = meta.get('last_out')
    if last_out_data:
        # Correctly parse UTC timestamp and convert to local time (WIB)
        ts_utc = dt.datetime.fromisoformat(last_out_data['ts'].replace('Z', '+00:00'))
        wib_tz = dt.timezone(dt.timedelta(hours=7))
        ts_wib = ts_utc.astimezone(wib_tz)
        ts = ts_wib.strftime('%H:%M:%S')
        cam_str = f"{last_out_data.get('cam_name', '')} - {last_out_data.get('cam_area', '')}"
        caption = f"🔴 <b>Last Out</b>\nTimestamp: {ts}\nCamera: {cam_str}"
        img_path = os.path.join(capture_dir, last_out_data['file'])
        if os.path.isfile(img_path):
            send_telegram_photo(chat_id, img_path, caption, bot_token)
        else:
            send_telegram_message(chat_id, caption + "\n(Capture image not found)", bot_token)

def process_updates(bot_token: str):
    """Handles incoming commands like /start."""
    global _last_update_id, _bot_active_chats
    
    updates = get_updates(bot_token, _last_update_id + 1)
    for update in updates:
        _last_update_id = update.get('update_id', _last_update_id)

        if 'callback_query' in update:
            handle_callback_query(update['callback_query'], bot_token)
            continue

        message = update.get('message') or update.get('edited_message')
        if not message:
            continue

        chat_id = message.get('chat', {}).get('id')
        text = message.get('text', '')

        command = text.strip().lower()

        if command.startswith('/start'):
            if chat_id not in _bot_active_chats:
                # Reset any lingering conversation state
                _conversation_state.pop(chat_id, None)
                global _first_start_processed
                if not _first_start_processed:
                    # On the very first /start, mark all old alerts as "sent"
                    print("First /start received. Flushing old alert logs...")
                    try:
                        with SessionLocal() as db:
                            db.query(AlertLog).filter(AlertLog.notified_telegram == False).update({'notified_telegram': True})
                            db.commit()
                        _first_start_processed = True
                        print("Old alerts flushed. Bot is now live.")
                    except Exception as e:
                        print(f"[Error] Failed to flush old alerts: {e}")

                print(f"Bot activated in chat ID: {chat_id}")
                _bot_active_chats.add(chat_id)
                response_message = "Haloo..👋🏼\nGSPE Monitoring Bot sudah aktif dan siap memantau laporan."
                send_telegram_message(chat_id, response_message, bot_token)
        elif command.startswith('/stop'):
            if chat_id in _bot_active_chats:
                _conversation_state.pop(chat_id, None)
                print(f"Bot paused in chat ID: {chat_id}")
                _bot_active_chats.discard(chat_id)
                response_message = "Bot telah di-Jeda ⏳"
                send_telegram_message(chat_id, response_message, bot_token)
        elif command.startswith('/status'):
            try:
                state = _get_live_schedule_state()
                status_str = _get_status_string(state)
                status_map = {
                    'work_hours': 'Work Hours',
                    'lunch_break': 'Lunch Break',
                    'off_hours': 'Off Hours'
                }
                display_status = status_map.get(status_str, 'Unknown')
                response_message = f"Status schedule system saat ini sedang <b>{display_status}</b>."
                send_telegram_message(chat_id, response_message, bot_token)
            except Exception as e:
                print(f"[Status Command] Error: {e}")
        elif command.startswith('/attendance'):
            # Start the attendance report flow
            _conversation_state[chat_id] = {'state': 'awaiting_date', 'data': {}}
            
            today = dt.date.today()
            yesterday = today - dt.timedelta(days=1)
            day_before = today - dt.timedelta(days=2)

            keyboard = {
                "inline_keyboard": [
                    [{"text": f"Hari Ini ({today.strftime('%d %b')})", "callback_data": f"date_{today.isoformat()}"}],
                    [{"text": f"Kemarin ({yesterday.strftime('%d %b')})", "callback_data": f"date_{yesterday.isoformat()}"}],
                    [{"text": f"2 Hari Lalu ({day_before.strftime('%d %b')})", "callback_data": f"date_{day_before.isoformat()}"}]
                ]
            }
            send_telegram_message(chat_id, "Silakan pilih tanggal untuk laporan absensi:", bot_token, reply_markup=keyboard)
        elif command.startswith('/capture'):
            # Start the camera capture flow
            try:
                with SessionLocal() as db:
                    cameras = db.query(Camera).all()

                if not cameras:
                    send_telegram_message(chat_id, "⚠️ Tidak ada kamera yang tersedia.", bot_token)
                    return

                # Set conversation state
                _conversation_state[chat_id] = {'state': 'awaiting_camera_selection', 'data': {}}

                # Create inline keyboard with camera list
                keyboard = {
                    "inline_keyboard": [
                        [{"text": f"{cam.area or 'Area'} - {cam.name or f'CAM{cam.id}'}", "callback_data": f"cam_{cam.id}"}]
                        for cam in cameras
                    ]
                }

                send_telegram_message(chat_id, "📷 Silakan pilih kamera untuk melihat capture terakhir:", bot_token, reply_markup=keyboard)
            except Exception as e:
                print(f"[Capture Command] Error: {e}")
                send_telegram_message(chat_id, "❌ Terjadi kesalahan saat memuat daftar kamera.", bot_token)

def poll_and_send_alerts(bot_token: str):
    """Periodically checks the database for new alerts and sends them."""
    if not _bot_active_chats:
        return # Do nothing if no chat has activated the bot

    with SessionLocal() as db:
        # Ambil 10 log terbaru yang belum dikirim, dan muat data employee terkait
        alerts_to_send = db.query(AlertLog).filter(
            AlertLog.notified_telegram == False
        ).options(
            joinedload(AlertLog.employee),
            joinedload(AlertLog.camera)
        ).order_by(AlertLog.timestamp.asc()).limit(10).all()

        if not alerts_to_send:
            return

        print(f"Found {len(alerts_to_send)} new alert(s) to send.")

        for log in alerts_to_send:
            emp = log.employee
            emp_name = emp.name if emp else f"Emp ID {log.employee_id}"
            emp_code = emp.employee_code if emp else "N/A"
            dept = emp.department if emp else "-"
            
            # Format waktu ke zona waktu lokal (asumsi server di WIB)
            try:
                # Timestamp dari DB adalah UTC, konversi ke WIB (UTC+7)
                log_time_utc = log.timestamp.replace(tzinfo=dt.timezone.utc)
                wib_tz = dt.timezone(dt.timedelta(hours=7))
                log_time_wib = log_time_utc.astimezone(wib_tz)
                date_part = log_time_wib.strftime('%d-%m-%Y')
                time_part = log_time_wib.strftime('%H:%M:%S')
            except Exception:
                date_part = log.timestamp.strftime('%d-%m-%Y')
                time_part = log.timestamp.strftime('%H:%M:%S')

            # Build camera string with name and area
            cam_name = log.camera.name if log.camera and log.camera.name else None
            cam_area = log.camera.area if log.camera and log.camera.area else None
            cam_str = "Unknown"
            if cam_name and cam_area:
                cam_str = f"{cam_name} - {cam_area}"
            elif cam_name or cam_area:
                cam_str = cam_name or cam_area

            # Format pesan sesuai permintaan
            if log.alert_type == 'ENTER':
                # Pesan asli: "John Doe back to area after 5 min"
                # Kita ambil bagian "after 5 min"
                duration_part = ""
                if log.message:
                    try: duration_part = log.message.split('back to area', 1)[-1].strip()
                    except Exception: pass
                tg_msg = f"=== ALERT ===\n🟢 <b>ENTER:</b> {emp_code} - {emp_name} back to area {duration_part}\n\n<b>Department:</b> {dept}\n<b>Camera:</b> {cam_str}\n<b>Date:</b> {date_part}\n<b>Time:</b> {time_part} WIB"
            elif log.alert_type == 'New Employee':
                # Build the text message first
                caption = f"=== ALERT ===\nNew employee has entered the area. Welcome {emp_code} - {emp_name}\n\n<b>Department:</b> {dept}\n<b>Camera:</b> {cam_str}\n<b>Date:</b> {date_part}\n<b>Time:</b> {time_part} WIB"
                
                # Try to find and send a photo
                photo_sent = False
                try:
                    # Find the 'front' pose template for this employee
                    front_template = db.query(FaceTemplate).filter(
                        FaceTemplate.employee_id == log.employee_id,
                        FaceTemplate.pose_label == 'front'
                    ).order_by(FaceTemplate.id.desc()).first()

                    if front_template and emp:
                        img_dir = os.path.join(BASE_DIR, 'face_images', _safe_name(emp.name))
                        photo_path = os.path.join(img_dir, f"{front_template.id}.jpg")
                        if os.path.isfile(photo_path):
                            for chat_id in list(_bot_active_chats):
                                send_telegram_photo(chat_id, photo_path, caption, bot_token)
                            photo_sent = True
                except Exception as e:
                    print(f"[Telegram] Error finding photo for new employee: {e}")
                tg_msg = caption if not photo_sent else None # Set msg to None if photo was sent
            else: # EXIT
                duration_part = ""
                if log.message:
                    try: duration_part = log.message.split('out of area', 1)[-1].strip()
                    except Exception: pass
                tg_msg = f"=== ALERT ===\n🔴 <b>EXIT:</b> {emp_code} - {emp_name} out of area {duration_part}\n\n<b>Department:</b> {dept}\n<b>Camera:</b> {cam_str}\n<b>Date:</b> {date_part}\n<b>Time:</b> {time_part} WIB"

            # Kirim ke semua chat yang aktif
            # --- Alert Smartly Logic ---
            if tg_msg: # Only send text message if tg_msg is not None
                if _is_alertable_time(log.timestamp):
                    for chat_id in list(_bot_active_chats):
                        send_telegram_message(chat_id, tg_msg, bot_token)
                        time.sleep(0.1) # Jeda kecil antar pengiriman
            
            # Tandai sebagai sudah terkirim
            log.notified_telegram = True
        
        db.commit()

def listener_thread(bot_token: str):
    """Thread untuk mendengarkan perintah /start."""
    print("[Telegram Listener] Started. Waiting for /start command...")
    while True:
        try:
            process_updates(bot_token)
        except Exception as e:
            print(f"[Telegram Listener] Error: {e}")
            time.sleep(5) # Tunggu sebelum mencoba lagi jika ada error

def poller_thread(bot_token: str):
    """Thread untuk memeriksa dan mengirim notifikasi dari DB."""
    print("[Telegram Poller] Started. Will send alerts after activation.")
    while True:
        try:
            poll_and_send_alerts(bot_token)
        except Exception as e:
            print(f"[Telegram Poller] Error: {e}")
        time.sleep(5) # Periksa database setiap 5 detik

def main():
    """Fungsi utama untuk menjalankan bot Telegram."""
    print("Starting Telegram Bot...")
    config = load_tg_config()

    if not config.get('enabled'):
        print("Telegram bot is disabled in config/config_telegram.json. Exiting.")
        return

    bot_token = config.get('bot_token')
    if not bot_token or bot_token == 'YOUR_TELEGRAM_BOT_TOKEN':
        print("[Error] bot_token is not set in config/config_telegram.json. Exiting.")
        return

    # Jalankan listener dan poller di thread terpisah
    listener = threading.Thread(target=listener_thread, args=(bot_token,), daemon=True)
    poller = threading.Thread(target=poller_thread, args=(bot_token,), daemon=True)

    listener.start()
    poller.start()

    # Keep the main thread alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping Telegram Bot.")

def _get_status_string(state: Dict[str, Any]) -> str:
    """Determines a simple status string from the schedule state object."""
    if not state.get('tracking_active', False):
        return 'off_hours'
    if state.get('suppress_alerts', False):
        return 'lunch_break'
    return 'work_hours'

def schedule_monitor_thread(bot_token: str):
    """Periodically checks for schedule status changes and notifies active chats."""
    global _last_known_schedule_status
    print("[Schedule Monitor] Started.")
    
    # On first run, just set the initial state without notifying
    try:
        initial_state = _get_live_schedule_state()
        _last_known_schedule_status = _get_status_string(initial_state)
        print(f"[Schedule Monitor] Initial status is '{_last_known_schedule_status}'")
    except Exception:
        pass

    while True:
        # Check every 5 seconds for better responsiveness to manual actions
        time.sleep(5)
        try:
            current_state = _get_live_schedule_state()
            if not current_state: # Skip if API is down
                continue

            current_status = _get_status_string(current_state)

            if current_status != _last_known_schedule_status:
                print(f"[Schedule Monitor] Status changed from '{_last_known_schedule_status}' to '{current_status}'. Notifying...")
                message = ""
                if current_status == 'lunch_break':
                    message = "=== Status Update ===\nSchedule system sedang <b>Lunch Break</b> 🍽 \n\nSelamat makan siang.."
                elif current_status == 'off_hours':
                    message = "=== Status Update ===\nSchedule system sedang <b>Off Hours</b> 🌙 \n\nSampai jumpa.."
                elif current_status == 'work_hours':
                    message = "=== Status Update ===\nSchedule system sedang <b>Work Hours</b> 💼 \n\nSaatnya kembali bekerja.."
                
                if message:
                    for chat_id in list(_bot_active_chats):
                        send_telegram_message(chat_id, message, bot_token)
                
                _last_known_schedule_status = current_status
        except Exception as e:
            print(f"[Schedule Monitor] Error: {e}")

if __name__ == '__main__':
    # Load config once at the start
    config = load_tg_config()
    bot_token = config.get('bot_token')
    if bot_token and bot_token != 'YOUR_TELEGRAM_BOT_TOKEN':
        # Start the schedule monitor thread alongside the others
        schedule_monitor = threading.Thread(target=schedule_monitor_thread, args=(bot_token,), daemon=True)
        schedule_monitor.start()
    
    # Call the main function which handles other threads and the main loop
    main()