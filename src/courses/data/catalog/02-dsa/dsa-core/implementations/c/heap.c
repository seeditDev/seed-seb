/*
 * C Implementation: Heap & Priority Queue
 * Invariant: Insert O(log N), ExtractMin O(log N), Peek O(1)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} heap_t;

// TODO: Complete the allocation and operations
void init_heap(heap_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
