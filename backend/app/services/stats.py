from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DayLog, DayStatus, User
from app.schemas import StatsOut, StreakOut


@dataclass(frozen=True)
class DayRow:
    """Projeção enxuta de um DayLog — só as colunas que as stats precisam."""

    date: date
    status: DayStatus
    score: float | None


@dataclass(frozen=True)
class _WalkResult:
    current_streak: int
    record_streak: int
    registered_count: int
    day_off_count: int
    pending_count: int


def _classify(row: DayRow | None, d: date, today: date) -> str:
    """Classifica o dia em: registered | day_off | miss | pending.

    Pending = T ou T-1 sem log — janela de graça: ainda não quebra nem soma
    streak, e não entra no denominador da consistência. Qualquer outra
    ausência (d <= T-2), ou um log com status missed, é MISS.
    """
    if row is None:
        if d == today or d == today - timedelta(days=1):
            return "pending"
        return "miss"
    if row.status == DayStatus.missed:
        return "miss"
    if row.status == DayStatus.day_off:
        return "day_off"
    return "registered"


def _walk(by_date: dict[date, DayRow], start: date, today: date) -> _WalkResult:
    """Percorre [start, today] dia a dia calculando streak atual, recorde e as
    contagens usadas na consistência. Função pura — não toca o banco.

    registered soma 1 ao streak corrente; day_off mantém o streak sem somar;
    miss zera; pending não altera nada (só é "pulado").
    """
    run = 0
    record = 0
    registered_count = 0
    day_off_count = 0
    pending_count = 0
    d = start
    while d <= today:
        kind = _classify(by_date.get(d), d, today)
        if kind == "registered":
            run += 1
            record = max(record, run)
            registered_count += 1
        elif kind == "day_off":
            day_off_count += 1
        elif kind == "pending":
            pending_count += 1
        else:  # miss
            run = 0
        d += timedelta(days=1)
    return _WalkResult(
        current_streak=run,
        record_streak=max(record, run),
        registered_count=registered_count,
        day_off_count=day_off_count,
        pending_count=pending_count,
    )


def _avg_and_count(rows: Iterable[DayRow], start: date, end: date) -> tuple[float, int]:
    """Média (2 casas) e contagem dos scores não-nulos de dias registrados em [start, end]."""
    scores = [
        r.score
        for r in rows
        if r.status == DayStatus.registered and r.score is not None and start <= r.date <= end
    ]
    if not scores:
        return 0.0, 0
    return round(sum(scores) / len(scores), 2), len(scores)


def compute_stats(db: Session, user: User, today: date) -> StatsOut:
    """Calcula os índices da Home. `today` é o "hoje" de negócio (T — ver contrato da API).

    Só seleciona as colunas necessárias (date, status, score), não a linha inteira.
    """
    result_rows = db.execute(
        select(DayLog.date, DayLog.status, DayLog.score).where(DayLog.user_id == user.id)
    ).all()
    rows = [DayRow(date=r.date, status=r.status, score=r.score) for r in result_rows]
    by_date = {r.date: r for r in rows}

    created_date = user.created_at.date()
    start = min(created_date, min(by_date)) if by_date else created_date

    walk = _walk(by_date, start, today)

    total_days = (today - start).days + 1
    denom = total_days - walk.day_off_count - walk.pending_count
    consistency = round(walk.registered_count / denom * 100, 2) if denom > 0 else 0.0

    average, _ = _avg_and_count(rows, start, today)

    last_start = today - timedelta(days=13)
    prev_end = last_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=13)

    score_last_14, scored_days_last_14 = _avg_and_count(rows, last_start, today)
    score_prev_14, scored_days_prev_14 = _avg_and_count(rows, prev_start, prev_end)

    return StatsOut(
        streak=StreakOut(current=walk.current_streak, record=walk.record_streak),
        consistency=consistency,
        average_score=average,
        score_last_14=score_last_14,
        score_prev_14=score_prev_14,
        scored_days_last_14=scored_days_last_14,
        scored_days_prev_14=scored_days_prev_14,
    )
