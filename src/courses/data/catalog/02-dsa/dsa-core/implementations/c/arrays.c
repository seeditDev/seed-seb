/*
 * C Implementation: Arrays
 * Invariant: Access O(1), Search O(N), Insert/Delete O(N)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} arrays_t;

// TODO: Complete the allocation and operations
void init_arrays(arrays_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
