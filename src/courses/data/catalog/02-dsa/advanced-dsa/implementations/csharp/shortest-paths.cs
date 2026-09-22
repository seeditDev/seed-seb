/**
 * C# Implementation: Shortest Paths (Dijkstra, Bellman-Ford, Floyd-Warshall)
 * Invariant: Dijkstra O((V+E) log V), Floyd O(V^3)
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class ShortestPathsDijkstraBellmanFordFloydWarshall<T>
    {
        private readonly List<T> _items = new List<T>();

        // TODO: Implement algorithm operations
        public void Add(T item)
        {
            _items.Add(item);
        }

        public int Count => _items.Count;
    }
}
