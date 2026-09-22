/**
 * C# Implementation: Hashing (Hash Table & Map)
 * Invariant: Amortized O(1) Lookup/Insert/Delete
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class HashingHashTableMap<T>
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
