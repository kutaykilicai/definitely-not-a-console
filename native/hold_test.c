// gcc -O1 -o /tmp/hold_test native/hold_test.c && /tmp/hold_test
#include <assert.h>
#include <stdio.h>
#include "hold.h"
int main(void) {
  hold_t h = {0};
  // short press: never fires
  assert(!hold_step(&h, 1, 0, 1000)); assert(!hold_step(&h, 1, 300, 1000)); assert(!hold_step(&h, 0, 350, 1000));
  // held: fires once at >= 1000 ms, not again while still held
  assert(!hold_step(&h, 1, 1000, 1000)); assert(!hold_step(&h, 1, 1999, 1000));
  assert(hold_step(&h, 1, 2000, 1000)); assert(!hold_step(&h, 1, 2500, 1000)); assert(!hold_step(&h, 1, 9000, 1000));
  // release re-arms
  assert(!hold_step(&h, 0, 9100, 1000)); assert(!hold_step(&h, 1, 9200, 1000)); assert(hold_step(&h, 1, 10300, 1000));
  // held when watching starts: needs a release first
  hold_t b = {0}; hold_block_until_release(&b, 1);
  assert(!hold_step(&b, 1, 5000, 500)); assert(!hold_step(&b, 1, 9000, 500));
  assert(!hold_step(&b, 0, 9100, 500)); assert(!hold_step(&b, 1, 9200, 500)); assert(hold_step(&b, 1, 9700, 500));
  // controller combinations
  assert(pad_home_pressed(PAD_GUIDE)); assert(pad_home_pressed(PAD_BACK | PAD_START)); assert(pad_home_pressed(PAD_BACK | PAD_START | 0x1000));
  assert(!pad_home_pressed(PAD_BACK)); assert(!pad_home_pressed(PAD_START)); assert(!pad_home_pressed(0x1000));
  puts("hold: 6 groups passed");
  return 0;
}
