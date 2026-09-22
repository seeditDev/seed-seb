/**
 * C# Implementation: Minimum Spanning Tree (Kruskal & Prim)
 * Invariant: O(E log V) with Disjoint Set Union
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class MinimumSpanningTreeKruskalPrim<T>
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
