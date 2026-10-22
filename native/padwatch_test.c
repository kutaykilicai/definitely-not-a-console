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
  // the user closed the menu 5 s ago: nothing; 12 s ago: opens (quiet window 10 s since 1.5.1)
  pw_event(&p, 0, 0, 300000, 0, 0, 0, &why); assert(pw_event(&p, 1, 1, 305000, 0, 0, 300000, &why) == PW_NONE && why == PW_WHY_QUIT);
  pw_event(&p, 0, 0, 400000, 0, 0, 0, &why); assert(pw_event(&p, 1, 1, 412000, 0, 0, 400000, &why) == PW_OPEN);
  // wake from sleep with the controller: one opening, the reconnect burst after it does nothing
  pw_resume(&p, 1000000); pw_event(&p, 0, 0, 1000500, 0, 0, 0, &why);
  assert(pw_event(&p, 1, 1, 1001000, 0, 0, 0, &why) == PW_OPEN);
  pw_event(&p, 0, 0, 1001500, 1, 0, 0, &why); assert(pw_event(&p, 1, 1, 1017000, 1, 0, 0, &why) == PW_NONE && why == PW_WHY_RESUME_DUP);
  // long after the wake-up the normal rules apply again
  pw_event(&p, 0, 0, 1100000, 0, 0, 0, &why); assert(pw_event(&p, 1, 1, 1120000, 0, 0, 0, &why) == PW_OPEN);
  // Xbox button: one press, one action; menu closed -> open, running -> front (also over a game)
  pw_t g; pw_init(&g, 0);
  assert(pw_guide(&g, 10000, 0, 1, &why) == PW_OPEN && why == PW_WHY_OK);
  assert(pw_guide(&g, 10300, 1, 1, &why) == PW_NONE && why == PW_WHY_GUIDE_REPEAT);     // bounce
  assert(pw_guide(&g, 11000, 1, 1, &why) == PW_FRONT);
  assert(pw_guide(&g, 13000, 1, 0, &why) == PW_NONE && why == PW_WHY_GUIDE_OFF);        // setting off
  // not blocked by the menu-closed quiet window or a running game (the menu handles that)
  assert(pw_guide(&g, 20000, 0, 1, &why) == PW_OPEN);
  // the arrival opened the menu: a press right after it is the same gesture
  pw_event(&g, 0, 0, 30000, 0, 0, 0, &why); assert(pw_event(&g, 1, 1, 40000, 0, 0, 0, &why) == PW_OPEN);
  assert(pw_guide(&g, 41000, 1, 1, &why) == PW_NONE && why == PW_WHY_GUIDE_AFTER_ARRIVAL);
  assert(pw_guide(&g, 43000, 1, 1, &why) == PW_FRONT);
  // the menu is the full-screen window in front: busy=0 from the caller, the arrival brings it up
  pw_event(&g, 0, 0, 60000, 1, 0, 0, &why); assert(pw_event(&g, 1, 1, 70000, 1, 0, 0, &why) == PW_FRONT);
  // edges: a button already down when the slot appears is not a press; press, hold, release, press
  pw_btn_t b = {0, 0};
  assert(!pw_edge(&b, 1, 1)); assert(!pw_edge(&b, 1, 1)); assert(!pw_edge(&b, 1, 0)); assert(pw_edge(&b, 1, 1));
  assert(!pw_edge(&b, 1, 1)); assert(!pw_edge(&b, 1, 0)); assert(pw_edge(&b, 1, 1));
  assert(!pw_edge(&b, 0, 0)); assert(!pw_edge(&b, 1, 1));   // disconnected, back with the button down
  // Share: one press = desktop, a bounce within 700 ms does nothing, off in Ayarlar = nothing;
  // independent of the Xbox button and of a running game
  pw_t sh; pw_init(&sh, 0);
  assert(pw_share(&sh, 5000, 1, &why) == PW_DESKTOP && why == PW_WHY_OK);
  assert(pw_share(&sh, 5300, 1, &why) == PW_NONE && why == PW_WHY_SHARE_REPEAT);
  assert(pw_share(&sh, 6000, 1, &why) == PW_DESKTOP);
  assert(pw_share(&sh, 8000, 0, &why) == PW_NONE && why == PW_WHY_SHARE_OFF);
  assert(pw_guide(&sh, 8100, 1, 1, &why) == PW_FRONT);                 // the Xbox button right after still works
  assert(pw_share(&sh, 8200, 1, &why) == PW_DESKTOP);
  printf("padwatch rules: all passed\n");
  return 0;
}
