"""
Python Implementation: Bridges & Articulation Points
Invariant: O(V + E) low-link DFS tree traversal
"""
from typing import Generic, TypeVar, List, Optional

T = TypeVar('T')

class BridgesArticulationPoints(Generic[T]):
    def __init__(self) -> None:
        self._items: List[T] = []

    # TODO: Implement core operational method
    def insert(self, value: T) -> None:
        self._items.append(value)

    def __len__(self) -> int:
        return len(self._items)
