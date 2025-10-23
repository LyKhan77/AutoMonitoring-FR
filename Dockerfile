# ============================================================================
# GSPE Auto-Monitoring Face Recognition System - Optimized Dockerfile
# Base: NVIDIA CUDA 12.6 + cuDNN + TensorRT on Ubuntu 22.04
# Compatible with NVIDIA Driver 580+ (CUDA 13.0)
# ============================================================================

# Stage 1: Build environment with CUDA 12.6 (compatible with Driver 580)
FROM nvidia/cuda:12.6.3-cudnn-devel-ubuntu22.04 AS builder

# Build arguments for customization
ARG PYTHON_VERSION=3.10.18
ARG DEBIAN_FRONTEND=noninteractive

# Metadata
LABEL maintainer="GSPE Development Team"
LABEL description="AI-powered employee monitoring and attendance tracking system"
LABEL version="3.2"

WORKDIR /build

# Install system build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Build essentials
    build-essential \
    gcc \
    g++ \
    make \
    cmake \
    # Python build dependencies
    libssl-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    libffi-dev \
    liblzma-dev \
    tk-dev \
    uuid-dev \
    # Download tools
    curl \
    ca-certificates \
    wget \
    git \
    # Other utilities
    pkg-config \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Build Python 3.10.18 from source with optimizations
RUN set -eux; \
    cd /tmp; \
    curl -fsSLO https://www.python.org/ftp/python/${PYTHON_VERSION}/Python-${PYTHON_VERSION}.tgz; \
    tar xzf Python-${PYTHON_VERSION}.tgz; \
    cd Python-${PYTHON_VERSION}; \
    # Configure with optimizations
    ./configure \
        --enable-optimizations \
        --with-lto \
        --enable-shared \
        --with-ensurepip=install \
        --prefix=/usr/local; \
    # Build with all cores
    make -j"$(nproc)"; \
    make install; \
    # Create symlinks
    ln -sf /usr/local/bin/python3.10 /usr/local/bin/python3; \
    ln -sf /usr/local/bin/python3.10 /usr/local/bin/python; \
    ln -sf /usr/local/bin/pip3.10 /usr/local/bin/pip3; \
    ln -sf /usr/local/bin/pip3.10 /usr/local/bin/pip; \
    # Upgrade pip and tools
    python3 -m pip install --no-cache-dir --upgrade pip setuptools wheel; \
    # Update shared library cache
    ldconfig; \
    # Cleanup
    rm -rf /tmp/Python-${PYTHON_VERSION}*

# Copy requirements and install Python dependencies
COPY requirements.txt /build/
RUN python3 -m pip install --no-cache-dir -r requirements.txt \
    && python3 -m pip install --no-cache-dir onnxruntime-gpu==1.20.1

# ============================================================================
# Stage 2: Runtime environment (smaller final image)
# ============================================================================
FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu22.04 AS runtime

ARG DEBIAN_FRONTEND=noninteractive

# Metadata
LABEL maintainer="GSPE Development Team"
LABEL description="AI-powered employee monitoring and attendance tracking system"
LABEL version="3.2"

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Python runtime dependencies
    libssl3 \
    libsqlite3-0 \
    libffi8 \
    libbz2-1.0 \
    libreadline8 \
    liblzma5 \
    # OpenCV dependencies
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    libgl1 \
    libglib2.0-0 \
    # Networking and utilities
    curl \
    ca-certificates \
    tzdata \
    # TensorRT runtime (critical for performance)
    tensorrt \
    && rm -rf /var/lib/apt/lists/*

# Copy Python from builder stage
COPY --from=builder /usr/local /usr/local

# Update shared library cache
RUN ldconfig

# Create non-root user for security
RUN useradd -m -u 10001 -s /bin/bash appuser \
    && mkdir -p \
        /app/db \
        /app/captures \
        /app/attendance_captures \
        /app/_tensorrt_cache \
        /app/face_images \
        /app/config \
        /app/camera_configs \
    && chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Copy application code
COPY --chown=appuser:appuser . /app/

# Environment variables for GPU optimization
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=UTF-8 \
    # CUDA environment
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility,video \
    CUDA_MODULE_LOADING=LAZY \
    # TensorRT optimization
    ORT_TENSORRT_ENGINE_CACHE_ENABLE=1 \
    ORT_TENSORRT_CACHE_PATH=/app/_tensorrt_cache \
    ORT_TENSORRT_FP16_ENABLE=1 \
    ORT_TENSORRT_INT8_ENABLE=0 \
    # ONNX Runtime optimization
    OMP_NUM_THREADS=4 \
    OMP_WAIT_POLICY=PASSIVE \
    # Application settings
    FLASK_ENV=production \
    TZ=Asia/Jakarta

# Create healthcheck script
USER root
RUN echo '#!/bin/bash\ncurl -f http://localhost:5000/api/config/params || exit 1' > /healthcheck.sh \
    && chmod +x /healthcheck.sh
USER appuser

# Expose Flask-SocketIO port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD ["/healthcheck.sh"]

# Default command (can be overridden in docker-compose.yaml)
CMD ["python3", "app.py"]
