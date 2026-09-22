/**
 * C# Implementation: Searching (Linear & Binary)
 * Invariant: Linear O(N), Binary O(log N)
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class SearchingLinearBinary<T>
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
