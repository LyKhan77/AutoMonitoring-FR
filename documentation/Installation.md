    # FR-V3 Installation Guide (RTX 5090 Server)

This guide explains how to deploy and run the FR-V3 web application on a company server equipped with an NVIDIA RTX 5090 GPU. It covers Linux (Ubuntu) as the primary target and provides Windows notes where relevant.

Paths referenced below assume the project is at `.../FR-V3/`.


## 1) Server Requirements

- OS: Ubuntu 22.04 LTS or 24.04 LTS recommended
  - Windows Server 2022+ possible; see Windows notes.
- GPU: NVIDIA RTX 5090 (Ada/Blackwell family). Use recent CUDA drivers/toolkit.
- CPU/RAM: 8+ cores / 16+ GB RAM recommended for multiple cameras.
- Storage: SSD recommended. Plan for `captures/` and `attendance_captures/` retention.
- Network: Stable connectivity to IP cameras (RTSP) and client browsers.


## 2) NVIDIA Driver, CUDA, cuDNN, TensorRT

1) Install latest NVIDIA driver (Ubuntu)
```
sudo apt update && sudo apt -y upgrade
sudo apt -y install ubuntu-drivers-common
sudo ubuntu-drivers autoinstall
sudo reboot
```
Verify:
```
nvidia-smi
```

2) Install CUDA Toolkit (12.4+ recommended for 50xx GPUs)
- Download: https://developer.nvidia.com/cuda-downloads
- Choose Linux > x86_64 > Ubuntu > version > deb (network)
- Follow installer steps, then verify:
```
nvcc --version
```

3) Install cuDNN (matching your CUDA)
- Download: https://developer.nvidia.com/cudnn (login required)
- Install the cuDNN package matching CUDA 12.x.

4) (Optional) Install TensorRT (10.x+)
- For high-performance inference pipelines or future optimizations.
- https://developer.nvidia.com/tensorrt

Windows notes
- Use the latest NVIDIA Game Ready/Studio Driver.
- Install CUDA Toolkit 12.4+ and cuDNN for Windows.


## 3) System packages (Ubuntu)
```
sudo apt -y install python3 python3-venv python3-pip git
# If using GStreamer RTSP (config: use_gstreamer_rtsp=true)
sudo apt -y install gstreamer1.0-tools gstreamer1.0-libav \
  gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly
# Optional media tools
sudo apt -y install ffmpeg
```

Optional GPU quality-of-life
```
# Keep GPU in persistence mode
sudo nvidia-smi -pm 1
```


## 4) Python environment

Inside the project folder `FR-V3/`:
```
python3 -m venv env
source env/bin/activate
pip install --upgrade pip wheel setuptools
```

Install dependencies
```
pip install -r requirements.txt
```

GPU-accelerated ONNX Runtime (recommendation)
- If `requirements.txt` uses `onnxruntime` (CPU), upgrade to GPU build:
```
pip install --upgrade onnxruntime-gpu==1.18.1
```
Notes
- onnxruntime-gpu 1.18.x is built against CUDA 12.x. Ensure your CUDA/cuDNN match.
- If you use InsightFace or PyTorch elsewhere, ensure CUDA versions are aligned.


## 5) Application configuration

Core config: `config/parameter_config.json`
- Make sure these are tuned for production:
  - `providers`: "CUDAExecutionProvider, CPUExecutionProvider"
  - `fps_target`: e.g., 5–10
  - `stream_max_width`: e.g., 720 or 960
  - `jpeg_quality`: e.g., 60–80
  - `captures_*`: background preview saver on/off, interval, rotation
  - `attendance_*`: delay, overwrite policy, retention days
  - `alert_min_interval_sec`: anti-spam for alerts
  - `present_timeout_sec` & `tracking_timeout`: presence transitions

Tracking schedule and off-hours
- UI and backend gating ensure alerts are suppressed during off-hours/lunch.
- Adjust via `work_hours`/`lunch_break` in app state and parameter file.

Camera RTSP config
- Place configs under `camera_configs/` (each camera folder with `config.json`).
- Run DB init once (see below) to seed camera table from configs.


## 6) Database initialization

