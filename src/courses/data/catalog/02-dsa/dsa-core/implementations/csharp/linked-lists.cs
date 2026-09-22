/**
 * C# Implementation: Linked Lists
 * Invariant: Insert/Delete O(1) given pointer, Search O(N)
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class LinkedLists<T>
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
