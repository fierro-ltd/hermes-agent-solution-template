FROM python:3.11-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/hermes

RUN git clone https://github.com/NousResearch/hermes-agent.git . \
    && python -m venv /opt/hermes/venv \
    && /opt/hermes/venv/bin/pip install --no-cache-dir -U pip \
    && /opt/hermes/venv/bin/pip install --no-cache-dir -e .

ENV PATH="/opt/hermes/venv/bin:$PATH"

RUN mkdir -p /root/.hermes

COPY services/hermes/SOUL.md /root/.hermes/SOUL.md
COPY services/hermes/config.yaml /root/.hermes/config.yaml

EXPOSE 8088

CMD ["hermes", "gateway", "run", "--host", "0.0.0.0", "--port", "8088"]
