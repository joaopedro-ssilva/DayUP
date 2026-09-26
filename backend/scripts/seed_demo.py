"""Seed an idempotent demo account for apresentação.

Run with the venv activated, from the backend/ folder:

    python -m scripts.seed_demo

Cria (ou recria do zero) a conta:
    Email: demo@dayup.app
    Senha: demo1234
    Nome:  João Demo

Com 7 metas variadas e 29 dias de histórico — incluindo day offs,
um dia perdido (missed) que quebra streak antigo, e o streak atual
em reconstrução. O dia de hoje fica em aberto, sem registro, pronto
para o check-in ao vivo na apresentação. Faz update se a conta já existe.
"""
from __future__ import annotations

import random
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.db import SessionLocal
from app.models import (
    DayLog,
    DayStatus,
    Goal,
    GoalCategory,
    GoalEntry,
    User,
)
from app.security import hash_password, now_utc
from app.services.scoring import EntryInput, compute_score

DEMO_EMAIL = "demo@dayup.app"
DEMO_PASSWORD = "demo1234"
DEMO_NAME = "João Demo"

# Convenção do backend: 0=segunda ... 6=domingo
ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
WEEKDAYS = [0, 1, 2, 3, 4]
MWF = [0, 2, 4]
TT = [1, 3]

GOALS_SPEC = [
    {"name": "Beber 2L de água",   "category": GoalCategory.health,   "weight": 3, "days": ALL_DAYS},
    {"name": "Dormir 8 horas",     "category": GoalCategory.sleep,    "weight": 3, "days": ALL_DAYS},
    {"name": "Treino na academia", "category": GoalCategory.health,   "weight": 3, "days": MWF},
    {"name": "Ler 30 minutos",     "category": GoalCategory.study,    "weight": 2, "days": WEEKDAYS},
    {"name": "Meditar 10min",      "category": GoalCategory.wellness, "weight": 2, "days": ALL_DAYS},
    {"name": "Comer 5 vegetais",   "category": GoalCategory.food,     "weight": 2, "days": ALL_DAYS},
    {"name": "Estudar React",      "category": GoalCategory.study,    "weight": 3, "days": TT},
]

# (dias_atrás, qualidade_média_alvo, status_especial)
# Hoje (dia 0) fica de fora de propósito — sem DayLog, pronto para registro ao vivo.
# Streak atual: 6 dias (1..6). Quebra em day 7 (missed). Recorde antigo: 22 dias (8..29).
HISTORY: list[tuple[int, float | None, str | None]] = [
    (1,  0.85, None),
    (2,  0.78, None),
    (3,  0.88, None),
    (4,  0.70, None),
    (5,  None, "day_off"),
    (6,  0.82, None),
    (7,  None, "missed"),    # ← quebra do streak antigo
    (8,  0.65, None),
    (9,  0.78, None),
    (10, 0.91, None),
    (11, 0.55, None),
    (12, None, "day_off"),
    (13, 0.84, None),
    (14, 0.72, None),
    (15, 0.68, None),
    (16, 0.95, None),
    (17, 0.45, None),
    (18, 0.80, None),
    (19, 0.75, None),
    (20, None, "day_off"),
    (21, 0.62, None),
    (22, 0.88, None),
    (23, 0.70, None),
    (24, 0.84, None),
    (25, 0.60, None),
    (26, 0.78, None),
    (27, 0.55, None),
    (28, 0.91, None),
    (29, 0.66, None),
]


def _business_today() -> date:
    """'Hoje' de negócio usado pro seed — data UTC, mesmo critério do backend
    (evita date.today(), que depende do fuso do servidor onde o script roda)."""
    return now_utc().date()


