# Auto-Monitoring System Face Recognition & Tracking

An AI-powered, real-time employee monitoring and attendance tracking platform.  
It combines face recognition, CCTV stream analysis, and intelligent scheduling to automatically log attendance, detect policy violations, and provide live updates via web dashboard and Telegram bot.

---

## 🔍 Overview

The Auto-Monitoring System processes live RTSP CCTV streams, recognizes employees using deep-learning models (`insightface` + `onnxruntime-gpu`), and automatically records `First In`/`Last Out` times.  
The GSPE Auto-Monitoring System processes live RTSP CCTV streams, recognizes employees using deep-learning models (`insightface` + `onnxruntime-gpu`), and automatically records `First In`/`Last Out` times.  
It enforces work-hour policies, generates violation alerts, and supports both **automatic** and **manual** schedule modes.  
Users can monitor the system through a **web dashboard** or receive updates via a **Telegram bot**.

---

## ✨ Key Features

### 🎥 Real-time Face Recognition
- Detects and identifies employees from multiple RTSP cameras.
- Tracks faces with IOU-based association and temporal ID smoothing.
- Performs face quality gating (blur, brightness, and size thresholds).
- Multi-pose registration (front, left, right) for robust recognition.

### 🕐 Automated Attendance Tracking
- Automatically captures and stores:
  - `first_in.jpg` and `last_out.jpg` per employee per day.
- Supports delayed last-out stabilization and configurable overwrite policy.
- Cleans old attendance captures with a daily retention job.

### 🧠 Advanced Schedule Control
- Define work hours and lunch breaks.
- Switch between auto-schedule and manual override.
- Temporarily pause the system (e.g., maintenance or breaks).
- Historical accuracy: violations are always computed against the rules active *at event time*.

### 🚨 Violation & Alert Reporting
- Detects unexpected `EXIT` events during work hours.
- Alerts stored with contextual metadata (schedule state, timestamp).
- Notification rate control to prevent database flooding.
- Off-hours gating to suppress irrelevant alerts.

### 🖥️ Live Web Dashboard
- Modern, responsive interface (Tailwind CSS).
- Live camera feeds with AI overlay and employee status.
- Management panels for employees, cameras, and schedules.
- Real-time Socket.IO updates and alert badge indicators.
- Reporting tools with daily attendance, alert logs, and maintenance options.

### 📲 Interactive Telegram Bot
- Independent, multi-threaded process (`telegram.py`).
- Sends real-time ENTER/EXIT alerts to groups or individual chats.
- `/status` – returns system state (online/offline, schedule mode).
- `/attendance` – fetches attendance reports with photos.
- Announces schedule changes and supports multiple chats concurrently.

### 🗄️ Persistent Data Storage
- SQLite database (`attendance.db`) via SQLAlchemy ORM.
- Core tables: employees, face_templates, cameras, events, attendances, alert_logs, presence.
- Includes maintenance tasks (event purge, daily retention).

## System Architecture

## 🧩 System Architecture

```
                 +-------------------------+
                 |   RTSP Camera Streams   |
                 +-----------+-------------+
                             |
                             v
+-----------------------------------------------------------------------+
|   +-----------------------+        +--------------------------------+ |
|   |    module_AI.py       |------->|             app.py             | |
|   | (Face Engine/Tracker) |        | (Flask API, Web UI, SocketIO)  | |
|   +-----------------------+        +--------------------------------+ |
|          ^          |                      |            |             |
|          |          |                      |            v             |
|          |          +------> attendance.db <+     Web Dashboard       |
|          |                                        (Browser Client)    |
+-----------------------------------------------------------------------+
                             |
                             v
                    +-----------------------+
                    |     telegram.py       |
                    | (Standalone Bot Proc) |
                    +-----------+-----------+
                                |
                                v
                    +-----------------------+
                    |   Telegram API/Group  |
                    +-----------------------+
```

**Modules:**
- **`module_AI.py`** – Handles video decoding, face recognition, tracking, and live presence state.
- **`app.py`** – Flask web server providing REST APIs, business logic, and Socket.IO events.
- **`database_models.py`** – SQLAlchemy schema for all persistent entities.
- **`telegram.py`** – Asynchronous Telegram bot; polls and listens independently.
- **`attendance.db`** – Local SQLite database for all runtime records.

---

## ⚙️ Installation & Setup

Refer to `Installation.md` for a complete guide (RTX 5090 server, CUDA 12.x, Docker/WSL notes).

