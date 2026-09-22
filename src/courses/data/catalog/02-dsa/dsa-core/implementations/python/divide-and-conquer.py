"""
Python Implementation: Divide & Conquer
Invariant: Master Theorem: T(N) = aT(N/b) + f(N)
"""
from typing import Generic, TypeVar, List, Optional

T = TypeVar('T')

class DivideConquer(Generic[T]):
    def __init__(self) -> None:
        self._items: List[T] = []

    # TODO: Implement core operational method
    def insert(self, value: T) -> None:
        self._items.append(value)

    def __len__(self) -> int:
        return len(self._items)
