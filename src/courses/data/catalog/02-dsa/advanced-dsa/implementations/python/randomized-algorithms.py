"""
Python Implementation: Randomized Algorithms (Treap, Skip List)
Invariant: Expected O(log N) with high probability
"""
from typing import Generic, TypeVar, List, Optional

T = TypeVar('T')

class RandomizedAlgorithmsTreapSkipList(Generic[T]):
    def __init__(self) -> None:
        self._items: List[T] = []

    # TODO: Implement core operational method
    def insert(self, value: T) -> None:
        self._items.append(value)

    def __len__(self) -> int:
        return len(self._items)
