/*
 * C Implementation: Trie (Prefix Tree)
 * Invariant: Prefix search O(Length of Word)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} trie_t;

// TODO: Complete the allocation and operations
void init_trie(trie_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
