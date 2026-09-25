from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import User
from app.ratelimit import enforce
from app.sessions import create_session, delete_session, read_session

_hasher = PasswordHasher()

# Hash fixo só pra gastar o mesmo tempo de CPU quando o e-mail não existe —
# evita que a resposta do login seja mais rápida e revele a conta ausente.
DUMMY_PASSWORD_HASH = _hasher.hash("dayup-timing-safety-dummy-password")

_WRITE_LIMIT, _WRITE_WINDOW = 120, 60  # 120 escritas/min por usuário autenticado


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def needs_rehash(password_hash: str) -> bool:
    """True se o hash foi gerado com parâmetros antigos e deve ser regravado."""
    return _hasher.check_needs_rehash(password_hash)


def _set_cookie(
    response: Response,
    name: str,
    value: str,
    *,
    settings: Settings,
    http_only: bool,
) -> None:
    response.set_cookie(
        key=name,
        value=value,
        max_age=settings.session_max_age_seconds,
        httponly=http_only,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )


def issue_session(response: Response, user: User, settings: Settings) -> str:
    """
    Cria a sessão no Redis e seta o cookie com o session_id opaco.
    Retorna o CSRF token (também devolvido via header).
    """
    session_id = create_session(str(user.id), settings)
    csrf_token = secrets.token_urlsafe(32)
    _set_cookie(
        response, settings.session_cookie_name, session_id, settings=settings, http_only=True
    )
    # CSRF cookie é legível pelo JS pra ecoar no header (double-submit).
    _set_cookie(
        response, settings.csrf_cookie_name, csrf_token, settings=settings, http_only=False
    )
    response.headers[settings.csrf_header_name] = csrf_token
    return csrf_token


def clear_session(request: Request, response: Response, settings: Settings) -> None:
    """Invalida a sessão no Redis e limpa os cookies do browser."""
    session_id = request.cookies.get(settings.session_cookie_name)
    delete_session(session_id)
    # Browsers só aceitam o cookie de deleção se SameSite/Secure baterem com os do cookie original.
    for name in (settings.session_cookie_name, settings.csrf_cookie_name):
        response.delete_cookie(
            key=name,
            path="/",
            samesite="lax",
            secure=settings.session_cookie_secure,
        )


_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    session_id = request.cookies.get(settings.session_cookie_name)
    user_id = read_session(session_id)
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Não autenticado.")

    # CSRF: para qualquer método que muda estado, exigir o token no header igual ao do cookie.
    if request.method not in _SAFE_METHODS:
        cookie_token = request.cookies.get(settings.csrf_cookie_name)
        header_token = request.headers.get(settings.csrf_header_name)
        if not cookie_token or not header_token or not secrets.compare_digest(
            cookie_token, header_token
        ):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "CSRF token inválido.")

        # Rate limit por usuário autenticado, pra uma conta comprometida ou um
        # bug no front não conseguir martelar a API indefinidamente.
        enforce(
            f"write:user:{user_id}",
            _WRITE_LIMIT,
            _WRITE_WINDOW,
            "Muitas alterações em pouco tempo. Tente novamente em instantes.",
        )

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão inválida.")
    return user


def now_utc() -> datetime:
    return datetime.now(UTC)


__all__: list[Any] = [
    "hash_password",
    "verify_password",
    "needs_rehash",
    "DUMMY_PASSWORD_HASH",
    "issue_session",
    "clear_session",
    "get_current_user",
    "now_utc",
]
