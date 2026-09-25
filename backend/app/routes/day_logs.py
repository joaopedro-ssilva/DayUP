from __future__ import annotations

import uuid
from datetime import UTC, date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import any_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import DayLog, DayStatus, Goal, GoalEntry, User
from app.schemas import DayLogOut, DayUpdateIn, StatsOut
from app.security import get_current_user, now_utc
from app.services.scoring import EntryInput, compute_score
from app.services.stats import compute_stats

router = APIRouter(tags=["day-logs"])

# Tolerância de fuso: aceita "hoje" de qualquer timezone real (o mais adiantado
# é UTC+14) sem deixar o usuário registrar um dia realmente futuro.
_FUTURE_TOLERANCE = timedelta(hours=14)


def _utc_today() -> date:
    return now_utc().date()


def _reject_future(target: date) -> None:
    limit = (now_utc() + _FUTURE_TOLERANCE).date()
    if target > limit:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Não é possível registrar dias futuros.")


def _reject_before_account(target: date, user: User) -> None:
    lower_bound = user.created_at.astimezone(UTC).date() - timedelta(days=1)
    if target < lower_bound:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Não é possível registrar dias anteriores à criação da conta.",
        )


def _get_owned_log(db: Session, user: User, target: date) -> DayLog | None:
    return db.execute(
        select(DayLog)
        .options(selectinload(DayLog.entries))
        .where(DayLog.user_id == user.id, DayLog.date == target)
    ).scalar_one_or_none()


def _get_or_create_log(
    db: Session, user: User, target: date, initial_status: DayStatus
) -> tuple[DayLog, bool]:
    """Busca o DayLog do dia; cria se ainda não existir.

    Duas requisições podem tentar criar o mesmo dia ao mesmo tempo (ex.: duplo
    tap no app). Se o insert esbarrar na unique constraint (user_id, date), a
    corrida foi perdida: descarta a transação e recarrega a linha que a outra
    requisição já criou, em vez de estourar 500.
    """
    log = _get_owned_log(db, user, target)
    if log is not None:
        return log, False
    log = DayLog(user_id=user.id, date=target, status=initial_status)
    db.add(log)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        log = _get_owned_log(db, user, target)
        if log is None:
            raise
        return log, False
    return log, True


def _unrated_goal_weights(
    db: Session, user: User, target: date, entry_goal_ids: set[uuid.UUID]
) -> list[int]:
    """Pesos ATUAIS das metas do conjunto efetivo E(date) que não têm entry no dia.

    E(date) = metas com entry no dia (peso snapshot, já contabilizado por quem
    chama) + metas não arquivadas ativas nesse dia da semana. Esta função
    carrega só a segunda parte que ainda falta: entram no denominador do score
    com o peso atual, com contribuição 0 no numerador.
    """
    weekday = target.weekday()  # 0=segunda .. 6=domingo — mesma convenção do contrato da API
    stmt = select(Goal.weight).where(
        Goal.user_id == user.id,
        Goal.archived_at.is_(None),
        any_(Goal.days_of_week) == weekday,
    )
    if entry_goal_ids:
        stmt = stmt.where(Goal.id.not_in(entry_goal_ids))
    return list(db.execute(stmt).scalars().all())


@router.get("/day-logs", response_model=list[DayLogOut])
def list_day_logs(
    limit: int = Query(14, ge=1, le=90),
    before: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DayLog]:
    stmt = (
        select(DayLog)
        .options(selectinload(DayLog.entries))
        .where(DayLog.user_id == user.id)
        .order_by(DayLog.date.desc())
        .limit(limit)
    )
    if before is not None:
        stmt = stmt.where(DayLog.date < before)
    return list(db.execute(stmt).scalars().all())


