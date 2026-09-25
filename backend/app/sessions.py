"""Session storage in Redis.

A cookie carries an opaque `session_id` (`secrets.token_urlsafe(32)`); the
mapping `session_id → user_id` lives here, keyed under `dayup:sess:<id>` with
a TTL matching the cookie's `max_age`. Logout deletes the key so the cookie
becomes useless even if it leaks.

Cada usuário também tem um índice `dayup:user-sess:<user_id>` (Redis set) com
os ids de todas as suas sessões ativas, usado para revogar sessões em massa
(troca de senha/e-mail, exclusão de conta) sem precisar de um SCAN no Redis.
"""
from __future__ import annotations

import secrets
from functools import lru_cache

import redis

from app.config import Settings

_KEY_PREFIX = "dayup:sess:"
_USER_INDEX_PREFIX = "dayup:user-sess:"


@lru_cache(maxsize=1)
def _get_redis() -> redis.Redis:
    # Settings é cacheado via get_settings(), mas evitamos depender dele aqui
    # importando preguiçosamente quando o singleton é montado.
    from app.config import get_settings

    settings = get_settings()
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)


def _key(session_id: str) -> str:
    return f"{_KEY_PREFIX}{session_id}"


def _user_index_key(user_id: str) -> str:
    return f"{_USER_INDEX_PREFIX}{user_id}"


def create_session(user_id: str, settings: Settings) -> str:
    """Cria uma nova sessão e retorna o session_id opaco."""
    session_id = secrets.token_urlsafe(32)
    ttl = settings.session_max_age_seconds
    r = _get_redis()
    index_key = _user_index_key(user_id)
    with r.pipeline() as pipe:
        pipe.set(_key(session_id), user_id, ex=ttl)
        pipe.sadd(index_key, session_id)
        # TTL do índice sempre renovado pra acompanhar a sessão mais nova do usuário.
        pipe.expire(index_key, ttl)
        pipe.execute()
    return session_id


def read_session(session_id: str | None) -> str | None:
    """Retorna o user_id se a sessão existir e estiver válida, senão None."""
    if not session_id:
        return None
    value = _get_redis().get(_key(session_id))
    # Com decode_responses=True o tipo é str ou None.
    return value if isinstance(value, str) else None


def delete_session(session_id: str | None) -> None:
    """Remove a sessão do Redis e do índice do usuário dono dela."""
    if not session_id:
        return
    r = _get_redis()
    user_id = r.get(_key(session_id))
    r.delete(_key(session_id))
    if isinstance(user_id, str):
        r.srem(_user_index_key(user_id), session_id)


def revoke_user_sessions(user_id: str, except_session_id: str | None = None) -> None:
    """Revoga todas as sessões do usuário, exceto (opcionalmente) uma delas.

    Usado em troca de senha/e-mail e exclusão de conta.
    """
    r = _get_redis()
    index_key = _user_index_key(user_id)
    session_ids = r.smembers(index_key)
    for session_id in session_ids:
        if session_id == except_session_id:
            continue
        r.delete(_key(session_id))
        r.srem(index_key, session_id)
