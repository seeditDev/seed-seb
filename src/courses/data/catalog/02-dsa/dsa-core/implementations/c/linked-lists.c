/*
 * C Implementation: Linked Lists
 * Invariant: Insert/Delete O(1) given pointer, Search O(N)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} linked_lists_t;

// TODO: Complete the allocation and operations
void init_linked_lists(linked_lists_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
