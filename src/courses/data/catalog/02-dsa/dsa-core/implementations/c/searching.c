/*
 * C Implementation: Searching (Linear & Binary)
 * Invariant: Linear O(N), Binary O(log N)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} searching_t;

// TODO: Complete the allocation and operations
void init_searching(searching_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
