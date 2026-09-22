/*
 * C Implementation: Suffix Structures (Suffix Array & Automaton)
 * Invariant: Substring queries in O(M) time
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} suffix_structures_t;

// TODO: Complete the allocation and operations
void init_suffix_structures(suffix_structures_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
