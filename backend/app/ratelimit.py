"""Rate limiting via Redis (INCR + EXPIRE NX, sem libs externas)."""
from __future__ import annotations

from fastapi import HTTPException, status

from app.sessions import _get_redis

_KEY_PREFIX = "dayup:rl:"
_DEFAULT_MESSAGE = "Muitas tentativas. Tente novamente em alguns minutos."


def hit(key: str, limit: int, window_seconds: int) -> bool:
    """Incrementa o contador da chave. Retorna True se ainda dentro do limite.

    INCR + EXPIRE NX rodam num MULTI/EXEC só (pipeline transacional), então a
    chave nunca fica sem TTL — mesmo sob concorrência, o primeiro INCR que a
    cria já sai com expiração garantida na mesma operação atômica.
    """
    r = _get_redis()
    full = f"{_KEY_PREFIX}{key}"
    with r.pipeline() as pipe:
        pipe.incr(full)
        pipe.expire(full, window_seconds, nx=True)
        count, _ = pipe.execute()
    return int(count) <= limit


def peek(key: str, limit: int) -> None:
    """Lança 429 se a chave já estourou o limite, sem incrementar.

    Usado antes de operações caras (ex: verificação de senha) pra que um
    invasor não consiga "queimar" tentativas de outra pessoa só de tentar.
    """
    r = _get_redis()
    count = r.get(f"{_KEY_PREFIX}{key}")
    if count is not None and int(count) >= limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, _DEFAULT_MESSAGE)


def enforce(key: str, limit: int, window_seconds: int, message: str = _DEFAULT_MESSAGE) -> None:
    """Lança 429 se a chave estourou o limite na janela."""
    if not hit(key, limit, window_seconds):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, message)