The default DB is SQLite at `db/attendance.db`.
```
source env/bin/activate
python database_models.py
```
This will:
- Create tables
- Seed cameras from `camera_configs/`


## 7) Running the app (development)

```
source env/bin/activate
python app.py
```
This starts Flask-SocketIO dev server on `http://0.0.0.0:5000`.


## 8) Running in production

Option A: Gunicorn + Eventlet (WSGI for Flask-SocketIO)
```
pip install gunicorn eventlet
# from project root
source env/bin/activate
gunicorn -k eventlet -w 1 -b 0.0.0.0:5000 app:app
```
- `-k eventlet` is required for SocketIO long-polling/websocket.
- `-w 1` typically sufficient; SocketIO uses async workers.

Option B: `python app.py` under a process manager (supervisor/systemd)
- Simplest; the built-in SocketIO server will run.

Nginx reverse proxy (recommended)
- `/etc/nginx/sites-available/frv3`:
```
server {
    listen 80;
    server_name your.server.ip.or.hostname;

    client_max_body_size 50M;

    location / {
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_pass http://127.0.0.1:5000;
    }
}
```
```
sudo ln -s /etc/nginx/sites-available/frv3 /etc/nginx/sites-enabled/frv3
sudo nginx -t && sudo systemctl reload nginx
```

Systemd service (optional)
- `/etc/systemd/system/frv3.service`:
```
[Unit]
Description=FR-V3 Gunicorn Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/FR-V3
Environment="PATH=/opt/FR-V3/env/bin"
ExecStart=/opt/FR-V3/env/bin/gunicorn -k eventlet -w 1 -b 127.0.0.1:5000 app:app
Restart=always

[Install]
WantedBy=multi-user.target
```
```
sudo systemctl daemon-reload
sudo systemctl enable --now frv3
```


## 9) GPU tuning & verification

- Verify CUDA visible:
```
python -c "import onnxruntime as ort; print(ort.get_device())"
# Expect: 'GPU'
```
- Ensure ONNX Runtime uses CUDAExecutionProvider:
```
python - <<'PY'
import onnxruntime as ort
print(ort.get_available_providers())
PY
```
- Keep GPU persistence mode on:
```
sudo nvidia-smi -pm 1
```
- Optional power/clock tuning per company policy.


## 10) Optional dependencies for performance

- `onnxruntime-gpu==1.18.1` (CUDA 12.x)
- `opencv-python-headless>=4.9` (avoid Qt on servers)
- `pycuda` or `cupy-cuda12x` (if adding custom GPU ops later)
- `uvloop` (for async parts on Linux; not compatible with eventlet workers)
- `tensorRT` Python wheel if you move to TRT engines later

Match versions with your CUDA/cuDNN to avoid runtime errors.


## 11) Security & firewall

- Restrict port 5000 to local only; expose via Nginx (80/443).
- Configure HTTPS (Let’s Encrypt) if exposed externally.
- Limit outbound to only camera IPs if required by policy.


## 12) Maintenance & housekeeping

- Configure `attendance_captures_retention_days` (default 30) to control disk usage.
- Background preview rotation via `captures_rotation`.
- Monitor logs and disk usage under `captures/` and `attendance_captures/`.


## 13) Troubleshooting

- RTSP stream not showing
  - Check camera RTSP URL, firewall, and `use_gstreamer_rtsp` setting.
  - Try lowering `stream_max_width` and `fps_target`.
- GPU not used
  - Ensure `onnxruntime-gpu` installed, CUDA 12.x present, and providers configured in `parameter_config.json`.
- Off-hours alerts still appear
  - Confirm schedule state and that clients call `/api/alert_logs` (the endpoint enforces gating).


## 14) Quick start checklist

- [ ] NVIDIA driver + CUDA 12.4+ + cuDNN installed
- [ ] Python venv created; dependencies installed
- [ ] `parameter_config.json` tuned for production (CUDA providers, intervals)
- [ ] Database initialized (`python database_models.py`)
- [ ] App running behind Nginx with Eventlet worker
- [ ] Cameras reachable; previews visible
- [ ] Attendance captures being created on ENTER/EXIT
- [ ] Retention job running (daily cleanup)


---
If you need a Windows-specific script or an Ansible playbook to automate steps, let me know and I’ll provide one tailored to your environment.
