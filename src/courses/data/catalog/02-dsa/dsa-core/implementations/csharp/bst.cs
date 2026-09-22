/**
 * C# Implementation: Binary Search Tree (BST)
 * Invariant: Balanced O(log N) Search/Insert, Degenerate O(N)
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class BinarySearchTreeBST<T>
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
