from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction

# Nível (0.0 / 0.4 / 0.7 / 1.0) convertido para décimos inteiros — o cálculo
# inteiro/racional evita erro de arredondamento de ponto flutuante binário.
_LEVEL_TENTHS: dict[float, int] = {0.0: 0, 0.4: 4, 0.7: 7, 1.0: 10}


@dataclass
class EntryInput:
    weight: int
    level: float


def _tenths(level: float) -> int:
    try:
        return _LEVEL_TENTHS[level]
    except KeyError:
        raise ValueError(f"level inválido: {level!r}") from None


def compute_score(
    entries: Iterable[EntryInput], unrated_weights: Iterable[int] = ()
) -> int | None:
    """Score = round_half_up((Σ peso × nível) / (Σ pesos) × 100).

    `unrated_weights` são os pesos ATUAIS das metas do conjunto efetivo do dia
    E(date) que não têm entry: entram no denominador mas contribuem 0 no
    numerador (metas com entry já entram via `entries`, com o peso snapshot).

    Arredondamento feito com Fraction/Decimal sobre décimos inteiros — nunca
    com float — para não ter erro de ponto flutuante binário. Retorna None
    quando o denominador (soma dos pesos) é 0.
    """
    total_weight = 0
    numerator_tenths = 0
    for e in entries:
        total_weight += e.weight
        numerator_tenths += e.weight * _tenths(e.level)
    total_weight += sum(unrated_weights)
    if total_weight == 0:
        return None
    # score = (numerator_tenths/10) / total_weight * 100 = numerator_tenths*10/total_weight
    ratio = Fraction(numerator_tenths * 10, total_weight)
    exact = Decimal(ratio.numerator) / Decimal(ratio.denominator)
    return int(exact.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
