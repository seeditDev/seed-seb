/*
 * C Implementation: Hashing (Hash Table & Map)
 * Invariant: Amortized O(1) Lookup/Insert/Delete
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} hashing_t;

// TODO: Complete the allocation and operations
void init_hashing(hashing_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
