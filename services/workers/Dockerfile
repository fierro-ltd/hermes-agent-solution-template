FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .
COPY src/ src/
COPY services/workers/ services/workers/

RUN pip install --no-cache-dir -e .

ENV PYTHONPATH=/app/src:/app
ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "services.workers.worker"]
