FROM python:3.11-slim

WORKDIR /app

COPY api/requirements.txt ./api/
RUN pip install --no-cache-dir -r api/requirements.txt

COPY api/ ./api/
COPY frontend/ ./frontend/

WORKDIR /app/api
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
