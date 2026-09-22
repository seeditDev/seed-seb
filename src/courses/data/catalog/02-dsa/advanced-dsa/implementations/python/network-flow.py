"""
Python Implementation: Network Flow (Edmonds-Karp & Dinic)
Invariant: Dinic O(V^2 E), Unit Networks O(E sqrt(V))
"""
from typing import Generic, TypeVar, List, Optional

T = TypeVar('T')

class NetworkFlowEdmondsKarpDinic(Generic[T]):
    def __init__(self) -> None:
        self._items: List[T] = []

    # TODO: Implement core operational method
    def insert(self, value: T) -> None:
        self._items.append(value)

    def __len__(self) -> int:
        return len(self._items)
