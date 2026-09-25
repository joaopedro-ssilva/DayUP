"""Testes das regras finas do score: arredondamento exato (sem erro de float)
e metas de E(date) sem entry entrando só no denominador. Tudo puro, sem banco.
"""
from __future__ import annotations

import pytest

from app.services.scoring import EntryInput, compute_score


def test_caso_classico_de_erro_de_float_arredonda_certo():
    # Em float puro, 3×0.7 + 1×1.0 = 3.0999999999999996 (não 3.1), e
    # 77.49999999999999 seria arredondado para 77 por round(). O cálculo exato
    # (décimos inteiros via Fraction/Decimal) dá 77.5 → HALF_UP → 78.
    entries = [EntryInput(weight=3, level=0.7), EntryInput(weight=1, level=1.0)]
    assert compute_score(entries) == 78


def test_apenas_metas_pendentes_sem_nenhuma_entry_da_zero_nao_none():
    # Nenhuma meta avaliada ainda, mas há metas de E(date) no denominador:
    # o dia tem score 0 (regressão possível), não None.
    assert compute_score([], unrated_weights=[2, 3]) == 0


def test_sem_entries_e_sem_metas_pendentes_da_none():
    assert compute_score([]) is None
    assert compute_score([], unrated_weights=[]) is None


def test_metas_com_entry_e_sem_entry_juntas_no_mesmo_dia():
    # Meta feita (peso 2, 100%) + meta de E(date) sem entry (peso 3): só o
    # peso da segunda entra no denominador, contribuição 0 no numerador.
    # (2×1.0) / (2+3) × 100 = 40
    entries = [EntryInput(weight=2, level=1.0)]
    assert compute_score(entries, unrated_weights=[3]) == 40


def test_level_fora_do_conjunto_permitido_levanta_value_error():
    with pytest.raises(ValueError):
        compute_score([EntryInput(weight=1, level=0.5)])
