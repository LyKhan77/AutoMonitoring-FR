# GSPE Auto-Monitoring System

A real-time employee monitoring system using CCTV cameras and face recognition technology. The system provides live video streaming, automatic employee presence tracking, alert notifications, and comprehensive attendance management.

## Features

### 🎥 Live CCTV Streaming
- Real-time video streaming from multiple cameras
- Socket.IO-based frame transmission for low latency
- Dynamic camera switching and management
- AI inference status indicator (Online/Offline)

### 👤 Face Recognition & Tracking
- Advanced face detection and recognition using InsightFace
- Employee embedding storage and matching
- Real-time presence status updates
- Tracking-by-detection with IOU association to stabilize IDs and boxes
- Temporal ID smoothing (majority vote) to reduce flicker/switching
- Configurable similarity thresholds
- Face quality gating (blur, brightness, size) before casting votes

### 🚨 Smart Alert System
- Automatic alert generation when employees are absent (configurable timeout)
- Persistent alert logging in database (`alert_logs`)
- Real-time notification dropdown with badge counter (client UI)
- Alert resolution tracking when employees return
- Event rate control to prevent database spam for repeated sightings (configurable: `alert_min_interval_sec`)
- Off-hours & pause gating (alerts/captures suppressed based on schedule state)
- Optional WhatsApp notifications to Supervisors (via Meta Cloud API), async & rate-limited

### 📊 Attendance Management
- Daily attendance tracking with dedicated captures:
  - `first_in.jpg` and `last_out.jpg` per employee per day
  - First-In overwrite policy (`attendance_first_in_overwrite_enabled`)
  - Last-Out optional delay to stabilize frame (`attendance_last_out_delay_sec`)
  - Daily retention job cleans old folders (`attendance_captures_retention_days`)
- Employee presence status (Available/Off)
- Comprehensive event logging
- Daily maintenance (events purge + attendance captures retention)

### 🖥️ Web Dashboard
- Modern responsive UI built with Tailwind CSS
- Live employee tracking panel
- Camera management interface
- Employee registration with face capture
- Settings and configuration pages
 - Report page with Reset Logs (Events/Alert Logs) by date range

## System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   AI Engine    │
│   (HTML/JS)     │◄──►│   (Flask)       │◄──►│   (module_AI)   │
│                 │    │                 │    │                 │
│ • Live Stream   │    │ • REST APIs     │    │ • Face Detect   │
│ • Notifications │    │ • Socket.IO     │    │ • Recognition   │
│ • Management    │    │ • Maintenance   │    │ • Tracking      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐
                       │   Database      │
                       │   (SQLite)      │
                       │                 │
                       │ • Employees     │
                       │ • Events        │
                       │ • Attendance    │
                       │ • Alerts        │
                       └─────────────────┘

External Notification (optional):
```
Backend ──(async queue)──> WhatsApp Cloud API ──> Supervisors
```
```

## Installation

Refer to `Installation.md` for a complete guide (RTX 5090 server, CUDA 12.x, Docker/WSL notes).

### Quick Prerequisites
- Python 3.10+
- RTSP cameras or streams (H.264 recommended)
- Modern web browser

### Dependencies (bare-metal)
```bash
pip install -r requirements.txt
```
Key packages: Flask(+SocketIO), SQLAlchemy, OpenCV, InsightFace/ONNX Runtime, NumPy.

### Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd FR-V3
```

2. **Install dependencies**
```bash
pip install -r requirements.txt
```

3. **Initialize database**
```bash
python database_models.py
```

4. **Configure cameras**
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

Additional/advanced parameters supported (optional):

- Tracking & smoothing
  - `smoothing_window` (int, default 5)
  - `smoothing_min_votes` (int, default 3)
  - `tracker_iou_threshold` (float, default 0.3)
  - `tracker_max_misses` (int, default 8)
- Event rate control
  - `event_min_interval_sec` (float seconds, default 5.0)
- Quality gating
  - `quality_min_blur_var` (float, default 50.0)
  - `quality_min_face_area_frac` (float, default 0.01)
  - `quality_min_brightness` (float 0..1, default 0.15)
  - `quality_max_brightness` (float 0..1, default 0.9)
  - `quality_min_score` (float 0..1, default 0.3)

5. **Configure AI parameters** (optional)
   - Edit `parameter_config.json` for detection thresholds and settings

6. **Run the application**
```bash
python app.py
```

7. **Access the dashboard**
   - Open browser: `http://localhost:5000`

## Configuration

### Camera Configuration
Cameras are configured via JSON files in `camera_configs/` directory:

