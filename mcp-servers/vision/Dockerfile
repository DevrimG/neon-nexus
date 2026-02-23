FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y vim && rm -rf /var/lib/apt/lists/*
RUN pip install fastmcp uvicorn
COPY server.py .
EXPOSE 8000
CMD ["python", "server.py"]
