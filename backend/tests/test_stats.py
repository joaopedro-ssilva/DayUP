"""Testes das stats (streak, recorde, consistência, médias).

`_classify`, `_walk` e `_avg_and_count` são funções puras (sem banco). Os
testes de `compute_stats` e do endpoint `/stats` precisam do Postgres local
no ar (docker-compose up) e usam as fixtures `client`/`as_user`/`make_user`/
`db` de conftest.py.
"""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from app.models import DayLog, DayStatus
from app.services.stats import DayRow, _avg_and_count, _classify, _walk, compute_stats

# T fixo pros testes puros — qualquer data serve, não depende do relógio real.
T = date(2024, 6, 15)


def _row(d: date, status: DayStatus, score: float | None = None) -> DayRow:
    return DayRow(date=d, status=status, score=score)


# ───────────────────────── _classify (puro) ─────────────────────────


def test_classify_ausencia_em_t_e_pending():
    assert _classify(None, T, T) == "pending"


def test_classify_ausencia_em_t_menos_1_e_pending():
    assert _classify(None, T - timedelta(days=1), T) == "pending"


def test_classify_ausencia_em_t_menos_2_e_miss():
    assert _classify(None, T - timedelta(days=2), T) == "miss"


def test_classify_status_missed_e_sempre_miss_mesmo_dentro_da_graca():
    # Log com status missed em T (dentro da janela de graça) ainda quebra —
    # a graça só protege a AUSÊNCIA de log, não um miss explícito.
    row = _row(T, DayStatus.missed)
    assert _classify(row, T, T) == "miss"


def test_classify_day_off():
    assert _classify(_row(T, DayStatus.day_off), T, T) == "day_off"


def test_classify_registered():
    assert _classify(_row(T, DayStatus.registered, 80), T, T) == "registered"


# ───────────────────────── _walk (puro) ─────────────────────────


def test_walk_streak_atual_com_graca_em_t_e_t_menos_1():
    # Registrado em T-3 e T-2; T-1 e T ainda sem log — graça, não quebra nem soma.
    start = T - timedelta(days=3)
    by_date = {
        T - timedelta(days=3): _row(T - timedelta(days=3), DayStatus.registered),
        T - timedelta(days=2): _row(T - timedelta(days=2), DayStatus.registered),
    }
    result = _walk(by_date, start, T)
    assert result.current_streak == 2
    assert result.pending_count == 2  # T e T-1


def test_walk_day_off_mantem_streak_sem_somar():
    start = T - timedelta(days=2)
    by_date = {
        T - timedelta(days=2): _row(T - timedelta(days=2), DayStatus.registered),
        T - timedelta(days=1): _row(T - timedelta(days=1), DayStatus.day_off),
        T: _row(T, DayStatus.registered),
    }
    result = _walk(by_date, start, T)
    assert result.current_streak == 2  # day_off não soma, mas não quebra
    assert result.day_off_count == 1


def test_walk_miss_quebra_streak():
    start = T - timedelta(days=4)
    by_date = {
        T - timedelta(days=4): _row(T - timedelta(days=4), DayStatus.registered),
        T - timedelta(days=3): _row(T - timedelta(days=3), DayStatus.missed),
        T - timedelta(days=2): _row(T - timedelta(days=2), DayStatus.registered),
    }
    result = _walk(by_date, start, T)
    # T-4 registrado (run=1) -> T-3 missed (run=0) -> T-2 registrado (run=1) -> T-1,T pending
    assert result.current_streak == 1
    assert result.record_streak == 1


