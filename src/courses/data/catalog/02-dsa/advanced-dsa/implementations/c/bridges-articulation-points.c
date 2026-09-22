/*
 * C Implementation: Bridges & Articulation Points
 * Invariant: O(V + E) low-link DFS tree traversal
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} bridges_articulation_points_t;

// TODO: Complete the allocation and operations
void init_bridges_articulation_points(bridges_articulation_points_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
