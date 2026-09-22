"""
Python Implementation: Sorting (Quick, Merge, Heap)
Invariant: Comparison O(N log N), Space O(1) to O(N)
"""
from typing import Generic, TypeVar, List, Optional

T = TypeVar('T')

class SortingQuickMergeHeap(Generic[T]):
    def __init__(self) -> None:
        self._items: List[T] = []

    # TODO: Implement core operational method
    def insert(self, value: T) -> None:
        self._items.append(value)

    def __len__(self) -> int:
        return len(self._items)