def test_walk_recorde_maior_que_streak_atual_apos_lacuna():
    # Um streak antigo de 5 dias, depois um miss, depois o streak atual de 2 dias.
    start = T - timedelta(days=10)
    by_date: dict[date, DayRow] = {}
    for i in range(6, 11):  # T-10..T-6: 5 dias registrados seguidos (recorde)
        d = T - timedelta(days=i)
        by_date[d] = _row(d, DayStatus.registered)
    by_date[T - timedelta(days=5)] = _row(T - timedelta(days=5), DayStatus.missed)
    by_date[T - timedelta(days=3)] = _row(T - timedelta(days=3), DayStatus.registered)
    by_date[T - timedelta(days=2)] = _row(T - timedelta(days=2), DayStatus.registered)
    # T-4 sem log e d<=T-2 → miss: separa o streak antigo do atual.

    result = _walk(by_date, start, T)
    assert result.record_streak == 5
    assert result.current_streak == 2


# ───────────────────────── _avg_and_count (puro) ─────────────────────────


def test_avg_and_count_ignora_score_none_e_dias_nao_registrados():
    rows = [
        _row(T, DayStatus.registered, 80),
        _row(T - timedelta(days=1), DayStatus.day_off, None),
        _row(T - timedelta(days=2), DayStatus.registered, 60),
    ]
    avg, count = _avg_and_count(rows, T - timedelta(days=2), T)
    assert count == 2
    assert avg == 70.0


def test_avg_and_count_vazio_da_zero_sem_quebrar():
    assert _avg_and_count([], T - timedelta(days=5), T) == (0.0, 0)


# ───────────────────────── compute_stats (precisa de banco) ─────────────────────────


def test_compute_stats_cenario_completo(make_user, db):
    user = make_user()
    today = date.today()
    start = today - timedelta(days=5)
    # created_at = início do histórico gerado no teste, pra "start" bater com o 1º log.
    user.created_at = datetime(start.year, start.month, start.day, tzinfo=UTC)
    db.commit()

    db.add(DayLog(user_id=user.id, date=start, status=DayStatus.registered, score=80))
    db.add(
        DayLog(
            user_id=user.id, date=today - timedelta(days=4), status=DayStatus.day_off, score=None
        )
    )
    db.add(
        DayLog(
            user_id=user.id,
            date=today - timedelta(days=3),
            status=DayStatus.registered,
            score=60,
        )
    )
    # today-2 fica sem log (miss); today-1 e today também (pending).
    db.commit()

    result = compute_stats(db, user, today)

    assert result.streak.current == 0  # quebrado pelo dia sem log em T-2
    assert result.streak.record == 2  # os 2 dias registrados seguidos no início
    assert result.average_score == 70.0
    assert result.consistency == round(2 / 3 * 100, 2)  # denom = 6 dias - 1 day_off - 2 pending
    assert result.scored_days_last_14 == 2
    assert result.score_last_14 == 70.0
    assert result.scored_days_prev_14 == 0
    assert result.score_prev_14 == 0.0


def test_compute_stats_sem_nenhum_log_da_tudo_zerado(make_user, db):
    user = make_user()
    today = date.today()
    result = compute_stats(db, user, today)
    assert result.streak.current == 0
    assert result.streak.record == 0
    assert result.average_score == 0.0
    assert result.consistency == 0.0
    assert result.scored_days_last_14 == 0
    assert result.scored_days_prev_14 == 0


# ───────────────────────── GET /stats?today= (precisa de banco) ─────────────────────────


def test_stats_today_fora_da_janela_retorna_400(client, as_user, make_user):
    user = make_user()
    client_u = as_user(user)
    fora = (date.today() + timedelta(days=5)).isoformat()
    resp = client_u.get(f"/stats?today={fora}")
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Data de referência inválida."


def test_stats_today_dentro_da_janela_e_aceito(client, as_user, make_user):
    user = make_user()
    client_u = as_user(user)
    ontem = (date.today() - timedelta(days=1)).isoformat()
    resp = client_u.get(f"/stats?today={ontem}")
    assert resp.status_code == 200
    assert "scored_days_last_14" in resp.json()


def test_stats_sem_today_usa_data_utc(client, as_user, make_user):
    user = make_user()
    client_u = as_user(user)
    resp = client_u.get("/stats")
    assert resp.status_code == 200