### Quick Prerequisites
- Python 3.10+
- RTSP cameras or streams (H.264 recommended)
- Modern web browser

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd AutoMonitoring-FR
   ```

2. **Create Virtual Environment & Install Dependencies**
   ```bash
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```
   Key packages: Flask(+SocketIO), SQLAlchemy, OpenCV, InsightFace/ONNX Runtime, NumPy.
   
   *Ensure a compatible NVIDIA driver and CUDA toolkit for `onnxruntime-gpu`.*

4. **Initialize Database**
   ```bash
   python database_models.py
   ```

5. **Configure Components**
   - **Cameras:** `camera_configs/CAM1/config.json`
   - Create camera configs in `camera_configs/CAM{ID}/config.json`
   - Example config:
```json
{
    "id": 1,
    "name": "Main Entrance",
    "rtsp_url": "rtsp://192.168.1.100:554/stream",
    "enabled": true,
    "location": "Entrance Zone"
}
```
   - **Telegram Bot:** `config/config_telegram.json`
   - **AI Parameters:** `config/parameter_config.json`

5. **Run Web Application**
   ```bash
   python app.py
   ```
   Dashboard → `http://0.0.0.0:5000`

6. **Run Telegram Bot**
   ```bash
   python telegram.py
   ```

## Configuration

### Camera Configuration
Cameras are configured via JSON files in `camera_configs/` directory:

```
camera_configs/
├── CAM1/
│   └── config.json
├── CAM2/
│   └── config.json
├── CAM3/
│   └── config.json
└── .../
```

### AI & Runtime Parameters
Most runtime parameters are in `config/parameter_config.json`. Important keys:
- `providers`: "CUDAExecutionProvider, CPUExecutionProvider"
- `fps_target`, `stream_max_width`, `jpeg_quality`
- `use_gstreamer_rtsp`, `rtsp_protocol` (tcp|udp), `gst_latency_ms`
- Tracking: `tracker_iou_threshold`, `tracker_max_misses`, smoothing keys
- Presence: `tracking_timeout`, `present_timeout_sec`
- Alerts: `alert_min_interval_sec`
- Attendance: `attendance_first_in_overwrite_enabled`, `attendance_last_out_delay_sec`, `attendance_captures_retention_days`

## Usage

### Employee Registration
1. Navigate to Settings → Manage Employee
2. Click "Add Employee"
3. Fill employee details
4. Use face capture to register employee's face
5. Save to complete registration

### Camera Management
1. Go to Settings → Manage Camera
2. Add new cameras with RTSP URLs
3. Enable/disable cameras as needed
4. Test camera connections

### Live Monitoring
1. Select camera from CCTV page
2. Monitor AI inference status (green = online, red = offline)
3. View real-time employee tracking
4. Check notifications for alerts

### Report: Reset Logs
1. Open the Report page on the dashboard.
2. Click the “Reset Logs” button.
3. Select the table (Both / Events only / Alert Logs only).
4. Optional: select From and To Date (YYYY-MM-DD). Leave blank to delete all.
5. Confirm. The system will display the number of rows deleted.

### Attendance Captures Report
- Endpoint: `GET /api/report/attendance_captures?employee_id=ID&date=YYYY-MM-DD`
- Mengembalikan URL `first_in` dan `last_out` jika ada.

### Alert Management
- Alerts automatically generated when employees absent >60s
- View current alerts in notification dropdown
- Alert history stored in database
- Alerts resolved when employees return

#### Telegram Bot
Open the Telegram app.
1. Search for and start a chat with the bot: @gspe_automonitoring_bot.
2. Send the command /start to begin receiving alerts.
3. Send /attendance to request an attendance report.
4. Use /stop to stop notifications in that chat.
#### Technical Notes
- Bot runs separately (`telegram.py`).
- Polls database every 5 seconds for new alerts, marks as sent after delivery.
- Attendance report pulls meta and images from local storage.
- All DB operations isolated for robustness.

## Database Schema

### Core Tables
- **employees**: Employee master data
- **face_templates**: Face recognition embeddings
- **cameras**: Camera configuration
- **events**: Detection event logs
- **presence**: Real-time presence status
- **attendances**: Daily attendance records
- **alert_logs**: Alert notification history

### Key Relationships
```sql
Employee 1:N FaceTemplate
Employee 1:N Event
Employee 1:1 Presence
Employee 1:N Attendance
Employee 1:N AlertLog
Camera 1:N Event
```

## 🔗 Core API Endpoints

