/*
 * C Implementation: Number Theory (Modular Inverse, Miller-Rabin)
 * Invariant: Primality testing and CRT arithmetic
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} number_theory_t;

// TODO: Complete the allocation and operations
void init_number_theory(number_theory_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
