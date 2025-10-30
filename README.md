# Auto-Monitoring System Face Recognition & Tracking

An AI-powered, real-time employee monitoring and attendance tracking platform.  
It combines face recognition, CCTV stream analysis, and intelligent scheduling to automatically log attendance, detect policy violations, and provide live updates via web dashboard and Telegram bot.

---

## 🔍 Overview

The Auto-Monitoring System processes live RTSP CCTV streams, recognizes employees using deep-learning models (`insightface` + `onnxruntime-gpu`), and automatically records `First In`/`Last Out` times.  
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
- Independent, multi-threaded process (`telegram.py`) with PostgreSQL integration.
- Sends real-time ENTER/EXIT alerts to groups or individual chats.
- **Interactive command flows** with inline keyboards and callback queries:
  - `/start` – Activate bot notifications (flushes old alerts on first use)
  - `/stop` – Pause bot notifications
  - `/help` – Display comprehensive command guide
  - `/status` – Real-time system statistics (employees, cameras, attendance, alerts)
  - `/attendance` – Interactive date/employee selection with First In/Last Out photos
  - `/capture` – Camera selection with latest snapshot delivery
  - `/export_data` – Multi-step Excel report export (Attendance/Alerts)
- Conversation state management for concurrent multi-user interactions.
- Announces schedule changes and supports multiple chats concurrently.

### 📊 Excel Report Export
- Export attendance and alert reports to Excel format (.xlsx).
- Server-side generation using OpenPyXL 3.1.2 with formatted headers and auto-sized columns.
- Accessible via:
  - **Web Dashboard**: "Export Excel" buttons below report tables
  - **Telegram Bot**: `/export_data` command with interactive filtering
- Supports date range filtering, employee filtering, and automatic cleanup.

### 🗄️ Persistent Data Storage
- **PostgreSQL database** via SQLAlchemy ORM with optimized connection pooling.
- Environment-based configuration (POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD).
- Core tables: employees, face_templates, cameras, events, attendances, alert_logs, presence.
- Enhanced schema with entry_type tracking (AUTO/MANUAL/SYSTEM) for attendance records.
- Includes automated maintenance tasks (event purge, daily retention, old capture cleanup).

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
- **`app.py`** – Flask web server providing REST APIs, business logic, Socket.IO events, and Excel exports.
- **`database_models.py`** – SQLAlchemy schema with PostgreSQL connection for all persistent entities.
- **`telegram.py`** – Independent Telegram bot with interactive command flows and state management.
- **PostgreSQL Database** – Production-grade database server (external, not SQLite file).

---

## ⚙️ Installation & Setup

Refer to `Installation.md` for a complete guide (RTX 5090 server, CUDA 12.x, Docker/WSL notes).

### Quick Prerequisites
- Python 3.10.18 (recommended via conda)
- PostgreSQL 12+ database server
- NVIDIA GPU with CUDA 12.x (for GPU acceleration)
- RTSP cameras or streams (H.264 recommended)
- Modern web browser

