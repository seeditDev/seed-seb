/*
 * C Implementation: Bipartite Matching (Hopcroft-Karp)
 * Invariant: O(E sqrt(V)) maximum cardinality matching
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} matching_t;

// TODO: Complete the allocation and operations
void init_matching(matching_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
