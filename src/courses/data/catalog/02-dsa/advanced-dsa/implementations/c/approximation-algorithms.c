/*
 * C Implementation: Approximation Algorithms (Vertex Cover, TSP)
 * Invariant: Polynomial time bounded factor approximation
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} approximation_algorithms_t;

// TODO: Complete the allocation and operations
void init_approximation_algorithms(approximation_algorithms_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