### Installation Steps

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd AutoMonitoring-FR
   ```

2. **Create Conda Environment & Install Dependencies**
   ```bash
   # Create conda environment (recommended over venv)
   conda create -p ./env python=3.10.18
   conda activate ./env

   # Install Python dependencies
   pip install -r requirements.txt
   ```

   **Key packages**: Flask 2.3.3, Flask-SocketIO 5.3.5, SQLAlchemy 2.0.20, OpenCV 4.8.0, InsightFace 0.7.3, ONNX Runtime GPU 1.20.1, OpenPyXL 3.1.2, psycopg2-binary, NumPy, Albumentations.

   *Ensure a compatible NVIDIA driver and CUDA 12.x toolkit for `onnxruntime-gpu`.*

3. **Setup PostgreSQL Database**
   ```bash
   # Install PostgreSQL (if not already installed)
   # Ubuntu/Debian: sudo apt install postgresql postgresql-contrib
   # Windows: Download from https://www.postgresql.org/download/

   # Create database and user
   sudo -u postgres psql
   CREATE DATABASE FR;
   CREATE USER postgres WITH PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE FR TO postgres;
   \q

   # Set environment variables (or edit database_models.py)
   export POSTGRES_HOST=localhost
   export POSTGRES_DB=FR
   export POSTGRES_USER=postgres
   export POSTGRES_PASSWORD=your_secure_password
   ```

4. **Initialize Database Schema**
   ```bash
   python database_models.py
   ```

   This creates all required tables (employees, face_templates, cameras, events, attendances, alert_logs, presence).

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
- **`providers`**: `"TensorrtExecutionProvider, CUDAExecutionProvider, CPUExecutionProvider"`
  - TensorRT: Highest performance with optimized engine caching (~10-20% faster after first run)
  - CUDA: Fallback for models not optimized by TensorRT
  - CPU: Emergency fallback
- **Stream settings**: `fps_target`, `stream_max_width`, `jpeg_quality`
- **RTSP optimization**: `use_gstreamer_rtsp`, `rtsp_protocol` (tcp|udp), `gst_latency_ms`
- **Tracking**: `tracker_iou_threshold`, `tracker_max_misses`, smoothing keys
- **Presence**: `tracking_timeout`, `present_timeout_sec`
- **Alerts**: `alert_min_interval_sec`
- **Attendance**: `attendance_first_in_overwrite_enabled`, `attendance_last_out_delay_sec`, `attendance_captures_retention_days`

**Note**: TensorRT engines are cached in `_tensorrt_cache/` directory. First run will be slower as engines are generated.

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
- Alerts automatically generated when employees absent >60s during work hours
- View current alerts in notification dropdown with real-time updates
- Alert history stored in database with schedule context
- Alerts auto-resolved when employees return
- Export alert logs to Excel via Reports page or Telegram bot

### Exporting Reports

#### Via Web Dashboard
1. Navigate to Reports page
2. Load attendance data (select date) or alert logs (select date range)
3. Click "Export Excel" button below the table
4. Excel file (.xlsx) downloads automatically with current filters applied
5. File includes formatted headers, auto-sized columns, and all filtered data

#### Via Telegram Bot
1. Send `/export_data` to the bot
2. Select report type: [Attendance Report] or [Alert Logs]
3. Filter by employee: [All Employees] or select specific employee
4. Choose date range: [Today], [Yesterday], [Last 7 Days], or [Last 30 Days]
5. Bot generates Excel file and sends as document attachment
6. File includes metadata caption (report name, filters, row count)

#### Telegram Bot Commands
Open the Telegram app and search for your bot:
1. **`/start`** – Activate bot notifications (flushes old alerts on first use)
2. **`/help`** – Display comprehensive command guide
3. **`/status`** – View system statistics (active employees, cameras, today's attendance/alerts)
4. **`/attendance`** – Interactive flow:
   - Select date (Today/Yesterday/2 Days Ago)
   - Select employee from list
   - Receive First In and Last Out photos with timestamps and camera locations
5. **`/capture`** – Interactive flow:
   - Select camera from list
   - Receive latest snapshot with timestamp
6. **`/export_data`** – Multi-step Excel export (see above)
7. **`/stop`** – Pause bot notifications in current chat

#### Technical Notes
- Bot runs separately (`telegram.py`) with independent PostgreSQL connection.
- Polls database every 5 seconds for new alerts, marks as sent after delivery.
- Conversation state management supports concurrent multi-user interactions.
- Callback queries acknowledged immediately to prevent timeouts.
- Temporary Excel files auto-cleaned after delivery.

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
| GET | `/api/employees` | List all employees with presence status |
| POST | `/api/employees` | Add new employee |
| POST | `/api/employees/<id>/face_templates` | Register face (multi-pose) |
| DELETE | `/api/employees/<id>` | Delete employee |
| GET | `/api/report/attendance?date=YYYY-MM-DD&format=xlsx` | Get attendance summary (JSON or Excel) |
| GET | `/api/report/attendance_captures?employee_id=ID&date=YYYY-MM-DD` | Get first in/last out photos |
| GET | `/api/report/alerts?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&format=xlsx` | Retrieve alert logs (JSON or Excel) |
| GET | `/api/schedule/state` | Get current schedule state |
| POST | `/api/schedule/mode` | Switch between auto/manual mode |
| POST | `/api/schedule/pause` | Temporarily pause monitoring |
| POST | `/api/schedule/save` | Update work hours and lunch breaks |
| GET | `/api/system/uptime` | Get system uptime in seconds |
| POST | `/api/system/restart` | Restart AI threads |
| POST | `/api/system/shutdown` | Graceful shutdown |
| GET | `/api/config/params` | Get AI/runtime parameters |
| POST | `/api/config/params` | Update parameters (requires restart) |

**Excel Export**: Add `?format=xlsx` to attendance or alerts endpoints for Excel file download.

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
python database_models.py  # Reinitialize PostgreSQL schema

# Backup PostgreSQL database
pg_dump -U postgres -d FR > backup_$(date +%Y%m%d).sql

# Restore PostgreSQL database
psql -U postgres -d FR < backup_20241027.sql
```

