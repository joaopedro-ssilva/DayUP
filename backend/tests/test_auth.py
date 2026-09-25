"""Testes de autenticação ponta a ponta: cookies de sessão reais + CSRF
double-submit (sem sobrescrever get_current_user, ao contrário dos testes de
goals/day_logs). Precisam do Postgres e do Redis locais no ar.

Como o TestClient sempre bate com host "testclient", os buckets de rate
limit por IP (`dayup:rl:register:ip:testclient` / `dayup:rl:login:ip:testclient`)
são compartilhados entre execuções — inclusive com outra suíte rodando em
paralelo contra o mesmo Redis. O fixture `_reset_ip_rate_limits` limpa só
essas duas chaves antes/depois de cada teste deste arquivo.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.main import app
from app.models import User
from app.sessions import _get_redis

_PASSWORD = "Senha1234"


def _unique_email() -> str:
    return f"auth-test-{uuid.uuid4().hex}@example.com"


@pytest.fixture(autouse=True)
def _reset_ip_rate_limits() -> Iterator[None]:
    r = _get_redis()
    keys = ["dayup:rl:register:ip:testclient", "dayup:rl:login:ip:testclient"]
    r.delete(*keys)
    yield
    r.delete(*keys)


@pytest.fixture
def cleanup_emails() -> Iterator[list[str]]:
    """Remove (cascade) qualquer usuário criado pelo teste, mesmo se ele já
    tiver sido apagado por um endpoint (delete-account) — nesse caso não há
    nada a fazer."""
    emails: list[str] = []
    yield emails
    session = SessionLocal()
    try:
        for email in emails:
            user = session.execute(select(User).where(User.email == email)).scalar_one_or_none()
            if user is not None:
                session.delete(user)
        session.commit()
    finally:
        session.close()


def _register(client: TestClient, email: str, password: str = _PASSWORD, name: str = "Teste"):
    resp = client.post(
        "/auth/register",
        json={
            "email": email,
            "name": name,
            "password": password,
            "confirm_password": password,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp


def _csrf_headers(client: TestClient) -> dict[str, str]:
    settings = get_settings()
    token = client.cookies.get(settings.csrf_cookie_name)
    assert token, "cookie de CSRF ausente — login/register não rodou nesse client?"
    return {settings.csrf_header_name: token}


# ---------- Fluxo completo: registro → login → me → logout ----------


def test_register_login_me_logout_flow(client: TestClient, cleanup_emails: list[str]):
    email = _unique_email()
    cleanup_emails.append(email)

    reg = _register(client, email)
    assert reg.json()["email"] == email

    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == email

    logout = client.post("/auth/logout", headers=_csrf_headers(client))
    assert logout.status_code == 204

    assert client.get("/auth/me").status_code == 401

    login = client.post("/auth/login", json={"email": email, "password": _PASSWORD})
    assert login.status_code == 200
    assert login.json()["email"] == email
    assert client.get("/auth/me").status_code == 200


def test_login_wrong_password_is_generic_and_unauthenticated(
    client: TestClient, cleanup_emails: list[str]
):
    email = _unique_email()
    cleanup_emails.append(email)
    _register(client, email)
    client.post("/auth/logout", headers=_csrf_headers(client))

    resp = client.post("/auth/login", json={"email": email, "password": "senha-errada-123"})
    assert resp.status_code == 401
    assert client.get("/auth/me").status_code == 401


def test_login_unknown_email_runs_password_check_and_fails_generic(client: TestClient):
    # E-mail inexistente: mesmo assim roda o argon2 (hash fixo) e devolve a
    # mesma mensagem genérica de e-mail/senha inválidos, sem 500 nem diferença
    # de conteúdo que ajude a enumerar contas.
    resp = client.post(
        "/auth/login", json={"email": _unique_email(), "password": "qualquer-coisa-123"}
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "E-mail ou senha incorretos."


# ---------- 422: nunca ecoa senha, nunca vaza input/ctx, sem prefixo "Value error, " ----------


def test_422_never_echoes_password_and_strips_internal_fields(client: TestClient):
    secret = "Sup3rSecretz9"
    resp = client.post(
        "/auth/register",
        json={
            "email": "isso-nao-e-email",
            "name": "Teste",
            "password": secret,
            "confirm_password": secret + "x",
        },
    )
    assert resp.status_code == 422
    assert secret not in resp.text

    body = resp.json()
    assert isinstance(body["detail"], list)
    for error in body["detail"]:
        assert "input" not in error
        assert "ctx" not in error
        assert not error["msg"].startswith("Value error, ")


def test_422_strips_value_error_prefix_from_custom_validator(client: TestClient):
    resp = client.post(
        "/auth/register",
        json={
            "email": _unique_email(),
            "name": "Teste",
            "password": "Senha1234",
            "confirm_password": "Senha12345",
        },
    )
    assert resp.status_code == 422
    errors = resp.json()["detail"]
    assert any(e["msg"] == "As senhas não conferem." for e in errors)
    assert not any(e["msg"].startswith("Value error, ") for e in errors)


# ---------- Troca de senha: revoga outras sessões, gira a atual ----------


def test_change_password_revokes_other_sessions_and_rotates_current_one(
    client: TestClient, cleanup_emails: list[str]
):
    email = _unique_email()
    cleanup_emails.append(email)
    new_password = "NovaSenha123"

    _register(client, email)  # `client` = sessão A

    with TestClient(app) as client_b:
        login_b = client_b.post("/auth/login", json={"email": email, "password": _PASSWORD})
        assert login_b.status_code == 200

        settings = get_settings()
        old_session_cookie = client.cookies.get(settings.session_cookie_name)

        resp = client.post(
            "/auth/me/change-password",
            json={
                "current_password": _PASSWORD,
                "new_password": new_password,
                "confirm_new_password": new_password,
            },
            headers=_csrf_headers(client),
        )
        assert resp.status_code == 204

        new_session_cookie = client.cookies.get(settings.session_cookie_name)
        assert new_session_cookie and new_session_cookie != old_session_cookie

        # Sessão A (quem trocou a senha) continua autenticada, com a sessão nova.
        assert client.get("/auth/me").status_code == 200

        # Sessão B foi revogada.
        assert client_b.get("/auth/me").status_code == 401

    # A senha nova já vale pra um novo login.
    fresh_login = client.post("/auth/login", json={"email": email, "password": new_password})
    assert fresh_login.status_code == 200


# ---------- Conta demo protegida ----------


def test_demo_account_is_protected_from_writes(client: TestClient, cleanup_emails: list[str]):
    demo_email = _unique_email()
    cleanup_emails.append(demo_email)
    # Cadastra antes de marcar como demo: o cadastro com o e-mail demo é bloqueado.
    _register(client, demo_email)
    real_settings = get_settings()
    app.dependency_overrides[get_settings] = lambda: real_settings.model_copy(
        update={"demo_email": demo_email}
    )
    headers = _csrf_headers(client)

    patch_resp = client.patch("/auth/me", json={"name": "Outro Nome"}, headers=headers)
    assert patch_resp.status_code == 403

    new_email = _unique_email()
    change_email_resp = client.post(
        "/auth/me/change-email",
        json={
            "new_email": new_email,
            "confirm_new_email": new_email,
            "password": _PASSWORD,
        },
        headers=headers,
    )
    assert change_email_resp.status_code == 403

    change_password_resp = client.post(
        "/auth/me/change-password",
        json={
            "current_password": _PASSWORD,
            "new_password": "OutraSenha123",
            "confirm_new_password": "OutraSenha123",
        },
        headers=headers,
    )
    assert change_password_resp.status_code == 403

    delete_resp = client.post("/auth/me/delete", json={"password": _PASSWORD}, headers=headers)
    assert delete_resp.status_code == 403

    expected = "A conta demo não pode ser alterada. Crie sua conta para personalizar."
    for resp in (patch_resp, change_email_resp, change_password_resp, delete_resp):
        assert resp.json()["detail"] == expected


# ---------- Exclusão de conta ----------


def test_delete_account_wrong_password_then_success_removes_user_and_data(
    client: TestClient, cleanup_emails: list[str]
):
    email = _unique_email()
    cleanup_emails.append(email)
    _register(client, email)
    headers = _csrf_headers(client)

    goal_resp = client.post(
        "/goals",
        json={"name": "Meta a apagar", "category": "health", "weight": 2, "days_of_week": [0, 1]},
        headers=headers,
    )
    assert goal_resp.status_code == 201

    wrong = client.post("/auth/me/delete", json={"password": "senha-errada-123"}, headers=headers)
    assert wrong.status_code == 401

    ok = client.post("/auth/me/delete", json={"password": _PASSWORD}, headers=headers)
    assert ok.status_code == 204

    assert client.get("/auth/me").status_code == 401

    session = SessionLocal()
    try:
        user = session.execute(select(User).where(User.email == email)).scalar_one_or_none()
        assert user is None
    finally:
        session.close()


# ---------- Exportação: só os dados do próprio usuário ----------


def test_export_is_scoped_to_the_caller_only(client: TestClient, cleanup_emails: list[str]):
    email_a = _unique_email()
    email_b = _unique_email()
    cleanup_emails.extend([email_a, email_b])

    _register(client, email_a)  # `client` = usuário A
    headers_a = _csrf_headers(client)
    goal_a = client.post(
        "/goals",
        json={"name": "Meta da A", "category": "health", "weight": 2, "days_of_week": [0]},
        headers=headers_a,
    )
    assert goal_a.status_code == 201

    with TestClient(app) as client_b:
        _register(client_b, email_b)
        headers_b = _csrf_headers(client_b)
        goal_b = client_b.post(
            "/goals",
            json={"name": "Meta da B", "category": "health", "weight": 2, "days_of_week": [0]},
            headers=headers_b,
        )
        assert goal_b.status_code == 201

    export = client.get("/auth/me/export")
    assert export.status_code == 200
    data = export.json()

    assert data["user"]["email"] == email_a
    assert "goals" in data and "day_logs" in data and "exported_at" in data

    goal_names = {g["name"] for g in data["goals"]}
    assert "Meta da A" in goal_names
    assert "Meta da B" not in goal_names


def test_demo_email_is_reserved_for_register_and_change_email(
    client: TestClient, cleanup_emails: list[str]
):
    demo_email = get_settings().demo_email
    resp = client.post(
        "/auth/register",
        json={
            "email": demo_email,
            "name": "Intruso",
            "password": _PASSWORD,
            "confirm_password": _PASSWORD,
        },
    )
    assert resp.status_code == 409

    email = _unique_email()
    cleanup_emails.append(email)
    assert _register(client, email).status_code == 201
    resp = client.post(
        "/auth/me/change-email",
        json={"new_email": demo_email, "confirm_new_email": demo_email, "password": _PASSWORD},
        headers=_csrf_headers(client),
    )
    assert resp.status_code == 409
