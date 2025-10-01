# Base: NVIDIA CUDA 12.8 + cuDNN runtime on Ubuntu 22.04
FROM nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04 AS base

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHON_VERSION=3.10.18 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps (build tools + libs to compile Python and common libs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl ca-certificates \
    wget \
    git \
    pkg-config \
    libssl-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    libffi-dev \
    liblzma-dev \
    tk-dev \
    xz-utils \
    uuid-dev

# Install TensorRT 10 for CUDA 12.x to match onnxruntime-gpu==1.20.1
# The development image has the necessary package manager setup.
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Install the TensorRT meta-package which includes all necessary runtime libraries
    tensorrt \
    && rm -rf /var/lib/apt/lists/*

# Build and install Python 3.10.18 from source (exact minor version)
RUN set -eux; \
    cd /tmp; \
    curl -fsSLO https://www.python.org/ftp/python/${PYTHON_VERSION}/Python-${PYTHON_VERSION}.tgz; \
    tar xzf Python-${PYTHON_VERSION}.tgz; \
    cd Python-${PYTHON_VERSION}; \
    ./configure --enable-optimizations --with-ensurepip=install; \
    make -j"$(nproc)"; \
    make install; \
    ln -sf /usr/local/bin/python3.10 /usr/local/bin/python3; \
    ln -sf /usr/local/bin/pip3.10 /usr/local/bin/pip3; \
    python3 -m pip install --no-cache-dir --upgrade pip setuptools wheel; \
    rm -rf /tmp/Python-${PYTHON_VERSION}* 

# Create a non-root user
RUN useradd -m -u 10001 appuser
USER appuser

# Copy requirements first for caching, then install
COPY --chown=appuser:appuser requirements.txt ./
RUN python3 -m pip install --no-cache-dir -r requirements.txt \
    && python3 -m pip install --no-cache-dir onnxruntime-gpu==1.20.1

# Copy the rest of the source
COPY --chown=appuser:appuser . .

# Expose Flask-SocketIO port
EXPOSE 5000

# Environment hints for NVIDIA Container Toolkit
ENV NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility,video

# Default command
CMD ["python3", "app.py"]