**Common Issues:**
- **RTSP errors** → Check camera URL, encoding (H.264 recommended), network connectivity
- **GPU inference lag** → Reduce `fps_target`, lower `stream_max_width`, or adjust `detection_size`. Consider switching to TensorRT provider for 10-20% performance gain.
- **Recognition drift** → Update face templates (re-register with current lighting/angles), adjust `recognition_threshold`
- **Telegram bot not sending** → Verify bot token, chat IDs in `config/config_telegram.json`, and that `telegram.py` is running. Check if user activated bot with `/start` command.
- **PostgreSQL connection errors** → Verify credentials in environment variables or `database_models.py` (POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD)
- **Excel export fails** → Ensure `openpyxl==3.1.2` is installed. Check temp directory write permissions (`/tmp` or `%TEMP%`).
- **Telegram `/export_data` timeout** → Large date ranges may cause timeouts. Use smaller ranges or filter by specific employee.
- **Frame capture lag** → Enable GStreamer (`use_gstreamer_rtsp: true`), reduce `stream_max_width`, or lower `fps_target`

## Development

### Project Structure

```
AutoMonitoring-FR/
├── app.py                      # Flask web server, REST APIs, Excel exports
├── module_AI.py                # Face recognition & tracking engine
├── telegram.py                 # Telegram bot with interactive flows
├── database_models.py          # SQLAlchemy models & PostgreSQL connection
├── add_entry_type_column.py    # Database migration script
├── config/
│   ├── parameter_config.json   # AI/runtime parameters
│   ├── config_telegram.json    # Telegram bot config
│   └── tracking_mode.json      # Schedule state persistence
├── camera_configs/
│   ├── CAM1/
│   │   └── config.json         # CAM1 camera config
│   ├── CAM2/
│   │   └── config.json         # CAM2 camera config
│   └── .../
├── attendance_captures/        # Daily attendance photos
│   └── YYYY-MM-DD/
│       └── {employee_id}/
│           ├── first_in.jpg
│           ├── last_out.jpg
│           └── meta.json       # Capture metadata (timestamp, camera)
├── captures/                   # Latest camera frames (rolling cache)
│   └── {cam_id}/
│       └── latest.jpg
├── face_images/                # Registered face templates (multi-pose)
│   └── {employee_name}/
│       ├── front.jpg
│       ├── left.jpg
│       └── right.jpg
├── _tensorrt_cache/            # TensorRT optimized engine cache
├── templates/                  # Frontend HTML templates
│   └── index.html              # Single-page application
├── static/                     # Static files (JS, CSS, images)
│   └── js/
│       ├── common.js           # Socket.IO setup
│       ├── cctv.js             # Live feeds & tracking
│       ├── reports.js          # Reports with auto-refresh
│       ├── settings.js         # Management panels
│       └── notifications.js    # Alert notifications
├── Dockerfile                  # Docker build config (CUDA 12.6)
├── docker-compose.yaml         # Multi-container orchestration
├── requirements.txt            # Python dependencies
├── CLAUDE.md                   # AI assistant guidance (detailed)
└── README.md                   # This file

[PostgreSQL Database]           # External PostgreSQL server
└── Database: FR
    ├── employees               # Employee master data
    ├── face_templates          # Face recognition embeddings
    ├── cameras                 # Camera configuration
    ├── events                  # Detection event logs
    ├── presence                # Real-time presence status
    ├── attendances             # Daily attendance records (with entry_type)
    └── alert_logs              # Alert notification history (with schedule context)
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
- **RTSP credentials**: Server-side only, not exposed to frontend
- **PostgreSQL**: Use strong passwords (change default `778899`), enable SSL connections for production
- **Environment variables**: Store sensitive tokens (Telegram bot token, PostgreSQL password) in environment variables
- **Database access**: Restrict PostgreSQL port (5432) to trusted IPs, use role-based access control (RBAC)
- **System ports**: Restrict access to Flask port (5000) with firewall rules
- **HTTPS**: Highly recommended for production deployment (use reverse proxy like Nginx)
- **Authentication**: Implement user authentication for web dashboard in production
- **Backup**: Regular PostgreSQL backups with encrypted storage

## Performance & Latency Optimization

### GPU Acceleration
- **Execution Providers**: `TensorrtExecutionProvider → CUDAExecutionProvider → CPUExecutionProvider`
  - **TensorRT**: Highest performance with optimized engine caching (~10-20% faster after first run)
  - **CUDA**: Fallback for models not optimized by TensorRT
  - **CPU**: Emergency fallback
- **TensorRT Cache**: Engines cached in `_tensorrt_cache/` directory. First run generates engines (slower), subsequent runs use cached engines (faster).
- **GPU Persistence Mode**: Keep GPU in persistence mode for reduced latency: `nvidia-smi -pm 1`
- **Docker**: Automatically includes NVIDIA Container Toolkit integration for GPU access

### RTSP Stream Optimization
- **Protocol**: Prefer UDP over TCP for lower latency (`rtsp_protocol: "udp"`)
- **GOP**: Use shorter GOP (I-frame interval ~1-2× FPS) on camera encoder settings
- **Resolution**: Adjust `stream_max_width` (default: 720) based on CPU/GPU capacity
- **FPS**: Tune `fps_target` (default: 8) to balance accuracy and performance
- **GStreamer**: Enable on Linux for better RTSP handling: `use_gstreamer_rtsp: true` with tuned `gst_latency_ms`

### Database Optimization
- **Connection Pooling**: Optimized pool settings (pool_size=10, max_overflow=20) for concurrent requests
- **Indexes**: Frequently queried columns indexed (employee_id, camera_id, timestamp)
- **Event Rate Control**: Prevents database spam with configurable minimum interval
- **Daily Purge**: Keeps Event table lean (retains only current day)
- **Query Optimization**: Eager loading with `joinedload()` for related entities

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

### Version 4.0 (October 2024)

#### Database Migration
- **PostgreSQL Migration**: Migrated from SQLite to PostgreSQL for production scalability, reliability, and performance
- **Enhanced Connection Pooling**: Optimized pool settings (pool_size=10, max_overflow=20) for better concurrent request handling
- **Database Schema Updates**:
  - Added `entry_type` column to `attendances` table (AUTO/MANUAL/SYSTEM) for tracking record sources
  - Enhanced `alert_logs` with schedule context fields (work_hours, lunch_break, tracking_active)
- **Query Optimization**: Added indexes and eager loading for frequently accessed relationships

#### New Features

**Excel Export System**
- Server-side Excel generation using OpenPyXL 3.1.2
- Support for both Attendance and Alert reports with formatted headers and auto-sized columns
- Accessible via web UI (Reports page) with "Export Excel" buttons below tables
- Integrated into Telegram bot via `/export_data` command
- Filtered exports by date range and employee
- Automatic cleanup of temporary files after delivery

**Enhanced Telegram Bot**
- **Interactive Command Flows**: Multi-step interactions using inline keyboards and callback queries
- **New Commands**:
  - `/attendance` – Date selector → Employee selector → First In/Last Out photos with metadata
  - `/capture` – Camera selector → Latest snapshot with timestamp and location
  - `/export_data` – Report type → Employee filter → Date range → Excel file delivery
  - `/status` – Real-time system statistics (employees, cameras, attendance, alerts)
- **Conversation State Management**: Supports concurrent multi-user interactions across different chats
- **Smart Alert Handling**: Flushes old alerts on first `/start` to prevent notification spam
- **Enhanced Error Handling**: Callback query acknowledgment to prevent timeouts

**System Improvements**
- **System Uptime Tracking**: Persistent uptime counter with `/api/system/uptime` endpoint
- **Auto-Refresh Reports**: 30-second auto-refresh for attendance and alert tables in web dashboard
- **Entry Type Protection**: MANUAL attendance entries protected from automatic AI/scheduler updates
- **Historical Context**: Alert logs preserve schedule state at time of alert for accurate reporting

#### Performance Improvements
- **TensorRT Integration**: Added TensorRT execution provider for 10-20% faster inference after initial engine generation
- **Frame Capture Optimization**: Improved camera capture threading for reduced latency and better frame synchronization
- **Database Query Optimization**: Enhanced query performance with eager loading and strategic indexing
- **TensorRT Engine Caching**: Automatic caching in `_tensorrt_cache/` directory for faster subsequent runs

#### UI/UX Enhancements
- **Reports Page**: Dynamic "Export Excel" buttons below each report table with real-time URL construction
- **Enhanced Panels**: Improved layout and styling for better readability and user experience
- **System Uptime Display**: Real-time uptime counter in Settings → Schedule System tab
- **Live Status Updates**: Enhanced Socket.IO integration for real-time employee tracking cards

#### Developer Experience
- **Conda Environment**: Switched from venv to conda for better package management and reproducibility
- **Environment-Based Configuration**: PostgreSQL credentials configurable via environment variables
- **Migration Scripts**: Added `add_entry_type_column.py` for database schema updates
- **Comprehensive Documentation**: Updated CLAUDE.md with detailed implementation guides and troubleshooting

---

**© PT GSPE – Intelligent Vision Systems for Workforce Automation**
