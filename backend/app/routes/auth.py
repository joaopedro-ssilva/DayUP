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
from sqlalchemy.orm import Session, selectinload

from app.config import Settings, get_settings
from app.db import get_db
from app.models import DayLog, Goal, User
from app.ratelimit import enforce, hit, peek
from app.schemas import (
    ChangeEmailIn,
    ChangePasswordIn,
    DeleteAccountIn,
    LoginIn,
    RegisterIn,
    UpdateNameIn,
    UserOut,
)
from app.security import (
    DUMMY_PASSWORD_HASH,
    clear_session,
    get_current_user,
    hash_password,
    issue_session,
    needs_rehash,
    now_utc,
    verify_password,
)
from app.sessions import delete_session, revoke_user_sessions

router = APIRouter(prefix="/auth", tags=["auth"])

# Janelas e limites. Em prod o uvicorn roda com --proxy-headers, então
# request.client.host já é o IP real do usuário (repassado pelo Caddy).
_REGISTER_LIMIT, _REGISTER_WINDOW = 10, 60 * 60        # 10/hora por IP
_LOGIN_IP_LIMIT, _LOGIN_IP_WINDOW = 20, 60 * 15         # 20/15min por IP
_LOGIN_EMAIL_LIMIT, _LOGIN_EMAIL_WINDOW = 5, 60 * 15    # 5/15min por e-mail (só falhas)
_ACCOUNT_LIMIT, _ACCOUNT_WINDOW = 5, 60 * 15            # 5/15min por usuário (email/senha/exclusão)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _reject_demo_account(user: User, settings: Settings) -> None:
    """A conta demo pública não pode ser alterada nem excluída (vandalismo)."""
    if user.email == settings.demo_email:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "A conta demo não pode ser alterada. Crie sua conta para personalizar.",
        )


def _drop_stale_session(request: Request, settings: Settings) -> None:
    """Se o browser já trazia um cookie de sessão (ex: outra aba, sessão expirada
    localmente), apaga essa sessão antiga no Redis antes de emitir uma nova —
    evita acumular sessões órfãs no índice do usuário."""
    old_session_id = request.cookies.get(settings.session_cookie_name)
    if old_session_id:
        delete_session(old_session_id)


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
        name=payload.name,
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

    _drop_stale_session(request, settings)
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

    email_key = f"login:email:{email}"
    # O bucket por e-mail só conta falhas (incrementadas mais abaixo), então só
    # checamos aqui se ele já estourou — sem incrementar antes de saber o resultado.
    peek(email_key, _LOGIN_EMAIL_LIMIT)

    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    # Roda o argon2 mesmo quando o e-mail não existe (hash fixo) pra manter o
    # tempo de resposta parecido e não revelar por timing se a conta existe.
    password_hash = user.password_hash if user is not None else DUMMY_PASSWORD_HASH
    password_ok = verify_password(password_hash, payload.password)

    if user is None or not password_ok:
        hit(email_key, _LOGIN_EMAIL_LIMIT, _LOGIN_EMAIL_WINDOW)
        # Mensagem genérica — nunca revelar se foi e-mail ou senha que falhou.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail ou senha incorretos.")

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)
        db.commit()

    _drop_stale_session(request, settings)
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
    settings: Settings = Depends(get_settings),
) -> User:
    _reject_demo_account(user, settings)
    user.name = payload.name
    db.commit()
    db.refresh(user)
    return user


@router.post("/me/change-email", response_model=UserOut)
def change_email(
    payload: ChangeEmailIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    _reject_demo_account(user, settings)
    enforce(f"account:email:{user.id}", _ACCOUNT_LIMIT, _ACCOUNT_WINDOW)
    if not verify_password(user.password_hash, payload.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Senha incorreta.")

    new_email = payload.new_email.lower()
    if new_email == user.email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Esse já é o seu e-mail atual.")

    user.email = new_email
    # E-mail trocado ainda não foi confirmado (verificação é V1, pendente de serviço de e-mail).
    user.email_verified = False
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Esse e-mail já está em uso.") from None
    db.refresh(user)

    # Outras sessões podem ter sido abertas com o e-mail antigo — revoga todas
    # menos a atual (quem trocou continua logado neste navegador).
    current_session_id = request.cookies.get(settings.session_cookie_name)
    revoke_user_sessions(str(user.id), except_session_id=current_session_id)
    return user


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordIn,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    _reject_demo_account(user, settings)
    enforce(f"account:password:{user.id}", _ACCOUNT_LIMIT, _ACCOUNT_WINDOW)
    if not verify_password(user.password_hash, payload.current_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Senha atual incorreta.")
    if payload.current_password == payload.new_password:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "A nova senha precisa ser diferente da atual."
        )

    user.password_hash = hash_password(payload.new_password)
    db.commit()

    # Uma senha trocada invalida qualquer outra sessão aberta; a sessão atual
    # é girada (novo session_id + novo CSRF) em vez de só revalidada.
    current_session_id = request.cookies.get(settings.session_cookie_name)
    revoke_user_sessions(str(user.id), except_session_id=current_session_id)
    delete_session(current_session_id)
    issue_session(response, user, settings)


@router.post("/me/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    payload: DeleteAccountIn,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    _reject_demo_account(user, settings)
    enforce(f"account:delete:{user.id}", _ACCOUNT_LIMIT, _ACCOUNT_WINDOW)
    if not verify_password(user.password_hash, payload.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Senha incorreta.")

    revoke_user_sessions(str(user.id))
    clear_session(request, response, settings)
    db.delete(user)  # cascade cuida de goals/day_logs/entries
    db.commit()


@router.get("/me/export")
def export_data(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Exporta todos os dados do usuário autenticado (portabilidade de dados)."""
    goals = db.execute(
        select(Goal).where(Goal.user_id == user.id).order_by(Goal.created_at)
    ).scalars().all()
    logs = db.execute(
        select(DayLog)
        .options(selectinload(DayLog.entries))
        .where(DayLog.user_id == user.id)
        .order_by(DayLog.date)
    ).scalars().all()

    return {
        "exported_at": now_utc(),
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "created_at": user.created_at,
        },
        "goals": [
            {
                "id": g.id,
                "name": g.name,
                "category": g.category,
                "weight": g.weight,
                "days_of_week": g.days_of_week,
                "archived_at": g.archived_at,
            }
            for g in goals
        ],
        "day_logs": [
            {
                "date": log.date,
                "status": log.status,
                "score": log.score,
                "mood": log.mood,
                "note": log.note,
                "finalized": log.finalized,
                "entries": [
                    {
                        "goal_id": e.goal_id,
                        "weight": e.weight,
                        "level": e.level,
                        "done_at": e.done_at,
                    }
                    for e in log.entries
                ],
            }
            for log in logs
        ],
    }


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
