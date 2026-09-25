"""Testes do limite de metas ativas. Precisam do Postgres local no ar."""
from __future__ import annotations

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
