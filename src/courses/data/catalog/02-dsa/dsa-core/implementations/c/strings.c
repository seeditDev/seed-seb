/*
 * C Implementation: Strings
 * Invariant: Access O(1), Search O(N), Slice O(K)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} strings_t;

// TODO: Complete the allocation and operations
void init_strings(strings_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
