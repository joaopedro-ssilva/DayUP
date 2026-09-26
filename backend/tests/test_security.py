"""Testes unitários de sessão (Redis), rate limit e validação de schemas.

Não usam o TestClient — batem direto no Redis local (via docker-compose) e
nos schemas Pydantic, então rodam rápido e não dependem do Postgres.
"""
from __future__ import annotations

import uuid
from datetime import UTC, time

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.config import get_settings
from app.models import GoalCategory
from app.ratelimit import _KEY_PREFIX as _RL_PREFIX
from app.ratelimit import hit, peek
from app.schemas import DayUpdateIn, GoalEntryIn, GoalIn, RegisterIn, UpdateNameIn
from app.sessions import (
    _get_redis,
    create_session,
    delete_session,
    read_session,
    revoke_user_sessions,
)


def _rand_user_id() -> str:
    return str(uuid.uuid4())


# ---------- Sessões (Redis) ----------


def test_create_read_delete_session_roundtrip():
    settings = get_settings()
    user_id = _rand_user_id()
    session_id = create_session(user_id, settings)
    assert read_session(session_id) == user_id
    delete_session(session_id)
    assert read_session(session_id) is None


def test_read_legacy_session_indexes_it_for_revocation():
    settings = get_settings()
    r = _get_redis()
    user_id = _rand_user_id()
    session_id = uuid.uuid4().hex
    session_key = f"dayup:sess:{session_id}"
    index_key = f"dayup:user-sess:{user_id}"
    try:
        r.set(session_key, user_id, ex=settings.session_max_age_seconds)
        assert not r.exists(index_key)
        assert read_session(session_id) == user_id
        assert r.sismember(index_key, session_id)
        assert 0 < r.ttl(index_key) <= settings.session_max_age_seconds
        r.expire(index_key, 60)
        assert read_session(session_id) == user_id
        assert 0 < r.ttl(index_key) <= 60
        revoke_user_sessions(user_id)
        assert r.get(session_key) is None
    finally:
        r.delete(session_key, index_key)


def test_revoke_user_sessions_keeps_excepted_session():
    settings = get_settings()
    user_id = _rand_user_id()
    keep = create_session(user_id, settings)
    drop = create_session(user_id, settings)
    try:
        revoke_user_sessions(user_id, except_session_id=keep)
        assert read_session(keep) == user_id
        assert read_session(drop) is None
    finally:
        delete_session(keep)


def test_revoke_user_sessions_without_exception_drops_everything():
    settings = get_settings()
    user_id = _rand_user_id()
    a = create_session(user_id, settings)
    b = create_session(user_id, settings)
    revoke_user_sessions(user_id)
    assert read_session(a) is None
    assert read_session(b) is None


# ---------- Rate limit ----------


def test_hit_always_attaches_a_ttl():
    r = _get_redis()
    key = f"test-ttl-{uuid.uuid4().hex}"
    full = f"{_RL_PREFIX}{key}"
    try:
        assert hit(key, limit=3, window_seconds=60) is True
        ttl = r.ttl(full)
        assert ttl > 0
        # EXPIRE ... NX: uma segunda chamada não deve esticar o TTL de novo.
        assert hit(key, limit=3, window_seconds=60) is True
        assert 0 < r.ttl(full) <= ttl
    finally:
        r.delete(full)


def test_hit_blocks_after_limit_and_peek_does_not_increment():
    r = _get_redis()
    key = f"test-limit-{uuid.uuid4().hex}"
    full = f"{_RL_PREFIX}{key}"
    try:
        assert hit(key, limit=2, window_seconds=60) is True
        assert hit(key, limit=2, window_seconds=60) is True
        assert hit(key, limit=2, window_seconds=60) is False  # 3ª estourou o limite de 2

        count_before = r.get(full)
        with pytest.raises(HTTPException) as exc_info:
            peek(key, limit=2)
        assert exc_info.value.status_code == 429
        # peek não altera o contador, só lê.
        assert r.get(full) == count_before
    finally:
        r.delete(full)


def test_peek_allows_when_under_limit():
    r = _get_redis()
    key = f"test-peek-{uuid.uuid4().hex}"
    full = f"{_RL_PREFIX}{key}"
    try:
        peek(key, limit=5)  # chave nem existe ainda: não deve lançar
        hit(key, limit=5, window_seconds=60)
        peek(key, limit=5)  # 1 < 5: ainda não deve lançar
    finally:
        r.delete(full)


# ---------- Schemas: nomes stripados antes do min_length ----------


def test_register_name_whitespace_only_is_rejected():
    with pytest.raises(ValidationError):
        RegisterIn(
            email="a@example.com",
            name="   ",
            password="Senha1234",
            confirm_password="Senha1234",
        )


def test_register_name_is_stripped_before_length_check():
    reg = RegisterIn(
        email="a@example.com",
        name="  Ana  ",
        password="Senha1234",
        confirm_password="Senha1234",
    )
    assert reg.name == "Ana"


def test_update_name_whitespace_only_is_rejected():
    with pytest.raises(ValidationError):
        UpdateNameIn(name="\t \n")


# ---------- Schemas: metas e check-in ----------


def test_goal_days_of_week_rejects_more_than_seven_raw_items():
    # 8 itens brutos (mesmo com repetição) — o limite é sobre a lista recebida,
    # antes do dedup feito pelo validator.
    with pytest.raises(ValidationError):
        GoalIn(
            name="Teste",
            category=GoalCategory.health,
            days_of_week=[0, 0, 1, 2, 3, 4, 5, 6],
        )


def test_goal_days_of_week_accepts_exactly_seven():
    goal = GoalIn(name="Teste", category=GoalCategory.health, days_of_week=[0, 1, 2, 3, 4, 5, 6])
    assert goal.days_of_week == [0, 1, 2, 3, 4, 5, 6]


def test_goal_name_is_stripped():
    goal = GoalIn(name="  Treino  ", category=GoalCategory.health, days_of_week=[0])
    assert goal.name == "Treino"


def test_goal_entry_rejects_timezone_aware_done_at():
    with pytest.raises(ValidationError):
        GoalEntryIn(
            goal_id=uuid.uuid4(),
            level=1.0,
            done_at=time(10, 0, tzinfo=UTC),
        )


def test_goal_entry_accepts_naive_done_at():
    entry = GoalEntryIn(goal_id=uuid.uuid4(), level=1.0, done_at=time(10, 0))
    assert entry.done_at == time(10, 0)


def test_day_update_rejects_more_than_two_hundred_entries():
    entries = [{"goal_id": str(uuid.uuid4()), "level": 1.0} for _ in range(201)]
    with pytest.raises(ValidationError):
        DayUpdateIn(entries=entries)


def test_day_update_accepts_exactly_two_hundred_entries():
    entries = [{"goal_id": str(uuid.uuid4()), "level": 1.0} for _ in range(200)]
    payload = DayUpdateIn(entries=entries)
    assert len(payload.entries) == 200
