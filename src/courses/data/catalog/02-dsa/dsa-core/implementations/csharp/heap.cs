/**
 * C# Implementation: Heap & Priority Queue
 * Invariant: Insert O(log N), ExtractMin O(log N), Peek O(1)
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class HeapPriorityQueue<T>
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
