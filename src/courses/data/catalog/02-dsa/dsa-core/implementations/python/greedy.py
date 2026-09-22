"""
Python Implementation: Greedy Algorithms
Invariant: Locally optimal choice yields globally optimal solution
"""
from typing import Generic, TypeVar, List, Optional

T = TypeVar('T')

class GreedyAlgorithms(Generic[T]):
    def __init__(self) -> None:
        self._items: List[T] = []

    # TODO: Implement core operational method
    def insert(self, value: T) -> None:
        self._items.append(value)

    def __len__(self) -> int:
        return len(self._items)
