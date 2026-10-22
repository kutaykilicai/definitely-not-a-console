// When a controller connects, should the menu open? Plain C, no Windows headers, so the rules can
// be tested anywhere (native/padwatch_test.c) and by "dnac-padwatch.exe --simulate".
#ifndef DNAC_PADWATCH_H
#define DNAC_PADWATCH_H

enum { PW_NONE = 0, PW_OPEN = 1, PW_FRONT = 2 };
enum { PW_WHY_OK, PW_WHY_STARTUP, PW_WHY_NOT_FIRST, PW_WHY_BUSY, PW_WHY_QUIT, PW_WHY_COOLDOWN, PW_WHY_RESUME_DUP, PW_WHY_REMOVAL };
static const char *const pw_why_name[] __attribute__((unused)) = { "ok", "startup", "not-first-pad", "game-or-fullscreen", "menu-closed-recently", "cooldown", "resume-duplicate", "removal" };

typedef struct {
  unsigned long long started;   // when the watcher started (ms)
  unsigned long long resumed;   // last wake from sleep (0: none)
  unsigned long long last_fire; // last time the menu was opened / brought up (0: never)
  int pads;                     // controllers connected now
  int fired_since_resume;       // one opening per wake-up
  unsigned startup_ms, quiet_ms, cooldown_ms, resume_ms;
} pw_t;

static void pw_init(pw_t *p, unsigned long long now) {
  p->started = now; p->resumed = 0; p->last_fire = 0; p->pads = 0; p->fired_since_resume = 0;
  p->startup_ms = 4000; p->quiet_ms = 60000; p->cooldown_ms = 15000; p->resume_ms = 20000;
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
  else { act = menu_running ? PW_FRONT : PW_OPEN; p->last_fire = now; if (p->resumed && now - p->resumed < p->resume_ms) p->fired_since_resume = 1; }
  if (why) *why = w;
  return act;
}
#endif
