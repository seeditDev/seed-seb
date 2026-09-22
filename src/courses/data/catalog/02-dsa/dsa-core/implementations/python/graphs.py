"""
Python Implementation: Graphs (BFS & DFS Traversals)
Invariant: Time O(V + E), Space O(V)
"""
from typing import Generic, TypeVar, List, Optional

T = TypeVar('T')

class GraphsBFSDFSTraversals(Generic[T]):
    def __init__(self) -> None:
        self._items: List[T] = []

    # TODO: Implement core operational method
    def insert(self, value: T) -> None:
        self._items.append(value)

    def __len__(self) -> int:
        return len(self._items)
