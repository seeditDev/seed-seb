/**
 * C# Implementation: Trie (Prefix Tree)
 * Invariant: Prefix search O(Length of Word)
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class TriePrefixTree<T>
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
