/**
 * C# Implementation: Arrays
 * Invariant: Access O(1), Search O(N), Insert/Delete O(N)
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class Arrays<T>
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
