/*
 * C Implementation: Greedy Algorithms
 * Invariant: Locally optimal choice yields globally optimal solution
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} greedy_t;

// TODO: Complete the allocation and operations
void init_greedy(greedy_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
