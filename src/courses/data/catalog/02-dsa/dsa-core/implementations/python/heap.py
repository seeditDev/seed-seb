"""
Python Implementation: Heap & Priority Queue
Invariant: Insert O(log N), ExtractMin O(log N), Peek O(1)
"""
from typing import Generic, TypeVar, List, Optional

T = TypeVar('T')

class HeapPriorityQueue(Generic[T]):
    def __init__(self) -> None:
        self._items: List[T] = []

    # TODO: Implement core operational method
    def insert(self, value: T) -> None:
        self._items.append(value)

    def __len__(self) -> int:
        return len(self._items)