@router.get("/day-logs/{target_date}", response_model=DayLogOut)
def get_day_log(
    target_date: date,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DayLog | DayLogOut:
    log = _get_owned_log(db, user, target_date)
    if log is None:
        # Dia ainda não registrado: devolve um DayLog "vazio" (não persiste).
        # O front cruza as metas ativas do dia da semana via /goals.
        return DayLogOut(date=target_date, status=DayStatus.registered, score=None)
    return log


@router.put("/day-logs/{target_date}", response_model=DayLogOut)
def save_day(
    target_date: date,
    payload: DayUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DayLog:
    """Salva progresso parcial. Upsert dos GoalEntries, recalcula score.

    Sempre reabre o dia (finalized=false) — salvar edições de um dia já
    finalizado o reabre, conforme o contrato.
    """
    _reject_future(target_date)
    _reject_before_account(target_date, user)

    goal_ids = [e.goal_id for e in payload.entries]
    goals_by_id: dict[uuid.UUID, Goal] = {}
    if goal_ids:
        goals = db.execute(
            select(Goal).where(Goal.user_id == user.id, Goal.id.in_(goal_ids))
        ).scalars()
        goals_by_id = {g.id: g for g in goals}
        if len(goals_by_id) != len(set(goal_ids)):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Uma ou mais metas não pertencem a você."
            )

    log, _created = _get_or_create_log(db, user, target_date, DayStatus.registered)
    log.status = DayStatus.registered

    # Upsert das entries: atualiza existentes, cria novas, remove as ausentes.
    existing = {e.goal_id: e for e in log.entries}
    keep_goal_ids = set(goal_ids)
    for entry in list(log.entries):
        if entry.goal_id not in keep_goal_ids:
            db.delete(entry)

    score_inputs: list[EntryInput] = []
    for e in payload.entries:
        goal = goals_by_id[e.goal_id]
        entry = existing.get(e.goal_id)
        if entry is None:
            # Nova entry: registra o peso ATUAL da meta (snapshot no momento do check-in).
            entry = GoalEntry(day_log_id=log.id, goal_id=goal.id, weight=goal.weight)
            db.add(entry)
        # Entry já existente: nunca reescreve o peso salvo, só o nível/horário.
        entry.level = e.level
        entry.done_at = e.done_at
        score_inputs.append(EntryInput(weight=entry.weight, level=e.level))

    unrated_weights = _unrated_goal_weights(db, user, target_date, keep_goal_ids)

    log.mood = payload.mood
    log.note = payload.note
    log.finalized = False
    log.score = compute_score(score_inputs, unrated_weights)

    db.commit()
    db.refresh(log)
    return log


@router.post("/day-logs/{target_date}/finalize", response_model=DayLogOut)
def finalize_day(
    target_date: date,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DayLog:
    """Consolida o dia e marca finalized=true. Idempotente."""
    _reject_future(target_date)
    _reject_before_account(target_date, user)

    log = _get_owned_log(db, user, target_date)
    if log is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Salve o progresso do dia antes de finalizar."
        )
    entry_goal_ids = {e.goal_id for e in log.entries}
    unrated_weights = _unrated_goal_weights(db, user, target_date, entry_goal_ids)
    log.status = DayStatus.registered
    log.score = compute_score(
        [EntryInput(weight=e.weight, level=e.level) for e in log.entries], unrated_weights
    )
    log.finalized = True
    db.commit()
    db.refresh(log)
    return log


@router.post("/day-logs/{target_date}/dayoff", response_model=DayLogOut)
def day_off(
    target_date: date,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DayLog:
    """Marca o dia como day_off. Só rejeita datas fora da janela (futuro/antes da conta)."""
    _reject_future(target_date)
    _reject_before_account(target_date, user)

    log, _created = _get_or_create_log(db, user, target_date, DayStatus.day_off)
    log.status = DayStatus.day_off
    log.score = None
    log.finalized = False
    for entry in list(log.entries):
        db.delete(entry)
    db.commit()
    db.refresh(log)
    return log


@router.delete("/day-logs/{target_date}", status_code=status.HTTP_204_NO_CONTENT)
def delete_day_log(
    target_date: date,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    log = _get_owned_log(db, user, target_date)
    if log is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dia não encontrado.")
    db.delete(log)
    db.commit()


@router.get("/stats", response_model=StatsOut)
def stats(
    today: date | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StatsOut:
    utc_today = _utc_today()
    if today is None:
        business_today = utc_today
    else:
        if today < utc_today - timedelta(days=1) or today > utc_today + timedelta(days=1):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Data de referência inválida.")
        business_today = today
    return compute_stats(db, user, business_today)
