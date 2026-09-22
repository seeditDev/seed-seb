/*
 * C Implementation: Bit Manipulation
 * Invariant: Bitwise AND, OR, XOR, Shifts O(1)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} bit_manipulation_t;

// TODO: Complete the allocation and operations
void init_bit_manipulation(bit_manipulation_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
