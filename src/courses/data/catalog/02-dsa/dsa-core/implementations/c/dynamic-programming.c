/*
 * C Implementation: Dynamic Programming
 * Invariant: Optimal Substructure + Overlapping Subproblems
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} dynamic_programming_t;

// TODO: Complete the allocation and operations
void init_dynamic_programming(dynamic_programming_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
