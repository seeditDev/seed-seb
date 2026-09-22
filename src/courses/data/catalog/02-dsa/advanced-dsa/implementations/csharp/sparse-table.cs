/**
 * C# Implementation: Sparse Table (Range Minimum Query)
 * Invariant: Precomputation O(N log N), Range Query O(1)
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class SparseTableRangeMinimumQuery<T>
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
