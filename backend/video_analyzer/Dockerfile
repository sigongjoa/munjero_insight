FROM python:3.10-slim-bookworm

WORKDIR /app

COPY requirements.txt ./

# Install dependencies for OpenCV (libGL.so.1)
RUN apt-get update && apt-get install -y     libgl1-mesa-glx     libsm6     libxrender1     libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
