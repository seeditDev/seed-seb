/*
 * C Implementation: Divide & Conquer
 * Invariant: Master Theorem: T(N) = aT(N/b) + f(N)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} divide_and_conquer_t;

// TODO: Complete the allocation and operations
void init_divide_and_conquer(divide_and_conquer_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