def pick_level(target: float, rng: random.Random) -> float:
    """Sorteia um nível (0 / 0.4 / 0.7 / 1.0) com distribuição enviesada para a média alvo."""
    if target >= 0.85:
        weights = [0.02, 0.05, 0.23, 0.70]
    elif target >= 0.70:
        weights = [0.05, 0.15, 0.40, 0.40]
    elif target >= 0.55:
        weights = [0.10, 0.30, 0.40, 0.20]
    elif target >= 0.40:
        weights = [0.20, 0.40, 0.30, 0.10]
    else:
        weights = [0.40, 0.40, 0.15, 0.05]
    return rng.choices([0.0, 0.4, 0.7, 1.0], weights=weights)[0]


def run() -> None:
    rng = random.Random(42)
    today = _business_today()
    # created_at = primeiro dia do histórico gerado, pra bater com o novo limite
    # inferior de data (created_at - 1 dia) e com a consistência exibida na Home.
    max_days_ago = max(days_ago for days_ago, _, _ in HISTORY)
    first_day = today - timedelta(days=max_days_ago)
    created_at = datetime(first_day.year, first_day.month, first_day.day, tzinfo=UTC)

    db = SessionLocal()
    try:
        # ── User: find or create, then wipe existing data
        user = db.execute(select(User).where(User.email == DEMO_EMAIL)).scalar_one_or_none()
        if user is None:
            user = User(
                email=DEMO_EMAIL,
                name=DEMO_NAME,
                password_hash=hash_password(DEMO_PASSWORD),
                created_at=created_at,
            )
            db.add(user)
            db.flush()
        else:
            # Atualiza senha/nome (caso tenham mudado entre rodadas) e zera tudo
            user.name = DEMO_NAME
            user.password_hash = hash_password(DEMO_PASSWORD)
            user.created_at = created_at
            for log in list(user.day_logs):
                db.delete(log)
            for g in list(user.goals):
                db.delete(g)
            db.flush()
        # Onboarding sempre reaparece num reseed — é o estado esperado pra apresentação.
        user.onboarding_seen = False

        # ── Metas
        goals: list[Goal] = []
        for spec in GOALS_SPEC:
            g = Goal(
                user_id=user.id,
                name=spec["name"],
                category=spec["category"],
                weight=spec["weight"],
                days_of_week=spec["days"],
            )
            db.add(g)
            goals.append(g)
        db.flush()

        # ── Day logs
        for days_ago, quality, special in HISTORY:
            d = today - timedelta(days=days_ago)
            weekday = d.weekday()  # 0=Monday, bate com convenção do backend

            if special == "day_off":
                db.add(DayLog(user_id=user.id, date=d, status=DayStatus.day_off, score=None))
                continue
            if special == "missed":
                db.add(DayLog(user_id=user.id, date=d, status=DayStatus.missed, score=None))
                continue

            # Todos os dias do histórico já ficaram no passado — fechados.
            log = DayLog(
                user_id=user.id,
                date=d,
                status=DayStatus.registered,
                finalized=True,
            )
            db.add(log)
            db.flush()

            score_inputs: list[EntryInput] = []
            applicable = [g for g in goals if weekday in g.days_of_week]
            for g in applicable:
                level = pick_level(quality or 0.5, rng)
                db.add(GoalEntry(day_log_id=log.id, goal_id=g.id, weight=g.weight, level=level))
                score_inputs.append(EntryInput(weight=g.weight, level=level))

            log.score = compute_score(score_inputs)

        db.commit()

        print()
        print("[OK] Conta demo pronta!")
        print(f"  Email:    {DEMO_EMAIL}")
        print(f"  Senha:    {DEMO_PASSWORD}")
        print(f"  Nome:     {DEMO_NAME}")
        print(f"  Metas:    {len(goals)}")
        print(
            f"  Dias:     {len(HISTORY)} "
            f"(de {(today - timedelta(days=1)).isoformat()} ate {first_day.isoformat()})"
        )
        print("  Hoje:     em aberto, sem registro")
        print()
    finally:
        db.close()


if __name__ == "__main__":
    run()
