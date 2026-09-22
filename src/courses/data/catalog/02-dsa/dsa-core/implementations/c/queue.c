/*
 * C Implementation: Queue
 * Invariant: Enqueue/Dequeue O(1), Space O(N)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} queue_t;

// TODO: Complete the allocation and operations
void init_queue(queue_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
