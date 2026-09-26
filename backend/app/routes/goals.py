from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Goal, User
from app.schemas import GoalBatchIn, GoalIn, GoalOut
from app.security import get_current_user, now_utc

router = APIRouter(prefix="/goals", tags=["goals"])

MAX_ACTIVE_GOALS = 100


@router.get("", response_model=list[GoalOut])
def list_goals(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Goal]:
    stmt = select(Goal).where(Goal.user_id == user.id).order_by(Goal.created_at.desc())
    if not include_archived:
        stmt = stmt.where(Goal.archived_at.is_(None))
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: GoalIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Goal:
    # Compartilha o lock com lotes para preservar o limite em escritas simultâneas.
    db.execute(select(User.id).where(User.id == user.id).with_for_update()).scalar_one()
    active_count = db.execute(
        select(func.count())
        .select_from(Goal)
        .where(Goal.user_id == user.id, Goal.archived_at.is_(None))
    ).scalar_one()
    if active_count >= MAX_ACTIVE_GOALS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Limite de 100 metas ativas atingido.")

    goal = Goal(
        user_id=user.id,
        name=payload.name,
        category=payload.category,
        weight=payload.weight,
        days_of_week=payload.days_of_week,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.post("/batch", response_model=list[GoalOut], status_code=status.HTTP_201_CREATED)
def create_goals_batch(
    payload: GoalBatchIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Goal]:
    # Serializa lotes do mesmo usuário, inclusive dois toques simultâneos.
    db.execute(select(User.id).where(User.id == user.id).with_for_update()).scalar_one()
    active_names = db.execute(
        select(Goal.name).where(Goal.user_id == user.id, Goal.archived_at.is_(None))
    ).scalars().all()
    seen = {name.strip().casefold() for name in active_names}
    goals = []
    for item in payload.goals:
        normalized_name = item.name.strip().casefold()
        if normalized_name in seen:
            continue
        seen.add(normalized_name)
        goals.append(Goal(user_id=user.id, **item.model_dump()))

    if len(active_names) + len(goals) > MAX_ACTIVE_GOALS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Limite de 100 metas ativas atingido.")

    db.add_all(goals)
    db.commit()
    for goal in goals:
        db.refresh(goal)
    return goals


def _get_owned_goal(db: Session, user: User, goal_id: uuid.UUID) -> Goal:
    goal = db.get(Goal, goal_id)
    if goal is None or goal.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meta não encontrada.")
    return goal


@router.put("/{goal_id}", response_model=GoalOut)
def update_goal(
    goal_id: uuid.UUID,
    payload: GoalIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Goal:
    goal = _get_owned_goal(db, user, goal_id)
    goal.name = payload.name
    goal.category = payload.category
    goal.weight = payload.weight
    goal.days_of_week = payload.days_of_week
    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_goal(
    goal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    goal = _get_owned_goal(db, user, goal_id)
    goal.archived_at = now_utc()
    db.commit()
