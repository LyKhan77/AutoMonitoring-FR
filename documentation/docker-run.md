# Docker Run Guide (Windows 11 + NVIDIA GPU)

This guide shows how to build and run the FR-V3 app in Docker with NVIDIA GPU on Windows 11. It covers Command Prompt (CMD), PowerShell, and WSL (Ubuntu).

Paths assume your project folder is `d:\Occupation\GSPE\Project\WebApp\FR-V3`.

## 1) Prerequisites

- Docker Desktop (latest) installed and running
- WSL2 enabled with Ubuntu distribution installed
- NVIDIA GPU driver updated, NVIDIA Container Toolkit installed
- `nvidia-smi` works on the host
- Docker Desktop Settings
  - General: Use WSL 2 based engine
  - Resources > WSL Integration: enable Ubuntu
  - Resources > File Sharing: ensure the drive/folder for your project is shared

## 2) Verify your Dockerfile

Project file: `Dockerfile`
- Base image: `nvidia/cuda:12.8.0-cudnn-runtime-ubuntu22.04`
- Python version built: 3.10.18
- Exposes port: 5000
- Command: `python3 app.py`
- GPU providers expected in app config: `CUDAExecutionProvider, CPUExecutionProvider`

## 3) Build the image

Run these from your project root (`FR-V3`):

### Option A: Windows Command Prompt (CMD)
```bat
cd /d d:\Occupation\GSPE\Project\WebApp\FR-V3
docker build -t gspe-fr:cuda12.8-py3.10 .
```

### Option B: Windows PowerShell
```powershell
Set-Location "d:/Occupation/GSPE/Project/WebApp/FR-V3"
docker build -t gspe-fr:cuda12.8-py3.10 .
```

### Option C: WSL (Ubuntu)
```bash
cd /mnt/d/Occupation/GSPE/Project/WebApp/FR-V3
docker build -t gspe-fr:cuda12.8-py3.10 .
```

## 4) Initialize the database (first time only)

You can initialize inside the container (one-off run) or on the host Python. The container method is simpler and ensures consistent environment.

### One-off container init
```bash
# PowerShell or CMD paths shown; adjust for your shell
# Run database_models.py once to create tables and seed cameras
# -v mounts your local folders into the container so DB and configs persist

docker run --rm --gpus all ^
  -v "%cd%/db:/app/db" ^
  -v "%cd%/camera_configs:/app/camera_configs" ^
  gspe-fr:cuda12.8-py3.10 \
  python3 database_models.py
```

WSL example:
```bash
docker run --rm --gpus all \
  -v "$PWD/db:/app/db" \
  -v "$PWD/camera_configs:/app/camera_configs" \
  gspe-fr:cuda12.8-py3.10 \
  python3 database_models.py
```

## 5) Run the app (standalone)

### Windows Command Prompt (CMD)
```bat
cd /d d:\Occupation\GSPE\Project\WebApp\FR-V3

docker run --gpus all --name frv3 --rm -p 5000:5000 ^
  -e NVIDIA_VISIBLE_DEVICES=all ^
  -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video ^
  -v "%cd%/db:/app/db" ^
  -v "%cd%/captures:/app/captures" ^
  -v "%cd%/attendance_captures:/app/attendance_captures" ^
  -v "%cd%/camera_configs:/app/camera_configs" ^
  -v "%cd%/config:/app/config" ^
  gspe-fr:cuda12.8-py3.10
```

### Windows PowerShell
```powershell
Set-Location "d:/Occupation/GSPE/Project/WebApp/FR-V3"

docker run --gpus all --name frv3 --rm -p 5000:5000 `
  -e NVIDIA_VISIBLE_DEVICES=all `
  -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video `
  -v "$PWD/db:/app/db" `
  -v "$PWD/captures:/app/captures" `
  -v "$PWD/attendance_captures:/app/attendance_captures" `
  -v "$PWD/camera_configs:/app/camera_configs" `
  -v "$PWD/config:/app/config" `
  gspe-fr:cuda12.8-py3.10
```

### WSL (Ubuntu)
```bash
cd /mnt/d/Occupation/GSPE/Project/WebApp/FR-V3

docker run --gpus all --name frv3 --rm -p 5000:5000 \
  -e NVIDIA_VISIBLE_DEVICES=all \
  -e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video \
  -v "$PWD/db:/app/db" \
  -v "$PWD/captures:/app/captures" \
  -v "$PWD/attendance_captures:/app/attendance_captures" \
  -v "$PWD/camera_configs:/app/camera_configs" \
  -v "$PWD/config:/app/config" \
  -v "$PWD/face_images:/app/face_images" \
  gspe-fr:cuda12.8-py3.10
```

Open the app at: http://localhost:5000

## 6) Run via Docker Compose

Your `docker-compose.yml` is already set up for GPU. From the project root:

### CMD / PowerShell
```bash
docker compose up -d --build
```

### WSL
```bash
docker compose up -d --build
```

To stop:
```bash
docker compose down
```

## 7) Verify GPU usage and providers

Inside the running container:
```bash
docker exec -it frv3 bash
python3 - <<'PY'
import onnxruntime as ort
print('Available providers:', ort.get_available_providers())
print('Device:', ort.get_device())
PY
exit
```
Expected: `CUDAExecutionProvider` is present and device is `GPU`.

## 8) Logs and troubleshooting

- Container logs
```bash
docker logs -f frv3
```
- NVIDIA GPU inside container
```bash
docker exec -it frv3 nvidia-smi
```
- Common issues
  - If volumes fail to mount, ensure the drive is shared in Docker Desktop > Settings > Resources > File Sharing.
  - If GPU not detected in container, re-check NVIDIA Container Toolkit installation and restart Docker Desktop.
  - If RTSP issues, confirm `camera_configs/` URLs and network reachability.

## 9) Production notes

- Consider reverse-proxy with Nginx on host and keep container bound to 127.0.0.1:5000 (then publish 80/443 from Nginx).
- Use `docker compose` with restart policy for resilience.
- Tune `config/parameter_config.json`:
  - `providers`, `fps_target`, `stream_max_width`, `jpeg_quality`
  - `captures_*` and `attendance_*` parameters
  - Off-hours gating confirmed via the schedule state

---
If you want, I can add a `docker-compose.windows.yml` example with Windows-friendly bind paths and an Nginx service.
