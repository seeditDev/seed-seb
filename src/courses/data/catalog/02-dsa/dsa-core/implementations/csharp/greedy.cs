/**
 * C# Implementation: Greedy Algorithms
 * Invariant: Locally optimal choice yields globally optimal solution
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class GreedyAlgorithms<T>
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
