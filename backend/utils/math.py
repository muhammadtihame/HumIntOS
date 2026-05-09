from __future__ import annotations

import random
from typing import Iterable, Tuple, TypeVar


T = TypeVar("T")


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def lerp(current: float, target: float, factor: float) -> float:
    return current + (target - current) * clamp(factor, 0.0, 1.0)


def jitter(scale: float = 1.0) -> float:
    return random.gauss(0.0, scale)


def weighted_choice(options: Iterable[Tuple[T, float]]) -> T:
    items = list(options)
    total = sum(max(0.0, weight) for _, weight in items)
    if total <= 0:
        return items[0][0]
    pick = random.random() * total
    cursor = 0.0
    for item, weight in items:
        cursor += max(0.0, weight)
        if cursor >= pick:
            return item
    return items[-1][0]

