FROM python:3.11-slim

WORKDIR /app

# Ensure vi is installed for debugging in cluster if needed
RUN apt-get update && apt-get install -y vim && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

EXPOSE 8000
EXPOSE 8001

CMD ["python", "server.py"]
