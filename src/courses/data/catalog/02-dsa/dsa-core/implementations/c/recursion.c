/*
 * C Implementation: Recursion
 * Invariant: Call Stack O(Depth), Work O(Branch^Depth)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} recursion_t;

// TODO: Complete the allocation and operations
void init_recursion(recursion_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
