"""
Python Implementation: Strings
Invariant: Access O(1), Search O(N), Slice O(K)
"""
from typing import Generic, TypeVar, List, Optional

T = TypeVar('T')

class Strings(Generic[T]):
    def __init__(self) -> None:
        self._items: List[T] = []

    # TODO: Implement core operational method
    def insert(self, value: T) -> None:
        self._items.append(value)

    def __len__(self) -> int:
        return len(self._items)
