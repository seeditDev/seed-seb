/**
 * C# Implementation: Sorting (Quick, Merge, Heap)
 * Invariant: Comparison O(N log N), Space O(1) to O(N)
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class SortingQuickMergeHeap<T>
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
