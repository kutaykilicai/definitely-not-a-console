// gcc -O1 -o /tmp/padwatch_test native/padwatch_test.c && /tmp/padwatch_test
#include <assert.h>
#include <stdio.h>
#include "padwatch.h"
int main(void) {
  pw_t p; int why; pw_init(&p, 1000);
  // a pad that was already connected at login: no opening
  assert(pw_event(&p, 1, 1, 2000, 0, 0, 0, &why) == PW_NONE && why == PW_WHY_STARTUP);
  // disconnect, connect again later: opens the menu
  assert(pw_event(&p, 0, 0, 60000, 0, 0, 0, &why) == PW_NONE && why == PW_WHY_REMOVAL);
  assert(pw_event(&p, 1, 1, 70000, 0, 0, 0, &why) == PW_OPEN);
  // a second controller while one is connected: nothing
  assert(pw_event(&p, 1, 2, 90000, 0, 0, 0, &why) == PW_NONE && why == PW_WHY_NOT_FIRST);
  assert(pw_event(&p, 0, 1, 91000, 0, 0, 0, &why) == PW_NONE); assert(pw_event(&p, 0, 0, 92000, 0, 0, 0, &why) == PW_NONE);
  // reconnect at once (cooldown 15 s from the last opening at 70 s is over at 92 s): menu already open -> to front
  assert(pw_event(&p, 1, 1, 100000, 1, 0, 0, &why) == PW_FRONT);
  // quick unplug/replug: cooldown
  pw_event(&p, 0, 0, 101000, 1, 0, 0, &why); assert(pw_event(&p, 1, 1, 105000, 1, 0, 0, &why) == PW_NONE && why == PW_WHY_COOLDOWN);
  // a game or a full-screen app is running: nothing
  pw_event(&p, 0, 0, 200000, 0, 0, 0, &why); assert(pw_event(&p, 1, 1, 210000, 0, 1, 0, &why) == PW_NONE && why == PW_WHY_BUSY);
  // the user closed the menu 20 s ago: nothing; 70 s ago: opens
  pw_event(&p, 0, 0, 300000, 0, 0, 0, &why); assert(pw_event(&p, 1, 1, 320000, 0, 0, 300000, &why) == PW_NONE && why == PW_WHY_QUIT);
  pw_event(&p, 0, 0, 400000, 0, 0, 0, &why); assert(pw_event(&p, 1, 1, 470000, 0, 0, 400000, &why) == PW_OPEN);
  // wake from sleep with the controller: one opening, the reconnect burst after it does nothing
  pw_resume(&p, 1000000); pw_event(&p, 0, 0, 1000500, 0, 0, 0, &why);
  assert(pw_event(&p, 1, 1, 1001000, 0, 0, 0, &why) == PW_OPEN);
  pw_event(&p, 0, 0, 1001500, 1, 0, 0, &why); assert(pw_event(&p, 1, 1, 1017000, 1, 0, 0, &why) == PW_NONE && why == PW_WHY_RESUME_DUP);
  // long after the wake-up the normal rules apply again
  pw_event(&p, 0, 0, 1100000, 0, 0, 0, &why); assert(pw_event(&p, 1, 1, 1120000, 0, 0, 0, &why) == PW_OPEN);
  printf("padwatch rules: all passed\n");
  return 0;
}
