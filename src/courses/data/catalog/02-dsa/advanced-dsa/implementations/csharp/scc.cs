/**
 * C# Implementation: Strongly Connected Components (Tarjan & Kosaraju)
 * Invariant: O(V + E) single or double DFS passes
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class StronglyConnectedComponentsTarjanKosaraju<T>
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
