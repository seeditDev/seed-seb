/**
 * C# Implementation: Fenwick Tree (Binary Indexed Tree)
 * Invariant: Prefix Sum O(log N), Update O(log N), Space O(N)
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class FenwickTreeBinaryIndexedTree<T>
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
