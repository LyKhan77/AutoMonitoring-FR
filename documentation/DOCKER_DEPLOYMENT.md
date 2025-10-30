# Docker Deployment Guide - GSPE Auto-Monitoring System

**Version**: 3.2
**Date**: 2025-10-16
**CUDA Version**: 12.6+ (Compatible with Driver 580+)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [System Requirements](#system-requirements)
3. [Installation Steps](#installation-steps)
4. [Docker Build & Deployment](#docker-build--deployment)
5. [Verification & Testing](#verification--testing)
6. [Performance Optimization](#performance-optimization)
7. [Troubleshooting](#troubleshooting)
8. [Maintenance](#maintenance)

---

## Prerequisites

### Required Software

- **Docker**: 20.10+ or Docker Engine 24.0+
- **Docker Compose**: 2.0+ (v2 syntax)
- **NVIDIA Driver**: 580+ (with CUDA 13.0 support)
- **NVIDIA Container Toolkit**: Latest version
- **Operating System**: Ubuntu 22.04/24.04 LTS (recommended)

### Hardware Requirements

**Minimum**:
- GPU: NVIDIA GTX 1660 or better
- RAM: 8GB
- CPU: 4 cores
- Storage: 50GB free space

**Recommended** (for production):
- GPU: NVIDIA RTX 3090 or better
- RAM: 16GB+
- CPU: 8+ cores
- Storage: 100GB+ SSD

---

## System Requirements

### Check Current System

```bash
# Check NVIDIA driver
nvidia-smi

# Expected output:
# Driver Version: 580.65.06    CUDA Version: 13.0

# Check Docker version
docker --version
# Expected: Docker version 24.0.0 or higher

# Check Docker Compose version
docker compose version
# Expected: Docker Compose version v2.x.x or higher
```

---

## Installation Steps

### Step 1: Install NVIDIA Container Toolkit

#### Ubuntu 22.04/24.04

```bash
# 1. Configure the production repository
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# 2. Update package list
sudo apt-get update

# 3. Install NVIDIA Container Toolkit
sudo apt-get install -y nvidia-container-toolkit

# 4. Configure Docker to use NVIDIA runtime
sudo nvidia-ctk runtime configure --runtime=docker

# 5. Restart Docker service
sudo systemctl restart docker

# 6. Verify installation
sudo docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu22.04 nvidia-smi

# Expected: nvidia-smi output showing your GPU
```

**If successful**, you should see your GPU information (RTX 3090 or similar).

---

### Step 2: Configure Docker Permissions (Optional)

```bash
# Add current user to docker group (avoids needing sudo)
sudo usermod -aG docker $USER

# Logout and login again, or run:
newgrp docker

# Test without sudo
docker ps
```

---

### Step 3: Prepare Project Directory

```bash
# Clone or navigate to project directory
cd ~/AutoMonitoring-FR

# Create required directories
mkdir -p db captures attendance_captures face_images _tensorrt_cache logs config camera_configs

# Set proper permissions
chmod 755 db captures attendance_captures face_images _tensorrt_cache logs

# Verify directory structure
tree -L 1
```

**Expected structure**:
```
AutoMonitoring-FR/
├── app.py
├── module_AI.py
├── telegram.py
├── database_models.py
├── requirements.txt
├── Dockerfile
├── docker-compose.yaml
├── .dockerignore
├── db/
├── captures/
├── attendance_captures/
├── _tensorrt_cache/
├── face_images/
├── config/
├── camera_configs/
└── templates/
```

---

## Docker Build & Deployment

### Build the Docker Image

```bash
# Navigate to project directory
cd ~/AutoMonitoring-FR

# Build the image (first time takes 10-15 minutes)
docker compose build

# Alternative: Build with no cache (if rebuilding)
docker compose build --no-cache

# Verify image created
docker images | grep gspe-fr

# Expected output:
# gspe-fr  v3.2-cuda12.6  <image_id>  <size>
```

**Build time**:
- First build: ~10-15 minutes
- Subsequent builds: ~2-3 minutes (with layer caching)

---

### Deploy the Application

#### Option A: Standard Deployment

```bash
# Start in detached mode (background)
docker compose up -d

# View logs
docker compose logs -f fr-webapp

# Expected output:
# Applied providers: ['CUDAExecutionProvider'], with options: ...
# [AI] FaceAnalysis ready. Selected Providers=['CUDAExecutionProvider', 'CPUExecutionProvider']
# * Running on all addresses (0.0.0.0)
# * Running on http://127.0.0.1:5000
# * Running on http://172.x.x.x:5000
```

#### Option B: Foreground Mode (for debugging)

```bash
# Start in foreground (see live logs)
docker compose up

# Press Ctrl+C to stop
```

#### Option C: Rebuild and Deploy

```bash
# Rebuild image and restart container
docker compose up --build -d

# Useful after code changes
```

---

### Verify Deployment

```bash
# Check container status
docker compose ps

# Expected:
# NAME              STATUS           PORTS
# gspe-fr-webapp    Up (healthy)     0.0.0.0:5000->5000/tcp

# Check GPU is accessible in container
docker exec -it gspe-fr-webapp nvidia-smi

# Expected: nvidia-smi output showing RTX 3090

# Check logs for CUDA provider
docker compose logs fr-webapp | grep "CUDAExecutionProvider"

# Expected:
# Applied providers: ['CUDAExecutionProvider']
```

---

## Verification & Testing

### Test 1: Web Dashboard Access

```bash
# Open browser and navigate to:
http://localhost:5000

# Or from another machine:
http://<server-ip>:5000

# Expected: GSPE Auto-Monitoring dashboard loads
```

---

### Test 2: GPU Acceleration Verification

```bash
# Execute Python test inside container
docker exec -it gspe-fr-webapp python3 << 'EOF'
import onnxruntime as ort

print("ONNX Runtime version:", ort.__version__)
print("Available providers:", ort.get_available_providers())

if 'CUDAExecutionProvider' in ort.get_available_providers():
    print("✅ GPU acceleration is ENABLED")
else:
    print("❌ GPU acceleration is DISABLED (CPU only)")
EOF
```

**Expected output**:
```
ONNX Runtime version: 1.20.1
Available providers: ['TensorrtExecutionProvider', 'CUDAExecutionProvider', 'CPUExecutionProvider']
✅ GPU acceleration is ENABLED
```

---

### Test 3: InsightFace GPU Test

```bash
docker exec -it gspe-fr-webapp python3 << 'EOF'
from insightface.app import FaceAnalysis

app = FaceAnalysis(
    name='buffalo_l',
    providers=['CUDAExecutionProvider', 'CPUExecutionProvider']
)
app.prepare(ctx_id=0, det_size=(640, 640))

print("\nDetection model providers:", app.det_model.session.get_providers())
print("Recognition model providers:", app.rec_model.session.get_providers())

if 'CUDAExecutionProvider' in app.det_model.session.get_providers():
    print("\n✅ InsightFace is using GPU!")
else:
    print("\n❌ InsightFace is using CPU only!")
EOF
```

**Expected output**:
```
Applied providers: ['CUDAExecutionProvider'], with options: {...}
find model: .../buffalo_l/det_10g.onnx detection [...]

Detection model providers: ['CUDAExecutionProvider', 'CPUExecutionProvider']
Recognition model providers: ['CUDAExecutionProvider', 'CPUExecutionProvider']

✅ InsightFace is using GPU!
```

---

### Test 4: TensorRT Cache Verification

```bash
# Check if TensorRT cache is being created
ls -lah ~/AutoMonitoring-FR/_tensorrt_cache/

# After first inference, should see .engine files:
# -rw-r--r-- 1 appuser appuser 15M det_10g.engine
# -rw-r--r-- 1 appuser appuser  8M w600k_r50.engine

# Verify permissions
docker exec -it gspe-fr-webapp ls -la /app/_tensorrt_cache/
```

---

### Test 5: API Endpoint Test

```bash
# Test system config endpoint
curl http://localhost:5000/api/config/params | jq

# Expected: JSON with configuration parameters

# Test cameras endpoint
curl http://localhost:5000/api/cameras | jq

# Expected: List of cameras

# Test employees endpoint
curl http://localhost:5000/api/employees | jq

# Expected: List of employees
```

---

## Performance Optimization

### Enable GPU Persistence Mode

```bash
# Enable persistence mode (reduces initialization time)
sudo nvidia-smi -pm 1

# Verify
nvidia-smi -q | grep "Persistence Mode"
# Expected: Persistence Mode : Enabled

# Make permanent (create systemd service)
sudo tee /etc/systemd/system/nvidia-persistenced.service > /dev/null <<EOF
[Unit]
Description=NVIDIA Persistence Daemon
Wants=syslog.target

[Service]
Type=forking
ExecStart=/usr/bin/nvidia-persistenced --user root --persistence-mode
ExecStopPost=/bin/rm -rf /var/run/nvidia-persistenced

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable nvidia-persistenced
sudo systemctl start nvidia-persistenced
```

---

### Monitor GPU Usage

```bash
# Real-time GPU monitoring
watch -n 1 nvidia-smi

# Or from inside container
docker exec -it gspe-fr-webapp bash -c "watch -n 1 nvidia-smi"

# Expected during inference:
# GPU-Util: 40-80% (during face detection)
# Memory-Usage: 2-4GB (depends on number of cameras)
```

---

### Optimize Docker Resources

Edit `docker-compose.yaml` to add resource limits:

```yaml
services:
  fr-webapp:
    deploy:
      resources:
        limits:
          cpus: '8'       # Max 8 CPU cores
          memory: 16G     # Max 16GB RAM
        reservations:
          cpus: '4'       # Min 4 CPU cores
          memory: 8G      # Min 8GB RAM
```

Then restart:
```bash
docker compose down
docker compose up -d
```

---

## Troubleshooting

### Issue 1: "CUDA failure 999" Error

**Symptoms**:
```
EP Error ... CUDA failure 999: unknown error
Falling back to ['CPUExecutionProvider']
```

**Causes**:
1. NVIDIA Container Toolkit not installed
2. Docker daemon not configured for NVIDIA runtime
3. Driver/CUDA version mismatch

**Solutions**:

```bash
# 1. Verify NVIDIA runtime
docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu22.04 nvidia-smi

# If fails, reinstall NVIDIA Container Toolkit
sudo apt-get purge nvidia-container-toolkit
sudo apt-get install nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# 2. Check Docker daemon configuration
cat /etc/docker/daemon.json

# Should contain:
{
    "runtimes": {
        "nvidia": {
            "path": "nvidia-container-runtime",
            "runtimeArgs": []
        }
    }
}

# 3. Restart Docker
sudo systemctl restart docker

# 4. Rebuild container
docker compose down
docker compose up --build -d
```

---

### Issue 2: Container Exits Immediately

**Check logs**:
```bash
docker compose logs fr-webapp

# Common errors:
# - "Port 5000 already in use"
# - "Permission denied" (volume mount issues)
# - "Module not found" (missing dependencies)
```

**Solutions**:

```bash
# Kill process on port 5000
sudo lsof -t -i:5000 | xargs kill -9

# Fix permissions
sudo chown -R $USER:$USER ~/AutoMonitoring-FR/db
sudo chown -R $USER:$USER ~/AutoMonitoring-FR/captures

# Rebuild container
docker compose up --build -d
```

---

### Issue 3: Out of Memory (OOM) Errors

**Symptoms**:
```
CUDA out of memory
Bus error (core dumped)
```

**Solutions**:

```bash
# 1. Increase shared memory in docker-compose.yaml
shm_size: '4gb'  # Increase from 2gb

# 2. Reduce batch size in config/parameter_config.json
{
    "fps_target": 5,  # Reduce from 8
    "stream_max_width": 640  # Reduce from 720
}

# 3. Reduce number of cameras running simultaneously

# 4. Monitor GPU memory
nvidia-smi --query-gpu=memory.used,memory.total --format=csv -lms 1000
```

---

### Issue 4: TensorRT Engine Build Fails

**Symptoms**:
```
Could not create TensorRT engine
Falling back to CUDA provider
```

**Solutions**:

```bash
# 1. Clear TensorRT cache
rm -rf ~/AutoMonitoring-FR/_tensorrt_cache/*

# 2. Disable TensorRT temporarily (test CUDA first)
docker exec -it gspe-fr-webapp bash
export ORT_TENSORRT_ENGINE_CACHE_ENABLE=0

# 3. Check TensorRT installation in container
docker exec -it gspe-fr-webapp dpkg -l | grep tensorrt

# 4. If missing, rebuild container
docker compose build --no-cache
```

---

### Issue 5: Slow Performance (CPU-only mode)

**Check if GPU is being used**:
```bash
# Monitor GPU utilization
nvidia-smi dmon -s u

# If GPU-Util stays at 0%, GPU is NOT being used

# Check container logs
docker compose logs fr-webapp | grep "providers"

# Should see:
# Applied providers: ['CUDAExecutionProvider']

# If you see:
# Applied providers: ['CPUExecutionProvider']
# Then GPU acceleration is NOT working
```

**Solutions**:
```bash
# 1. Verify GPU visibility in container
docker exec -it gspe-fr-webapp nvidia-smi

# 2. Check environment variables
docker exec -it gspe-fr-webapp env | grep NVIDIA

# Should see:
# NVIDIA_VISIBLE_DEVICES=all
# NVIDIA_DRIVER_CAPABILITIES=compute,utility,video

# 3. Rebuild with correct GPU configuration
docker compose down
docker compose up --build -d
```

---

## Maintenance

### Update Application Code

```bash
# 1. Stop container
docker compose down

# 2. Pull latest code (if using Git)
git pull origin main

# 3. Rebuild and restart
docker compose up --build -d
```

---

### View Logs

```bash
# Real-time logs
docker compose logs -f fr-webapp

# Last 100 lines
docker compose logs --tail=100 fr-webapp

# Since specific time
docker compose logs --since="2025-10-16T10:00:00" fr-webapp

# Save logs to file
docker compose logs fr-webapp > app_logs_$(date +%Y%m%d).log
```

---

### Backup Data

```bash
# Backup database
docker compose exec fr-webapp cp /app/db/attendance.db /app/db/attendance_backup_$(date +%Y%m%d).db

# Or from host
cp ~/AutoMonitoring-FR/db/attendance.db ~/AutoMonitoring-FR/db/attendance_backup_$(date +%Y%m%d).db

# Backup attendance captures
tar -czf attendance_backup_$(date +%Y%m%d).tar.gz ~/AutoMonitoring-FR/attendance_captures/

# Backup face images
tar -czf faces_backup_$(date +%Y%m%d).tar.gz ~/AutoMonitoring-FR/face_images/
```

---

### Database Maintenance

```bash
# Enter container
docker exec -it gspe-fr-webapp bash

# Run database maintenance
python3 << 'EOF'
from database_models import init_db, SessionLocal, Event
from datetime import datetime, timedelta

# Purge old events (older than 7 days)
with SessionLocal() as db:
    cutoff = datetime.utcnow() - timedelta(days=7)
    deleted = db.query(Event).filter(Event.timestamp < cutoff).delete()
    db.commit()
    print(f"Deleted {deleted} old events")
EOF
```

---

### Update Docker Image

```bash
# Pull latest CUDA base image
docker pull nvidia/cuda:12.6.3-cudnn-runtime-ubuntu22.04

# Rebuild with latest base
docker compose build --pull --no-cache

# Restart
docker compose up -d
```

---

### Clean Up Old Images

```bash
# Remove unused images
docker image prune -a

# Remove stopped containers
docker container prune

# Remove unused volumes
docker volume prune

# Remove everything unused
docker system prune -a --volumes
```

---

## Performance Benchmarks

### Expected Performance (RTX 3090)

| Metric | CPU-only | GPU (CUDA) | GPU (TensorRT) |
|--------|----------|------------|----------------|
| Face Detection | 500-1500ms | 20-40ms | 15-25ms |
| Face Recognition | 100-400ms | 5-10ms | 3-8ms |
| Total Inference | 1000-2000ms | 30-60ms | 20-40ms |
| FPS (1 camera) | 0.5-1 | 20-30 | 25-50 |
| GPU Utilization | 0% | 40-60% | 50-70% |
| GPU Memory | N/A | 2-3GB | 2-4GB |

### Benchmark Test

```bash
# Run performance test inside container
docker exec -it gspe-fr-webapp python3 << 'EOF'
import time
import numpy as np
from insightface.app import FaceAnalysis

app = FaceAnalysis(name='buffalo_l', providers=['CUDAExecutionProvider', 'CPUExecutionProvider'])
app.prepare(ctx_id=0, det_size=(640, 640))

# Create test image
test_img = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)

# Warm-up
for _ in range(5):
    app.get(test_img)

# Benchmark
times = []
for i in range(50):
    start = time.time()
    faces = app.get(test_img)
    elapsed = (time.time() - start) * 1000
    times.append(elapsed)
    if i % 10 == 0:
        print(f"Iteration {i}: {elapsed:.2f}ms")

print(f"\n=== Benchmark Results ===")
print(f"Average: {np.mean(times):.2f}ms")
print(f"Median: {np.median(times):.2f}ms")
print(f"Min: {np.min(times):.2f}ms")
print(f"Max: {np.max(times):.2f}ms")
print(f"FPS: {1000/np.mean(times):.1f}")
EOF
```

**Expected results (RTX 3090)**:
```
Average: 25-35ms
Median: 28ms
Min: 20ms
Max: 45ms
FPS: 30-40
```

---

## Production Checklist

Before deploying to production:

- [ ] NVIDIA Container Toolkit installed and configured
- [ ] GPU persistence mode enabled
- [ ] Docker compose file reviewed and customized
- [ ] Resource limits configured (CPU, memory)
- [ ] Shared memory size appropriate (2-4GB)
- [ ] TensorRT cache directory writable
- [ ] Health checks passing
- [ ] GPU acceleration verified (CUDAExecutionProvider active)
- [ ] Performance benchmarks meet expectations (>20 FPS)
- [ ] Logs configured with rotation
- [ ] Backup strategy in place
- [ ] Monitoring configured (optional: Prometheus/Grafana)
- [ ] Security hardened (non-root user, no new privileges)
- [ ] Restart policy configured (unless-stopped)
- [ ] Database maintenance cron job set up
- [ ] Documentation reviewed by team

---

## Additional Resources

- **NVIDIA Container Toolkit**: https://github.com/NVIDIA/nvidia-container-toolkit
- **Docker Compose GPU Support**: https://docs.docker.com/compose/gpu-support/
- **ONNX Runtime**: https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html
- **InsightFace**: https://github.com/deepinsight/insightface
- **TensorRT**: https://developer.nvidia.com/tensorrt

---

**End of Docker Deployment Guide**

For issues or questions, refer to PERFORMANCE_ANALYSIS.md or contact the development team.
