from __future__ import annotations

import enum
import uuid
from datetime import UTC, date, datetime, time

from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _now() -> datetime:
    return datetime.now(UTC)


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class GoalCategory(enum.StrEnum):
    health = "health"
    study = "study"
    wellness = "wellness"
    food = "food"
    sleep = "sleep"


class DayStatus(enum.StrEnum):
    registered = "registered"
    day_off = "day_off"
    missed = "missed"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(30), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    onboarding_seen: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    goals: Mapped[list[Goal]] = relationship(back_populates="user", cascade="all, delete-orphan")
    day_logs: Mapped[list[DayLog]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Goal(Base):
    __tablename__ = "goals"
    __table_args__ = (
        CheckConstraint("weight BETWEEN 1 AND 3", name="goal_weight_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[GoalCategory] = mapped_column(
        Enum(GoalCategory, name="goal_category"), nullable=False
    )
    weight: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=2)
    # 0 = segunda ... 6 = domingo
    days_of_week: Mapped[list[int]] = mapped_column(ARRAY(SmallInteger), nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    user: Mapped[User] = relationship(back_populates="goals")
    entries: Mapped[list[GoalEntry]] = relationship(
        back_populates="goal", cascade="all, delete-orphan"
    )


class DayLog(Base):
    __tablename__ = "day_logs"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_day_log_user_date"),
        CheckConstraint("score >= 0 AND score <= 100", name="day_log_score_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[DayStatus] = mapped_column(Enum(DayStatus, name="day_status"), nullable=False)
    score: Mapped[float | None] = mapped_column(Float)
    mood: Mapped[str | None] = mapped_column(String(8))
    note: Mapped[str | None] = mapped_column(Text)
    finalized: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )

    user: Mapped[User] = relationship(back_populates="day_logs")
    entries: Mapped[list[GoalEntry]] = relationship(
        back_populates="day_log", cascade="all, delete-orphan"
    )


class GoalEntry(Base):
    __tablename__ = "goal_entries"
    __table_args__ = (
        UniqueConstraint("day_log_id", "goal_id", name="uq_entry_day_goal"),
        CheckConstraint("level IN (0.0, 0.4, 0.7, 1.0)", name="entry_level_values"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    day_log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("day_logs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    goal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("goals.id", ondelete="CASCADE"), nullable=False
    )
    # Snapshot do peso da meta no momento do check-in (metas podem mudar de peso depois).
    weight: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    level: Mapped[float] = mapped_column(Float, nullable=False)
    # Horário em que a meta foi realizada (opcional, nunca obrigatório).
    done_at: Mapped[time | None] = mapped_column(Time)

    day_log: Mapped[DayLog] = relationship(back_populates="entries")
    goal: Mapped[Goal] = relationship(back_populates="entries")
