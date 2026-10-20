// Hold-to-trigger state machine shared by the Esc key and the controller buttons. Plain C, no
// Windows headers, so it can be unit-tested on any machine (native/hold_test.c).
#ifndef PS5_HOLD_H
#define PS5_HOLD_H

typedef struct {
  int down;                 // input currently held
  unsigned long long since; // when it went down (ms)
  int fired;                // already triggered during this hold; re-arms on release
} hold_t;

// Feed the current input state and time. Returns 1 exactly once per hold, when it has been held
// for at least ms milliseconds. Releasing (pressed = 0) resets everything.
static int hold_step(hold_t *h, int pressed, unsigned long long now, unsigned ms) {
  if (!pressed) { h->down = 0; h->fired = 0; return 0; }
  if (!h->down) { h->down = 1; h->since = now; h->fired = 0; }
  if (!h->fired && now - h->since >= ms) { h->fired = 1; return 1; }
  return 0;
}

// The input was already held when watching started (e.g. Esc still down from the menu):
// it has to be released once before it can trigger.
static void hold_block_until_release(hold_t *h, int pressed) { h->down = pressed; h->fired = pressed; h->since = 0; }

// XInput buttons
#define PAD_BACK  0x0020
#define PAD_START 0x0010
#define PAD_GUIDE 0x0400

// Which combination counts as "home" on the controller: the Guide button, or Back+Start together
// (works on every controller and when the Guide button is taken by Game Bar or Steam).
static int pad_home_pressed(unsigned short buttons) {
  return (buttons & PAD_GUIDE) || ((buttons & (PAD_BACK | PAD_START)) == (PAD_BACK | PAD_START));
}
#endif
