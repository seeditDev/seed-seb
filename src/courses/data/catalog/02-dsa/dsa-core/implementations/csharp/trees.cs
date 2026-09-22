/**
 * C# Implementation: Trees (Binary Tree & Traversals)
 * Invariant: Traversals O(N), Depth O(log N) to O(N)
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class TreesBinaryTreeTraversals<T>
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
