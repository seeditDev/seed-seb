"""
Python Implementation: Arrays
Invariant: Access O(1), Search O(N), Insert/Delete O(N)
"""
from typing import Generic, TypeVar, List, Optional

T = TypeVar('T')

class Arrays(Generic[T]):
    def __init__(self) -> None:
        self._items: List[T] = []

    # TODO: Implement core operational method
    def insert(self, value: T) -> None:
        self._items.append(value)

    def __len__(self) -> int:
        return len(self._items)
