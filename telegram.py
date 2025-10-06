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
DB_FILE = os.path.join(BASE_DIR, 'db', 'attendance.db')
DATABASE_URL = f"sqlite:///{DB_FILE}"

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
    employee = relationship("Employee", lazy="joined")
    camera = relationship("Camera")

# --- Internal State ---
_tg_cfg: Dict[str, Any] = {}
_first_start_processed = False # Flag to ensure old alerts are flushed only once
_conversation_state: Dict[int, Dict[str, Any]] = {} # {chat_id: {state: 'awaiting_date', data: {}}}
_bot_active_chats = set() # Menyimpan chat_id yang sudah mengaktifkan bot
_last_update_id = 0

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
        cam = f"{first_in_data.get('cam_name', '')} - {first_in_data.get('cam_area', '')}"
        caption = f"🟢 <b>First In</b> \n🕒: {ts} \n📸: {cam}"
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
        cam = f"{last_out_data.get('cam_name', '')} - {last_out_data.get('cam_area', '')}"
        caption = f"🔴 <b>Last Out</b> \n🕒: {ts} \n📸: {cam}"
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
                response_message = "Haloo..👋🏼 \nGSPE Monitoring Bot sudah aktif dan siap memantau laporan."
                send_telegram_message(chat_id, response_message, bot_token)
        elif command.startswith('/stop'):
            if chat_id in _bot_active_chats:
                _conversation_state.pop(chat_id, None)
                print(f"Bot paused in chat ID: {chat_id}")
                _bot_active_chats.discard(chat_id)
                response_message = "Bot telah di-Jeda ⏳"
                send_telegram_message(chat_id, response_message, bot_token)
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
                try:
                    duration_part = log.message.split('back to area', 1)[-1].strip()
                except (AttributeError, IndexError):
                    duration_part = ""
                tg_msg = f"🟢 <b>ENTER:</b> {emp_code} - {emp_name} back to area {duration_part}\n<b>Department:</b> {dept}\n<b>Camera:</b> {cam_str}\n<b>Date:</b> {date_part}\n<b>Time:</b> {time_part} WIB"
            else: # EXIT
                try:
                    duration_part = log.message.split('out of area', 1)[-1].strip()
                except (AttributeError, IndexError):
                    duration_part = ""
                tg_msg = f"🔴 <b>EXIT:</b> {emp_code} - {emp_name} out of area {duration_part}\n<b>Department:</b> {dept}\n<b>Camera:</b> {cam_str}\n<b>Date:</b> {date_part}\n<b>Time:</b> {time_part} WIB"
            
            # Kirim ke semua chat yang aktif
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

if __name__ == '__main__':
    main()