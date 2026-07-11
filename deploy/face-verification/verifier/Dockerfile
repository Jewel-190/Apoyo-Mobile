FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
  && rm -rf /var/lib/apt/lists/*

# CPU-only PyTorch first so EasyOCR does not pull CUDA wheels (~3GB).
RUN pip install --no-cache-dir \
    torch==2.5.1 torchvision==0.20.1 \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py id_match.py .

# Pre-download ML weights (anti-spoof + OCR) to avoid multi-minute first requests.
RUN python -c "from deepface import DeepFace; import numpy as np; img = np.zeros((224,224,3), dtype=np.uint8); DeepFace.extract_faces(img, anti_spoofing=True, enforce_detection=False)" \
  && python -c "from id_match import warm_ocr; warm_ocr()"

ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