| Method | Endpoint | Description |
|--------|-----------|-------------|
| GET | `/api/cameras` | List all cameras |
| GET | `/api/employees` | List all employees |
| POST | `/api/employees` | Add employee |
| POST | `/api/employees/<id>/face_templates` | Register face |
| GET | `/api/report/attendance` | Get attendance summary |
| GET | `/api/report/alerts` | Retrieve alert logs |
| GET | `/api/schedule/state` | Get current schedule |
| POST | `/api/schedule/mode` | Switch schedule mode |
| POST | `/api/schedule/pause` | Temporarily suspend monitoring |
| POST | `/api/system/restart` | Restart system |
| POST | `/api/system/shutdown` | Shut down application |

## Maintenance

### Daily Maintenance
The system automatically performs daily maintenance:
- Purges old Event records (keeps only current day)
- Attendance captures retention (remove old `attendance_captures/YYYY-MM-DD` beyond retention days)
- Runs at startup and scheduled at midnight
- Prevents database bloat

### Manual Maintenance
```bash
# Reinitialize database
python database_models.py

# Check system status
# Monitor logs in console output
```

## 🧹 Maintenance & Troubleshooting

**Automatic Tasks:**
- Daily event purge.
- Retention cleanup for attendance captures.
- Startup consistency checks.

**Manual Maintenance:**
```bash
python database_models.py  # Reinitialize DB
```

**Common Issues:**
- RTSP errors → check camera URL or encoding.
- GPU inference lag → adjust `fps_target` or use lower resolution.
- Recognition drift → update face templates and adjust similarity threshold.

## Development

### Project Structure

```
AutoMonitoring-FR/
├── app.py                   # Flask web server & API
├── module_AI.py             # Face recognition & tracking engine
├── telegram.py              # Telegram bot process
├── database_models.py       # SQLAlchemy models & DB init
├── config/
│   ├── parameter_config.json   # AI/runtime parameters
│   ├── config_telegram.json    # Telegram bot config
│   └── tracking_mode.json      # Schedule/tracking mode
├── camera_configs/
│   ├── CAM1/
│   │   └── config.json         # CAM1 camera config
│   ├── CAM2/
│   │   └── config.json         # CAM2 camera config
│   └── .../
├── db/
│   └── attendance.db           # SQLite database file
├── templates/                  # Frontend HTML templates
├── static/                     # Static files (JS, CSS, images)
├── attendance_captures/        # Attendance photos (first_in, last_out)
├── Dockerfile                  # Docker build config
├── docker-compose.yaml         # Multi-container orchestration
└── Installation.md             # Installation guide
```

### Adding New Features
1. Update database models in `database_models.py`
2. Add API endpoints in `app.py`
3. Implement AI logic in `module_AI.py`
4. Update frontend in `templates/index.html`

### Testing
- Test camera connections via Settings page
- Verify face recognition with known employees
- Check alert generation and resolution (with schedule gating)
- Verify attendance captures are created on ENTER/EXIT
- Monitor WhatsApp deliveries (if enabled) and server logs

## 🔒 Security Considerations
- RTSP credentials are server-side only.
- Use environment variables for tokens (Telegram, WhatsApp).
- Restrict access to `attendance.db` and system ports.
- HTTPS and authentication recommended for production.

## Performance & Latency Optimization

- Use GPU (CUDAExecutionProvider) and keep GPU in persistence mode
- Prefer RTSP UDP + shorter GOP (I-frame interval ~1–2× FPS) for low latency
- Adjust `fps_target`, `stream_max_width`, `annotation_stride`, `frame_skip`
- Use `use_gstreamer_rtsp: true` and tune `gst_latency_ms` on Linux
- Database indexing on frequently queried columns

## License

[Specify your license here]

## Support

For technical support or questions:
- Check troubleshooting section
- Review console logs
- Contact development team

## Changelog

### Version 3.0
- Real-time alert logging and resolution
- Daily database maintenance
- Improved AI status indicator
- Enhanced notification system
- Modern responsive UI

### Version 3.1
- Added IOU-based tracking-by-detection and temporal ID smoothing
- Implemented face quality gating (blur/brightness/size) before voting
- Added event rate control to reduce Event table spam
- New admin API and UI to reset Events/Alert Logs by date range

### Version 3.2
- Attendance captures (First-In/Last-Out) with overwrite and delayed Last-Out
- Daily retention job for `attendance_captures/`
- Off-hours/pause gating for alert/capture suppression
- Optional WhatsApp notifications to Supervisors (Meta Cloud API)
- Dockerized deployment (RTX 5090), WSL/Windows notes

---

**© PT GSPE – Intelligent Vision Systems for Workforce Automation**
