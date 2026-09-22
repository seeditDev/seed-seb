"""
Python Implementation: Shortest Paths (Dijkstra, Bellman-Ford, Floyd-Warshall)
Invariant: Dijkstra O((V+E) log V), Floyd O(V^3)
"""
from typing import Generic, TypeVar, List, Optional

T = TypeVar('T')

class ShortestPathsDijkstraBellmanFordFloydWarshall(Generic[T]):
    def __init__(self) -> None:
        self._items: List[T] = []

    # TODO: Implement core operational method
    def insert(self, value: T) -> None:
        self._items.append(value)

    def __len__(self) -> int:
        return len(self._items)
