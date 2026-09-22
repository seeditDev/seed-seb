/**
 * C# Implementation: Queue
 * Invariant: Enqueue/Dequeue O(1), Space O(N)
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class Queue<T>
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
