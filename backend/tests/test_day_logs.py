"""Testes dos endpoints da tela Hoje: validação, data futura e autorização.

Os testes de validação/data-futura não tocam o banco. Os de autorização exigem
o Postgres local no ar (docker-compose up).
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import app.routes.day_logs as day_logs_module
from app.main import app
from app.models import DayLog, DayStatus, User
from app.security import get_current_user

TODAY = date.today().isoformat()
FUTURE = (date.today() + timedelta(days=2)).isoformat()


def _transient_user() -> User:
    """Usuário desanexado (sem banco) — só serve para satisfazer a autenticação."""
    return User(
        id=uuid.uuid4(),
        email=f"{uuid.uuid4().hex}@example.com",
        name="X",
        password_hash="x",
    )


def _auth_as_transient() -> None:
    app.dependency_overrides[get_current_user] = lambda: _transient_user()


# ───────────────────────── Validações (sem banco) ─────────────────────────


def test_put_level_invalido_retorna_422(client):
    _auth_as_transient()
    resp = client.put(
        f"/day-logs/{TODAY}",
        json={"entries": [{"goal_id": str(uuid.uuid4()), "level": 0.5}]},
    )
    assert resp.status_code == 422


def test_put_mood_invalido_retorna_422(client):
    _auth_as_transient()
    resp = client.put(f"/day-logs/{TODAY}", json={"mood": "🤖", "entries": []})
    assert resp.status_code == 422


def test_put_note_muito_longa_retorna_422(client):
    _auth_as_transient()
    resp = client.put(f"/day-logs/{TODAY}", json={"note": "a" * 1001, "entries": []})
    assert resp.status_code == 422


def test_put_data_futura_retorna_400(client):
    _auth_as_transient()
    resp = client.put(f"/day-logs/{FUTURE}", json={"entries": []})
    assert resp.status_code == 400


# ───────────────────────── Autorização (precisa de banco) ─────────────────────────


def test_get_dia_de_outro_usuario_nao_vaza_dados(client, as_user, make_user):
    user_a = make_user()
    user_b = make_user()

    # A salva um dia com mood/note.
    client_a = as_user(user_a)
    saved = client_a.put(
        f"/day-logs/{TODAY}",
        json={"mood": "🙂", "note": "dia do A", "entries": []},
    )
    assert saved.status_code == 200

    # B consulta o mesmo dia: recebe um dia vazio, sem os dados do A.
    client_b = as_user(user_b)
    resp = client_b.get(f"/day-logs/{TODAY}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["mood"] is None
    assert body["note"] is None
    assert body["id"] is None
    assert body["entries"] == []


def test_put_com_meta_de_outro_usuario_retorna_400(client, as_user, make_user, make_goal):
    user_a = make_user()
    user_b = make_user()
    goal_a = make_goal(user_a)

    client_b = as_user(user_b)
    resp = client_b.put(
        f"/day-logs/{TODAY}",
        json={"entries": [{"goal_id": str(goal_a.id), "level": 1.0}]},
    )
    assert resp.status_code == 400


def test_fluxo_salvar_e_finalizar(client, as_user, make_user, make_goal):
    user = make_user()
    goal = make_goal(user, weight=3)
    client_u = as_user(user)

    # Salva progresso parcial.
    saved = client_u.put(
        f"/day-logs/{TODAY}",
        json={
            "mood": "😄",
            "note": "foi bem",
            "entries": [{"goal_id": str(goal.id), "level": 1.0, "done_at": "07:30:00"}],
        },
    )
    assert saved.status_code == 200
    body = saved.json()
    assert body["score"] == 100
    assert body["finalized"] is False
    assert body["mood"] == "😄"
    assert body["entries"][0]["done_at"] == "07:30:00"

    # Finaliza.
    finalized = client_u.post(f"/day-logs/{TODAY}/finalize")
    assert finalized.status_code == 200
    assert finalized.json()["finalized"] is True

    # Finalizar de novo é idempotente.
    again = client_u.post(f"/day-logs/{TODAY}/finalize")
    assert again.status_code == 200
    assert again.json()["finalized"] is True


def test_finalize_sem_salvar_retorna_404(client, as_user, make_user):
    user = make_user()
    client_u = as_user(user)
    resp = client_u.post(f"/day-logs/{TODAY}/finalize")
    assert resp.status_code == 404


# ───────────────────────── Limite inferior de data (criação da conta) ─────────────────────────


def test_put_antes_da_criacao_da_conta_retorna_400(client, as_user, make_user):
    user = make_user()  # created_at = agora
    client_u = as_user(user)
    antes = (date.today() - timedelta(days=10)).isoformat()
    resp = client_u.put(f"/day-logs/{antes}", json={"entries": []})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Não é possível registrar dias anteriores à criação da conta."


def test_put_um_dia_antes_da_criacao_da_conta_e_aceito(client, as_user, make_user):
    # O limite inferior é created_at - 1 dia (tolerância pra fuso horário).
    user = make_user()
    client_u = as_user(user)
    ontem_da_criacao = (user.created_at.date() - timedelta(days=1)).isoformat()
    resp = client_u.put(f"/day-logs/{ontem_da_criacao}", json={"entries": []})
    assert resp.status_code == 200


def test_dayoff_antes_da_criacao_da_conta_retorna_400(client, as_user, make_user):
    user = make_user()
    client_u = as_user(user)
    antes = (date.today() - timedelta(days=10)).isoformat()
    resp = client_u.post(f"/day-logs/{antes}/dayoff")
    assert resp.status_code == 400


# ───────────────────────── Tolerância de fuso (+14h) na data futura ─────────────────────────


def test_put_tolerancia_de_14h_aceita_amanha_mas_rejeita_depois(
    client, as_user, make_user, db, monkeypatch
):
    # Fixa o "agora" do servidor pra tornar o limite de +14h determinístico.
    fixed_now = datetime(2024, 1, 1, 20, 0, tzinfo=UTC)  # +14h -> 2024-01-02 10:00
    monkeypatch.setattr(day_logs_module, "now_utc", lambda: fixed_now)

    user = make_user()
    # Conta "antiga" pra não esbarrar no limite inferior de criação da conta.
    user.created_at = datetime(2020, 1, 1, tzinfo=UTC)
    db.commit()
    client_u = as_user(user)

    dentro_da_tolerancia = "2024-01-02"  # amanhã, ainda dentro das 14h
    ok = client_u.put(f"/day-logs/{dentro_da_tolerancia}", json={"entries": []})
    assert ok.status_code == 200

    alem_da_tolerancia = "2024-01-03"
    bloqueado = client_u.put(f"/day-logs/{alem_da_tolerancia}", json={"entries": []})
    assert bloqueado.status_code == 400
    assert bloqueado.json()["detail"] == "Não é possível registrar dias futuros."


# ───────────────────────── Snapshot de peso e reabertura ─────────────────────────


def test_editar_peso_da_meta_nao_reescreve_snapshot_de_entry_existente(
    client, as_user, make_user, make_goal, db
):
    user = make_user()
    goal = make_goal(user, weight=1)
    client_u = as_user(user)

    saved = client_u.put(
        f"/day-logs/{TODAY}", json={"entries": [{"goal_id": str(goal.id), "level": 1.0}]}
    )
    assert saved.json()["entries"][0]["weight"] == 1

    # A meta muda de peso DEPOIS do check-in — o histórico não deve mudar.
    goal.weight = 3
    db.commit()

    saved_again = client_u.put(
        f"/day-logs/{TODAY}", json={"entries": [{"goal_id": str(goal.id), "level": 0.4}]}
    )
    body = saved_again.json()
    assert body["entries"][0]["weight"] == 1  # snapshot preservado
    assert body["score"] == 40  # peso1 × 0.4 / peso1 × 100


def test_nova_entry_usa_peso_atual_da_meta(client, as_user, make_user, make_goal):
    user = make_user()
    goal = make_goal(user, weight=2)
    client_u = as_user(user)
    resp = client_u.put(
        f"/day-logs/{TODAY}", json={"entries": [{"goal_id": str(goal.id), "level": 1.0}]}
    )
    assert resp.json()["entries"][0]["weight"] == 2


def test_salvar_reabre_dia_finalizado(client, as_user, make_user, make_goal):
    user = make_user()
    goal = make_goal(user)
    client_u = as_user(user)
    client_u.put(f"/day-logs/{TODAY}", json={"entries": [{"goal_id": str(goal.id), "level": 1.0}]})
    finalized = client_u.post(f"/day-logs/{TODAY}/finalize")
    assert finalized.json()["finalized"] is True

    reopened = client_u.put(
        f"/day-logs/{TODAY}", json={"entries": [{"goal_id": str(goal.id), "level": 0.7}]}
    )
    assert reopened.status_code == 200
    assert reopened.json()["finalized"] is False


# ───────────────────────── E(date): metas sem entry no denominador ─────────────────────────


def test_score_considera_metas_do_dia_sem_entry_no_denominador(
    client, as_user, make_user, make_goal
):
    user = make_user()
    feita = make_goal(user, weight=2)
    make_goal(user, weight=3)  # ativa todo dia (default do fixture), mas fica sem entry
    client_u = as_user(user)

    resp = client_u.put(
        f"/day-logs/{TODAY}", json={"entries": [{"goal_id": str(feita.id), "level": 1.0}]}
    )
    assert resp.status_code == 200
    # (2×1.0) / (2+3) × 100 = 40 — a meta "pendente" entra só no denominador.
    assert resp.json()["score"] == 40
    assert len(resp.json()["entries"]) == 1  # a pendente não vira entry


def test_finalize_recalcula_com_conjunto_efetivo_atual(client, as_user, make_user, make_goal):
    user = make_user()
    goal_a = make_goal(user, weight=1)
    client_u = as_user(user)

    client_u.put(
        f"/day-logs/{TODAY}", json={"entries": [{"goal_id": str(goal_a.id), "level": 1.0}]}
    )

    # Uma nova meta passa a valer pra hoje DEPOIS do save, antes do finalize.
    make_goal(user, weight=1)

    finalized = client_u.post(f"/day-logs/{TODAY}/finalize")
    assert finalized.status_code == 200
    # peso1 feito (100%) + peso1 novo sem entry -> (1×1.0)/(1+1)×100 = 50
    assert finalized.json()["score"] == 50


# ───────────────────────── Corrida de inserts concorrentes ─────────────────────────


def test_get_or_create_log_lida_com_insercao_concorrente(make_user, db, monkeypatch):
    """Duas requisições podem tentar criar o DayLog do mesmo dia ao mesmo tempo.
    Simula a corrida: a linha já existe (outra request venceu), mas a primeira
    consulta de `_get_or_create_log` ainda não a enxerga — o insert duplicado
    esbarra na unique constraint e deve se recuperar recarregando a linha."""
    user = make_user()
    target = date.today()

    winner = DayLog(user_id=user.id, date=target, status=DayStatus.day_off, score=None)
    db.add(winner)
    db.commit()

    calls = {"n": 0}
    original_lookup = day_logs_module._get_owned_log

    def fake_lookup(db_, user_, target_):
        calls["n"] += 1
        if calls["n"] == 1:
            return None
        return original_lookup(db_, user_, target_)

    monkeypatch.setattr(day_logs_module, "_get_owned_log", fake_lookup)

    log, created = day_logs_module._get_or_create_log(db, user, target, DayStatus.registered)

    assert created is False
    assert log.id == winner.id
    assert calls["n"] == 2
