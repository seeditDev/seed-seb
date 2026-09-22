"""
Python Implementation: Hashing (Hash Table & Map)
Invariant: Amortized O(1) Lookup/Insert/Delete
"""
from typing import Generic, TypeVar, List, Optional

T = TypeVar('T')

class HashingHashTableMap(Generic[T]):
    def __init__(self) -> None:
        self._items: List[T] = []

    # TODO: Implement core operational method
    def insert(self, value: T) -> None:
        self._items.append(value)

    def __len__(self) -> int:
        return len(self._items)
