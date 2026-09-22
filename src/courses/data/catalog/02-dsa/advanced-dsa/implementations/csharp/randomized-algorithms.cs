/**
 * C# Implementation: Randomized Algorithms (Treap, Skip List)
 * Invariant: Expected O(log N) with high probability
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class RandomizedAlgorithmsTreapSkipList<T>
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
