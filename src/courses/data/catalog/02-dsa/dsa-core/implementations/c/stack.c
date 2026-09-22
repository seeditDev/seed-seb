/*
 * C Implementation: Stack
 * Invariant: Push/Pop/Peek O(1), Space O(N)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} stack_t;

// TODO: Complete the allocation and operations
void init_stack(stack_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