```
camera_configs/
├── CAM1/
│   └── config.json
├── CAM2/
│   └── config.json
└── CAM3/
    └── config.json
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

WhatsApp config lives separately in `config/config_whatsapp.json`:
- `enabled`, `provider` ("meta"), `phone_number_id`, `access_token_env`, `supervisors` list
  - Do NOT store tokens in repo; set env var `WHATSAPP_ACCESS_TOKEN` at runtime.

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
1. Buka halaman Report pada dashboard.
2. Klik tombol "Reset Logs".
3. Pilih tabel (Both / Events only / Alert Logs only).
4. Opsional: pilih From dan To Date (YYYY-MM-DD). Kosongkan untuk hapus semua.
5. Konfirmasi. Sistem akan menampilkan jumlah baris yang terhapus.

### Attendance Captures Report
- Endpoint: `GET /api/report/attendance_captures?employee_id=ID&date=YYYY-MM-DD`
- Mengembalikan URL `first_in` dan `last_out` jika ada.

### Alert Management
- Alerts automatically generated when employees absent >60s
- View current alerts in notification dropdown
- Alert history stored in database
- Alerts resolved when employees return

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

## API Endpoints

### REST APIs
- `GET /api/cameras` - List all cameras
- `GET /api/employees` - List all employees
- `POST /api/employees` - Create new employee
- `PUT /api/employees/{id}` - Update employee
- `DELETE /api/employees/{id}` - Delete employee
- `GET /api/tracking/state` - Get current tracking state

#### Admin
- `POST /api/admin/reset_logs` - Delete events and/or alert_logs by date range
  - Request JSON:
    ```json
    { "table": "events"|"alert_logs"|"both", "from_date": "YYYY-MM-DD", "to_date": "YYYY-MM-DD" }
    ```
  - Notes:
    - If `from_date`/`to_date` omitted, deletes all rows in selected table(s).
    - Dates are inclusive; span entire days.
  - Response JSON:
    ```json
    { "ok": true, "deleted_events": 123, "deleted_alert_logs": 45 }
    ```

### Socket.IO Events
- `start_stream` - Start camera streaming
- `stop_stream` - Stop camera streaming
- `frame` - Receive video frame
- `stream_error` - Stream error notification
- `stream_stopped` - Stream stopped notification
 - (Optional) `alert_log_created` client listener can push UI notifications (if wired)

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

## Troubleshooting

### Common Issues

**Camera not connecting:**
- Verify RTSP URL and credentials
- Check network connectivity
- Ensure camera supports H.264 encoding

**Face recognition not working:**
- Check lighting conditions
- Verify face template registration
- Adjust similarity threshold in config

**Performance issues:**
- Reduce camera resolution/FPS
- Check CPU/memory usage
- Consider hardware acceleration

**Database errors:**
- Check file permissions for `attendance.db`
- Ensure SQLite is properly installed
- Backup and reinitialize if corrupted

### Logs
Monitor console output for:
- Camera connection status
- Face recognition events
- Database operations
- Error messages

## Development

### Project Structure
```
FR-V3/
├── app.py                      # Main Flask application
├── module_AI.py               # AI/Face recognition engine
├── database_models.py         # Database models and ORM (+light migrations)
├── requirements.txt           # Python dependencies
├── config/
│   ├── parameter_config.json  # Runtime parameters (AI/RTSP/Attendance)
│   └── config_whatsapp.json   # WhatsApp config (no secrets/tokens)
├── helpers/
│   └── whatsapp.py            # Async WhatsApp sender (Meta Cloud API)
├── scripts/
│   └── import_employees.py    # Upsert employees from data-karyawan.json
├── static/                    # JS/CSS assets (incl. notifications.js)
├── templates/                 # HTML templates
├── camera_configs/            # Camera JSON configs (per CAM folder)
├── captures/                  # Rolling per-camera snapshots (runtime)
├── attendance_captures/       # First-In/Last-Out captures (runtime)
├── db/
│   └── attendance.db          # SQLite database (ignored by .gitignore)
├── Dockerfile                 # CUDA 12.8 + Python 3.10.18 base (x86_64)
├── docker-compose.yaml        # Optional runtime stack
├── Installation.md            # RTX 5090/Server install guide
└── docker-run.md              # How to build/run (CMD/PowerShell/WSL)
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

## Security Considerations

- RTSP credentials stored server-side (not exposed to frontend)
- WhatsApp Access Token must be provided via environment variable (not in repo)
- SQLite file permissions should be restricted
- Consider HTTPS and authN/authZ for production deployments

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

**GSPE Auto-Monitoring System** - Intelligent employee monitoring with face recognition technology.
