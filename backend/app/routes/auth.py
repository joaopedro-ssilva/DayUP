"""
Rotas de autenticação.

Recuperação de senha (`/password-reset/request`, `/password-reset/confirm`):
endpoints existem mas retornam 501 — só serão implementados quando houver
serviço de e-mail. Quando for o caso, o fluxo previsto é:
- Gerar token UUID com expiração curta (15-30min) e armazená-lo no Redis
  (chave `dayup:pwreset:<token>` → user_id) ou em uma nova tabela
  `password_reset_tokens (id, user_id, token_hash, expires_at, used_at)`.
- Resposta do `/request` sempre genérica ("se o e-mail existir, você
  receberá um link em breve") pra não permitir enumeração de e-mails.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import User
from app.ratelimit import enforce
from app.schemas import (
    ChangeEmailIn,
    ChangePasswordIn,
    LoginIn,
    RegisterIn,
    UpdateNameIn,
    UserOut,
)
from app.security import (
    clear_session,
    get_current_user,
    hash_password,
    issue_session,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Janelas e limites. Em prod o uvicorn roda com --proxy-headers, então
# request.client.host já é o IP real do usuário (repassado pelo Caddy).
_REGISTER_LIMIT, _REGISTER_WINDOW = 10, 60 * 60        # 10/hora por IP
_LOGIN_IP_LIMIT, _LOGIN_IP_WINDOW = 20, 60 * 15         # 20/15min por IP
_LOGIN_EMAIL_LIMIT, _LOGIN_EMAIL_WINDOW = 5, 60 * 15    # 5/15min por e-mail
_ACCOUNT_LIMIT, _ACCOUNT_WINDOW = 5, 60 * 15            # 5/15min por usuário (email/senha)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    enforce(f"register:ip:{_client_ip(request)}", _REGISTER_LIMIT, _REGISTER_WINDOW)

    user = User(
        email=payload.email.lower(),
        name=payload.name.strip(),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Decisão (CLAUDE.md): resposta direta + rate limiting agressivo no register.
        # Quando email service entrar, migrar para fluxo genérico anti-enumeração.
        raise HTTPException(status.HTTP_409_CONFLICT, "Esse e-mail já está cadastrado.") from None
    db.refresh(user)
    issue_session(response, user, settings)
    return user


@router.post("/login", response_model=UserOut)
def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    email = payload.email.lower().strip()
    enforce(f"login:ip:{_client_ip(request)}", _LOGIN_IP_LIMIT, _LOGIN_IP_WINDOW)
    enforce(f"login:email:{email}", _LOGIN_EMAIL_LIMIT, _LOGIN_EMAIL_WINDOW)

    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None or not verify_password(user.password_hash, payload.password):
        # Mensagem genérica — nunca revelar se foi e-mail ou senha que falhou.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail ou senha incorretos.")
    issue_session(response, user, settings)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    _user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> None:
    clear_session(request, response, settings)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("/me/onboarding-seen", status_code=status.HTTP_204_NO_CONTENT)
def mark_onboarding_seen(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    if not user.onboarding_seen:
        user.onboarding_seen = True
        db.commit()


@router.patch("/me", response_model=UserOut)
def update_name(
    payload: UpdateNameIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    user.name = payload.name
    db.commit()
    db.refresh(user)
    return user


@router.post("/me/change-email", response_model=UserOut)
def change_email(
    payload: ChangeEmailIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    enforce(f"account:email:{user.id}", _ACCOUNT_LIMIT, _ACCOUNT_WINDOW)
    if not verify_password(user.password_hash, payload.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Senha incorreta.")

    new_email = payload.new_email.lower()
    if new_email == user.email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Esse já é o seu e-mail atual.")

    user.email = new_email
    # E-mail trocado ainda não foi confirmado (fluxo de verificação é V1, pendente de serviço de e-mail).
    user.email_verified = False
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Esse e-mail já está em uso.") from None
    db.refresh(user)
    return user


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    enforce(f"account:password:{user.id}", _ACCOUNT_LIMIT, _ACCOUNT_WINDOW)
    if not verify_password(user.password_hash, payload.current_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Senha atual incorreta.")
    if payload.current_password == payload.new_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A nova senha precisa ser diferente da atual.")

    user.password_hash = hash_password(payload.new_password)
    db.commit()


# ─── Recuperação de senha — pendente de serviço de e-mail ───────────────


@router.post("/password-reset/request", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def request_password_reset() -> None:
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED,
        "Recuperação por e-mail ainda não disponível.",
    )


@router.post("/password-reset/confirm", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def confirm_password_reset() -> None:
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED,
        "Recuperação por e-mail ainda não disponível.",
    )
