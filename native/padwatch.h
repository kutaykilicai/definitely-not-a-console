// When a controller connects, should the menu open? Plain C, no Windows headers, so the rules can
// be tested anywhere (native/padwatch_test.c) and by "dnac-padwatch.exe --simulate".
#ifndef DNAC_PADWATCH_H
#define DNAC_PADWATCH_H

enum { PW_NONE = 0, PW_OPEN = 1, PW_FRONT = 2, PW_DESKTOP = 3 };
enum { PW_WHY_OK, PW_WHY_STARTUP, PW_WHY_NOT_FIRST, PW_WHY_BUSY, PW_WHY_QUIT, PW_WHY_COOLDOWN, PW_WHY_RESUME_DUP, PW_WHY_REMOVAL, PW_WHY_GUIDE_OFF, PW_WHY_GUIDE_REPEAT, PW_WHY_GUIDE_AFTER_ARRIVAL, PW_WHY_SHARE_OFF, PW_WHY_SHARE_REPEAT };
static const char *const pw_why_name[] __attribute__((unused)) = { "ok", "startup", "not-first-pad", "game-or-fullscreen", "menu-closed-recently", "cooldown", "resume-duplicate", "removal", "guide-off", "guide-repeat", "guide-after-arrival", "share-off", "share-repeat" };

typedef struct {
  unsigned long long started;   // when the watcher started (ms)
  unsigned long long resumed;   // last wake from sleep (0: none)
  unsigned long long last_fire; // last time the menu was opened / brought up (0: never)
  int pads;                     // controllers connected now
  int fired_since_resume;       // one opening per wake-up
  unsigned long long last_arrival_fire; // last opening because a controller connected (0: never)
  unsigned long long last_guide; // last Xbox button press that did something (0: never)
  unsigned long long last_share; // last Share press that showed the desktop (0: never)
  unsigned startup_ms, quiet_ms, cooldown_ms, resume_ms, guide_gap_ms, guide_after_arrival_ms, share_gap_ms;
} pw_t;

static void pw_init(pw_t *p, unsigned long long now) {
  p->started = now; p->resumed = 0; p->last_fire = 0; p->pads = 0; p->fired_since_resume = 0; p->last_arrival_fire = 0; p->last_guide = 0; p->last_share = 0;
  // quiet_ms: after the user closed the menu, a controller that reconnects (battery, radio) does not
  // bring it back for 10 s. An Xbox button press always does (pw_guide).
  p->startup_ms = 4000; p->quiet_ms = 10000; p->cooldown_ms = 15000; p->resume_ms = 20000;
  p->guide_gap_ms = 700; p->guide_after_arrival_ms = 2500; p->share_gap_ms = 700;
}
static void pw_resume(pw_t *p, unsigned long long now) { p->resumed = now; p->fired_since_resume = 0; }

// A controller arrived (pads_now = count after it) or left. menu_running / busy (a game, an emulator
// or any full-screen app) / closed_at (when the user last closed the menu, 0: unknown) are read by
// the caller at that moment. Returns PW_*; *why says which rule decided.
static int pw_event(pw_t *p, int arrival, int pads_now, unsigned long long now, int menu_running, int busy, unsigned long long closed_at, int *why) {
  int before = p->pads; p->pads = pads_now < 0 ? 0 : pads_now;
  int w = PW_WHY_OK, act = PW_NONE;
  if (!arrival) w = PW_WHY_REMOVAL;
  else if (now - p->started < p->startup_ms) w = PW_WHY_STARTUP;          // pads already there at login
  else if (before > 0) w = PW_WHY_NOT_FIRST;                              // a second controller
  else if (busy) w = PW_WHY_BUSY;
  else if (closed_at && now >= closed_at && now - closed_at < p->quiet_ms) w = PW_WHY_QUIT;
  else if (p->last_fire && now - p->last_fire < p->cooldown_ms) w = PW_WHY_COOLDOWN;
  else if (p->resumed && now - p->resumed < p->resume_ms && p->fired_since_resume) w = PW_WHY_RESUME_DUP;
  else { act = menu_running ? PW_FRONT : PW_OPEN; p->last_fire = now; p->last_arrival_fire = now; if (p->resumed && now - p->resumed < p->resume_ms) p->fired_since_resume = 1; }
  if (why) *why = w;
  return act;
}

// The Xbox (Guide) button was pressed (one call per press, on the way down). One press = one action:
// the menu opens (not running) or comes to the front (running; over a game the menu shows Home and
// the game keeps running). enabled: Ayarlar > Xbox tuşu menüyü açar. Not again within guide_gap_ms
// (a bouncing button), and not right after a controller arrival opened the menu: the press that
// turned the controller on is the same press.
static int pw_guide(pw_t *p, unsigned long long now, int menu_running, int enabled, int *why) {
  int w = PW_WHY_OK, act = PW_NONE;
  if (!enabled) w = PW_WHY_GUIDE_OFF;
  else if (p->last_guide && now - p->last_guide < p->guide_gap_ms) w = PW_WHY_GUIDE_REPEAT;
  else if (p->last_arrival_fire && now - p->last_arrival_fire < p->guide_after_arrival_ms) w = PW_WHY_GUIDE_AFTER_ARRIVAL;
  else { act = menu_running ? PW_FRONT : PW_OPEN; p->last_guide = now; p->last_fire = now; }
  if (why) *why = w;
  return act;
}

// The Share button (Xbox Series controllers) was pressed: show the Windows desktop. The menu and a
// running game go to the taskbar, the game keeps running. enabled: Ayarlar > Paylaş düğmesi
// masaüstüne. Not again within share_gap_ms (one press = one action).
static int pw_share(pw_t *p, unsigned long long now, int enabled, int *why) {
  int w = PW_WHY_OK, act = PW_NONE;
  if (!enabled) w = PW_WHY_SHARE_OFF;
  else if (p->last_share && now - p->last_share < p->share_gap_ms) w = PW_WHY_SHARE_REPEAT;
  else { act = PW_DESKTOP; p->last_share = now; }
  if (why) *why = w;
  return act;
}

// Edge detection for the Guide bit per controller slot. A slot seen for the first time (or again
// after it was empty) starts with its current state, so a button that is already down (the press
// that turned the controller on) is not a new press. Returns 1 on a press.
typedef struct { int known, down; } pw_btn_t;
static int pw_edge(pw_btn_t *b, int connected, int down) {
  if (!connected) { b->known = 0; b->down = 0; return 0; }
  if (!b->known) { b->known = 1; b->down = down; return 0; }
  int press = down && !b->down; b->down = down; return press;
}
#endif
