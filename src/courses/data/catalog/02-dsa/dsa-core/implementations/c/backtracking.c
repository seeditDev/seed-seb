/*
 * C Implementation: Backtracking
 * Invariant: Pruned state space exploration, O(b^d)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} backtracking_t;

// TODO: Complete the allocation and operations
void init_backtracking(backtracking_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
