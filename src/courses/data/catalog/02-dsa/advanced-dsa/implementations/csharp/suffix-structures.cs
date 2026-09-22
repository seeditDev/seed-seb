/**
 * C# Implementation: Suffix Structures (Suffix Array & Automaton)
 * Invariant: Substring queries in O(M) time
 */
using System;
using System.Collections.Generic;

namespace Seed.DSA.Core
{
    public class SuffixStructuresSuffixArrayAutomaton<T>
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
