FROM python:3.11-slim

WORKDIR /app

# Ensure vi is installed for k8s exec debugging
RUN apt-get update && apt-get install -y vim && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
