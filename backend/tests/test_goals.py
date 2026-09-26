"""Testes de criação individual e em lote. Precisam do Postgres local no ar."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models import Goal, GoalCategory
from app.security import now_utc

GOAL_PAYLOAD = {
    "name": "Nova meta",
    "category": "health",
    "weight": 1,
    "days_of_week": [0],
}


def _bulk_create_goals(db, user, count: int, *, archived: bool = False) -> None:
    goals = [
        Goal(
            user_id=user.id,
            name=f"Meta {i}",
            category=GoalCategory.health,
            weight=1,
            days_of_week=[0],
            archived_at=now_utc() if archived else None,
        )
        for i in range(count)
    ]
    db.add_all(goals)
    db.commit()


def test_criar_meta_alem_do_limite_de_100_ativas_retorna_400(client, as_user, make_user, db):
    user = make_user()
    _bulk_create_goals(db, user, 100)
    client_u = as_user(user)

    resp = client_u.post("/goals", json=GOAL_PAYLOAD)
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Limite de 100 metas ativas atingido."


def test_criar_meta_no_limite_exato_ainda_funciona(client, as_user, make_user, db):
    user = make_user()
    _bulk_create_goals(db, user, 99)
    client_u = as_user(user)

    resp = client_u.post("/goals", json=GOAL_PAYLOAD)
    assert resp.status_code == 201


def test_metas_arquivadas_nao_contam_no_limite(client, as_user, make_user, db):
    user = make_user()
    _bulk_create_goals(db, user, 100, archived=True)
    client_u = as_user(user)

    resp = client_u.post("/goals", json=GOAL_PAYLOAD)
    assert resp.status_code == 201


def test_lote_cria_metas_e_retorna_dados(as_user, make_user, db):
    user = make_user()
    payload = [
        {**GOAL_PAYLOAD, "name": "Treinar", "weight": 3, "days_of_week": [0, 2, 4]},
        {**GOAL_PAYLOAD, "name": "Ler", "category": "study", "weight": 2},
    ]
    resp = as_user(user).post("/goals/batch", json={"goals": payload})
    assert resp.status_code == 201
    result = resp.json()
    assert len(result) == 2
    for created, expected in zip(result, payload, strict=True):
        assert {key: created[key] for key in expected} == expected
        assert created["archived_at"] is None
        stored = db.get(Goal, uuid.UUID(created["id"]))
        assert stored is not None
        assert stored.user_id == user.id
        assert stored.name == expected["name"]


def test_lote_ignora_ativas_e_nomes_repetidos(as_user, make_user, make_goal, db):
    user = make_user()
    existing = make_goal(user)
    existing.name = "  ÁGUA  "
    db.commit()
    payload = [
        {**GOAL_PAYLOAD, "name": name}
        for name in [" água ", "Ler", "  LER  ", "ler"]
    ]
    client_u = as_user(user)
    resp = client_u.post("/goals/batch", json={"goals": payload})
    assert resp.status_code == 201
    assert [g["name"] for g in resp.json()] == ["Ler"]
    # Repetir o mesmo lote não cria nada, mas continua sendo sucesso.
    repeated = client_u.post("/goals/batch", json={"goals": payload})
    assert repeated.status_code == 201
    assert repeated.json() == []
    assert len(client_u.get("/goals").json()) == 2


def test_lote_nome_arquivado_nao_bloqueia(as_user, make_user, make_goal, db):
    user = make_user()
    archived = make_goal(user)
    archived.name = GOAL_PAYLOAD["name"]
    archived.archived_at = now_utc()
    db.commit()
    resp = as_user(user).post("/goals/batch", json={"goals": [GOAL_PAYLOAD]})
    assert resp.status_code == 201
    assert len(resp.json()) == 1
    assert resp.json()[0]["id"] != str(archived.id)


def test_lote_acima_do_limite_nao_cria_nada(as_user, make_user, db):
    user = make_user()
    _bulk_create_goals(db, user, 99)
    client_u = as_user(user)
    before = {g["id"] for g in client_u.get("/goals").json()}
    resp = client_u.post("/goals/batch", json={"goals": [
        GOAL_PAYLOAD, {**GOAL_PAYLOAD, "name": "Outra meta"},
    ]})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Limite de 100 metas ativas atingido."
    assert {g["id"] for g in client_u.get("/goals").json()} == before


def test_lote_limite_considera_apenas_novas_metas(as_user, make_user, db):
    user = make_user()
    _bulk_create_goals(db, user, 99)
    client_u = as_user(user)
    payload = [GOAL_PAYLOAD, GOAL_PAYLOAD, {**GOAL_PAYLOAD, "name": "Meta 0"}]
    resp = client_u.post("/goals/batch", json={"goals": payload})
    assert resp.status_code == 201
    assert len(resp.json()) == 1
    assert len(client_u.get("/goals").json()) == 100
    repeated = client_u.post("/goals/batch", json={"goals": payload})
    assert repeated.status_code == 201
    assert repeated.json() == []


@pytest.mark.parametrize("count", [0, 31])
def test_lote_tamanho_invalido_retorna_422(as_user, count):
    from app.models import User

    user = User(id=uuid.uuid4(), email="batch@example.com", name="Tester", password_hash="x")
    resp = as_user(user).post("/goals/batch", json={"goals": [GOAL_PAYLOAD] * count})
    assert resp.status_code == 422


def test_lote_item_invalido_nao_cria_nada(as_user, make_user):
    client_u = as_user(make_user())
    resp = client_u.post("/goals/batch", json={"goals": [
        GOAL_PAYLOAD, {**GOAL_PAYLOAD, "weight": 4},
    ]})
    assert resp.status_code == 422
    assert client_u.get("/goals").json() == []


def test_lote_isola_metas_por_usuario(as_user, make_user, db):
    owner, other = make_user(), make_user()
    _bulk_create_goals(db, other, 100)
    client_u = as_user(owner)
    resp = client_u.post("/goals/batch", json={"goals": [
        {**GOAL_PAYLOAD, "name": "Meta 0"},
    ]})
    assert resp.status_code == 201
    created_id = resp.json()[0]["id"]
    assert db.get(Goal, uuid.UUID(created_id)).user_id == owner.id
    assert len(client_u.get("/goals").json()) == 1
    client_other = as_user(other)
    assert len(client_other.get("/goals").json()) == 100
    assert client_other.put(f"/goals/{created_id}", json=GOAL_PAYLOAD).status_code == 404
    assert client_other.delete(f"/goals/{created_id}").status_code == 404
    assert len(db.execute(select(Goal).where(Goal.user_id == other.id)).scalars().all()) == 100
