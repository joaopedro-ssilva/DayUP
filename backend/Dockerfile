FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Instala só as dependências primeiro (versões travadas), para o Docker
# reaproveitar essa camada quando apenas o código mudar.
COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts

RUN useradd --create-home --uid 1000 dayup
USER dayup

EXPOSE 8000

# Migra o banco e sobe a API. --proxy-headers faz o request.client.host ser o IP
# real do usuário (vindo do Caddy) — necessário pro rate limit por IP. Aceitar
# qualquer proxy é seguro porque a API só é alcançável pela rede interna do compose.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2 --proxy-headers --forwarded-allow-ips='*'"]
