// ps5winhelper: tiny Win32 query/command helper for PS5 Menu. One request per stdin line,
// one JSON reply per stdout line. No admin rights needed; it only reads window state and
// moves/activates windows of the current desktop.
//
//   snap <rootpid> [name1|name2|...]  windows of rootpid's process tree and of processes named nameN
//   alive <hwnd>                       is the window still there
//   fg <hwnd>                          bring a window to the foreground
//   below <hwnd> <after>               put hwnd directly below <after> in z-order, without activating
//   minimize <hwnd>                    minimize without activating
//   keys <mods> <vk>                   send a key chord (mods: c=Ctrl a=Alt s=Shift w=Win)
//   restore <hwnd>                     un-minimize without activating it ourselves
//   place <hwnd> <x> <y> <w> <h>       move/size a window (no z-order change, no activation)
//   close <hwnd>                       ask a window to close (WM_CLOSE), like its X button
//   suspend <pid,pid,...>              pause processes (NtSuspendProcess); remembered here
//   resume <pid,pid,...|all>           continue them again (NtResumeProcess)
//   term <pid,pid,...>                 end processes (TerminateProcess), last resort after close
//   watch <esc> <escMs> <pad> <padMs>  while a game runs: report holding Esc (low-level keyboard hook
//                                      that never swallows keys) or the controller's Guide button /
//                                      Back+Start (XInput polling) as {"event":"home","src":...}
//   unwatch                            stop that (the hook is removed)
//   quit
//
// Anything this helper suspended is resumed when it exits, also when PS5 Menu itself goes away,
// so a game can never stay frozen without a menu.
#define WIN32_LEAN_AND_MEAN
#ifndef UNICODE
#define UNICODE
#endif
#include <windows.h>
#include <tlhelp32.h>
#include <dwmapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include "hold.h"

#define MAXP 4096
static DWORD g_pid[MAXP], g_ppid[MAXP]; static wchar_t g_exe[MAXP][MAX_PATH]; static int g_np;
static DWORD g_set[MAXP]; static int g_ns;
static char g_out[1 << 16]; static size_t g_len;

static void out(const char *fmt, ...) {
  va_list ap; va_start(ap, fmt);
  int n = vsnprintf(g_out + g_len, sizeof g_out - g_len, fmt, ap);
  va_end(ap);
  if (n > 0) g_len += (size_t)n; if (g_len >= sizeof g_out) g_len = sizeof g_out - 1;
}
// stdout is shared with the watcher thread (events), so whole lines are written under a lock.
static CRITICAL_SECTION g_io;
static void put_line(const char *s) { EnterCriticalSection(&g_io); fputs(s, stdout); fputc('\n', stdout); fflush(stdout); LeaveCriticalSection(&g_io); }
static void flush(void) { g_out[g_len] = 0; put_line(g_out); g_len = 0; }

static void jstr(const wchar_t *w) {
  char u[MAX_PATH * 4]; int n = WideCharToMultiByte(CP_UTF8, 0, w, -1, u, sizeof u, NULL, NULL);
  if (n <= 0) u[0] = 0;
  out("\"");
  for (char *p = u; *p; p++) {
    unsigned char c = (unsigned char)*p;
    if (c == '"' || c == '\\') out("\\%c", c); else if (c < 0x20) out("\\u%04x", c); else out("%c", c);
  }
  out("\"");
}

static int inset(DWORD pid) { for (int i = 0; i < g_ns; i++) if (g_set[i] == pid) return 1; return 0; }
static void addset(DWORD pid) { if (!inset(pid) && g_ns < MAXP) g_set[g_ns++] = pid; }

static void snapshot_procs(void) {
  g_np = 0;
  HANDLE s = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0); if (s == INVALID_HANDLE_VALUE) return;
  PROCESSENTRY32W pe; pe.dwSize = sizeof pe;
  if (Process32FirstW(s, &pe)) do {
    if (g_np >= MAXP) break;
    g_pid[g_np] = pe.th32ProcessID; g_ppid[g_np] = pe.th32ParentProcessID;
    wcsncpy(g_exe[g_np], pe.szExeFile, MAX_PATH - 1); g_exe[g_np][MAX_PATH - 1] = 0; _wcslwr(g_exe[g_np]);
    g_np++;
  } while (Process32NextW(s, &pe));
  CloseHandle(s);
}
static const wchar_t *exe_of(DWORD pid) { for (int i = 0; i < g_np; i++) if (g_pid[i] == pid) return g_exe[i]; return L""; }

// names: lowercase, '|' separated, UTF-8
static void build_set(DWORD root, const char *names) {
  g_ns = 0;
  if (root) {
    for (int i = 0; i < g_np; i++) if (g_pid[i] == root) { addset(root); break; }
    for (int k = 0; k < g_ns; k++)  // BFS: children of every member
      for (int i = 0; i < g_np; i++) if (g_ppid[i] == g_set[k] && g_pid[i] != g_set[k] && g_pid[i] != 0) addset(g_pid[i]);
  }
  if (names && *names) {
    wchar_t wn[4096]; MultiByteToWideChar(CP_UTF8, 0, names, -1, wn, 4096); _wcslwr(wn);
    wchar_t *ctx = NULL; for (wchar_t *t = wcstok_s(wn, L"|", &ctx); t; t = wcstok_s(NULL, L"|", &ctx))
      for (int i = 0; i < g_np; i++) if (!wcscmp(g_exe[i], t)) addset(g_pid[i]);
  }
}

static void win_json(HWND h) {
  DWORD pid = 0; GetWindowThreadProcessId(h, &pid);
  RECT r = {0}; GetWindowRect(h, &r);
  RECT fr; if (SUCCEEDED(DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, &fr, sizeof fr))) r = fr;
  int cloak = 0; DwmGetWindowAttribute(h, DWMWA_CLOAKED, &cloak, sizeof cloak);
  LONG ex = GetWindowLongW(h, GWL_EXSTYLE), st = GetWindowLongW(h, GWL_STYLE);
  MONITORINFO mi; mi.cbSize = sizeof mi; GetMonitorInfoW(MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST), &mi);
  wchar_t title[256] = L""; GetWindowTextW(h, title, 255);
  wchar_t cls[128] = L""; GetClassNameW(h, cls, 127);
  out("{\"hwnd\":%llu,\"pid\":%lu,\"exe\":", (unsigned long long)(ULONG_PTR)h, pid); jstr(exe_of(pid));
  out(",\"title\":"); jstr(title); out(",\"cls\":"); jstr(cls);
  out(",\"visible\":%s,\"minimized\":%s,\"cloaked\":%s,\"tool\":%s,\"owned\":%s,\"popup\":%s,\"topmost\":%s",
      IsWindowVisible(h) ? "true" : "false", IsIconic(h) ? "true" : "false", cloak ? "true" : "false",
      (ex & WS_EX_TOOLWINDOW) ? "true" : "false", GetWindow(h, GW_OWNER) ? "true" : "false",
      (st & WS_POPUP) ? "true" : "false", (ex & WS_EX_TOPMOST) ? "true" : "false");
  out(",\"x\":%ld,\"y\":%ld,\"w\":%ld,\"h\":%ld", r.left, r.top, r.right - r.left, r.bottom - r.top);
  out(",\"mon\":{\"x\":%ld,\"y\":%ld,\"w\":%ld,\"h\":%ld}}", mi.rcMonitor.left, mi.rcMonitor.top,
      mi.rcMonitor.right - mi.rcMonitor.left, mi.rcMonitor.bottom - mi.rcMonitor.top);
}

static int g_first;
static BOOL CALLBACK enum_cb(HWND h, LPARAM l) {
  (void)l; DWORD pid = 0; GetWindowThreadProcessId(h, &pid);
  if (!inset(pid) || !IsWindowVisible(h)) return TRUE;
  if (!g_first) out(","); g_first = 0; win_json(h); return TRUE;
}

static void cmd_snap(DWORD root, const char *names) {
  snapshot_procs(); build_set(root, names);
  HWND fg = GetForegroundWindow(); DWORD fgpid = 0; if (fg) GetWindowThreadProcessId(fg, &fgpid);
  out("{\"ok\":true,\"fg\":%llu,\"fgpid\":%lu,\"pids\":[", (unsigned long long)(ULONG_PTR)fg, fgpid);
  for (int i = 0; i < g_ns; i++) out("%s%lu", i ? "," : "", g_set[i]);
  out("],\"exes\":[");   // same order as pids
  for (int i = 0; i < g_ns; i++) { if (i) out(","); jstr(exe_of(g_set[i])); }
  out("],\"windows\":["); g_first = 1; EnumWindows(enum_cb, 0); out("]}");
}

static void tap_alt(void) {
  INPUT in[2]; ZeroMemory(in, sizeof in);
  in[0].type = INPUT_KEYBOARD; in[0].ki.wVk = VK_MENU;
  in[1].type = INPUT_KEYBOARD; in[1].ki.wVk = VK_MENU; in[1].ki.dwFlags = KEYEVENTF_KEYUP;
  SendInput(2, in, sizeof(INPUT));
}

static int cmd_fg(HWND h) {
  if (!IsWindow(h)) return 0;
  if (GetForegroundWindow() == h) return 1;
  if (IsIconic(h)) ShowWindow(h, SW_RESTORE);
  if (SetForegroundWindow(h) && GetForegroundWindow() == h) return 1;
  // Foreground lock: an Alt tap counts as input from us, which lets SetForegroundWindow through.
  tap_alt();
  if (SetForegroundWindow(h) && GetForegroundWindow() == h) return 1;
  HWND cur = GetForegroundWindow();
  DWORD me = GetCurrentThreadId(), other = cur ? GetWindowThreadProcessId(cur, NULL) : 0;
  if (other && other != me) AttachThreadInput(me, other, TRUE);
  BringWindowToTop(h); SetForegroundWindow(h);
  if (other && other != me) AttachThreadInput(me, other, FALSE);
  return GetForegroundWindow() == h;
}

static void cmd_keys(const char *mods, const char *vk) {
  WORD keys[8]; int n = 0;
  for (const char *p = mods; *p && n < 4; p++) {
    if (*p == 'c') keys[n++] = VK_CONTROL; else if (*p == 'a') keys[n++] = VK_MENU;
    else if (*p == 's') keys[n++] = VK_SHIFT; else if (*p == 'w') keys[n++] = VK_LWIN;
  }
  WORD k = (WORD)strtoul(vk, NULL, 0); if (!k && vk[0]) k = (WORD)(unsigned char)vk[0];
  keys[n++] = k;
  INPUT in[16]; ZeroMemory(in, sizeof in); int m = 0;
  for (int i = 0; i < n; i++) { in[m].type = INPUT_KEYBOARD; in[m].ki.wVk = keys[i]; m++; }
  for (int i = n - 1; i >= 0; i--) { in[m].type = INPUT_KEYBOARD; in[m].ki.wVk = keys[i]; in[m].ki.dwFlags = KEYEVENTF_KEYUP; m++; }
  UINT sent = SendInput((UINT)m, in, sizeof(INPUT));
  out("{\"ok\":%s,\"sent\":%u}", sent == (UINT)m ? "true" : "false", sent);
}


// ---------- pause / resume / close ----------
typedef LONG (NTAPI *ntproc_t)(HANDLE);
static ntproc_t g_ntSuspend, g_ntResume;
#define MAXS 256
static DWORD g_susp[MAXS]; static int g_nsusp;
static CRITICAL_SECTION g_sl;

static int parse_pids(const char *s, DWORD *pids, int max) {
  int n = 0; if (!s) return 0;
  while (*s && n < max) { char *e; unsigned long v = strtoul(s, &e, 10); if (e == s) { s++; continue; } if (v) pids[n++] = (DWORD)v; s = e; }
  return n;
}
static int is_suspended(DWORD pid) { for (int i = 0; i < g_nsusp; i++) if (g_susp[i] == pid) return i; return -1; }

static void cmd_suspend(const char *list) {
  DWORD pids[MAXS]; int n = parse_pids(list, pids, MAXS), done = 0;
  DWORD me = GetCurrentProcessId();
  EnterCriticalSection(&g_sl);
  for (int i = 0; i < n; i++) {
    if (pids[i] == me || is_suspended(pids[i]) >= 0 || g_nsusp >= MAXS || !g_ntSuspend) continue;
    HANDLE h = OpenProcess(PROCESS_SUSPEND_RESUME, FALSE, pids[i]); if (!h) continue;
    if (g_ntSuspend(h) == 0) { g_susp[g_nsusp++] = pids[i]; done++; }
    CloseHandle(h);
  }
  LeaveCriticalSection(&g_sl);
  out("{\"ok\":%s,\"suspended\":%d,\"asked\":%d}", done ? "true" : "false", done, n);
}
static int resume_pid(DWORD pid) {
  HANDLE h = OpenProcess(PROCESS_SUSPEND_RESUME, FALSE, pid); if (!h) return 0;
  int ok = g_ntResume && g_ntResume(h) == 0; CloseHandle(h); return ok;
}
static int resume_all(void) {
  int done = 0;
  EnterCriticalSection(&g_sl);
  for (int i = 0; i < g_nsusp; i++) done += resume_pid(g_susp[i]);
  g_nsusp = 0;
  LeaveCriticalSection(&g_sl);
  return done;
}
static void cmd_resume(const char *list) {
  int done = 0;
  if (list && !strcmp(list, "all")) done = resume_all();
  else {
    DWORD pids[MAXS]; int n = parse_pids(list, pids, MAXS);
    EnterCriticalSection(&g_sl);
    // Also pids this helper instance did not pause (a restarted helper): resuming a process that
    // is not suspended changes nothing.
    for (int i = 0; i < n; i++) {
      int k = is_suspended(pids[i]); if (k >= 0) g_susp[k] = g_susp[--g_nsusp];
      done += resume_pid(pids[i]);
    }
    LeaveCriticalSection(&g_sl);
  }
  out("{\"ok\":true,\"resumed\":%d}", done);
}
static void cmd_term(const char *list) {
  DWORD pids[MAXS]; int n = parse_pids(list, pids, MAXS), done = 0; DWORD me = GetCurrentProcessId();
  for (int i = 0; i < n; i++) {
    if (pids[i] == me) continue;
    EnterCriticalSection(&g_sl);
    int k = is_suspended(pids[i]); if (k >= 0) { resume_pid(pids[i]); g_susp[k] = g_susp[--g_nsusp]; }
    LeaveCriticalSection(&g_sl);
    HANDLE h = OpenProcess(PROCESS_TERMINATE, FALSE, pids[i]); if (!h) continue;
    if (TerminateProcess(h, 1)) done++;
    CloseHandle(h);
  }
  out("{\"ok\":%s,\"ended\":%d}", done ? "true" : "false", done);
}

// ---------- home trigger: hold Esc / controller Guide or Back+Start ----------
typedef struct { WORD wButtons; BYTE lt, rt; SHORT lx, ly, rx, ry; } xpad_t;
typedef struct { DWORD packet; xpad_t pad; } xstate_t;
typedef DWORD (WINAPI *xget_t)(DWORD, xstate_t *);
static xget_t g_xget; static int g_xguide; static const char *g_xdll = "";
static volatile LONG g_watch_on, g_esc_down;
static int g_esc_on = 1, g_pad_on = 1; static unsigned g_esc_ms = 1000, g_pad_ms = 1000;
static hold_t g_hesc, g_hpad;
static HHOOK g_hook; static DWORD g_wtid; static HANDLE g_wready;
static unsigned long long g_pad_next[4]; static int g_pad_conn[4];
#define WM_ARM (WM_APP + 1)
#define WM_DISARM (WM_APP + 2)

static void load_xinput(void) {
  static const char *dlls[] = { "xinput1_4.dll", "xinput1_3.dll", "xinput9_1_0.dll" };
  for (int i = 0; i < 3 && !g_xget; i++) {
    HMODULE m = LoadLibraryA(dlls[i]); if (!m) continue;
    // Ordinal 100 is XInputGetStateEx (same arguments as XInputGetState, but reports the Guide
    // button). Not in the headers; present in xinput1_3/1_4 on every Windows 10/11 install.
    xget_t ex = (xget_t)(void *)GetProcAddress(m, (LPCSTR)(ULONG_PTR)100);
    if (ex) { g_xget = ex; g_xguide = 1; g_xdll = dlls[i]; break; }
    xget_t st = (xget_t)(void *)GetProcAddress(m, "XInputGetState");
    if (st) { g_xget = st; g_xguide = 0; g_xdll = dlls[i]; }
  }
}

// Is the home combination held on any controller? Polling a slot with no controller is slow, so
// empty slots are only checked every two seconds.
static int pad_held(unsigned long long now) {
  if (!g_xget) return 0;
  int held = 0;
  for (DWORD i = 0; i < 4; i++) {
    if (!g_pad_conn[i] && now < g_pad_next[i]) continue;
    xstate_t st; ZeroMemory(&st, sizeof st);
    if (g_xget(i, &st) != 0) { g_pad_conn[i] = 0; g_pad_next[i] = now + 2000; continue; }
    g_pad_conn[i] = 1;
    WORD b = st.pad.wButtons; if (!g_xguide) b &= (WORD)~PAD_GUIDE;
    if (pad_home_pressed(b)) held = 1;
  }
  return held;
}

static LRESULT CALLBACK kb_hook(int code, WPARAM wp, LPARAM lp) {
  if (code == HC_ACTION) {
    const KBDLLHOOKSTRUCT *k = (const KBDLLHOOKSTRUCT *)lp;
    if (k->vkCode == VK_ESCAPE) InterlockedExchange(&g_esc_down, (wp == WM_KEYDOWN || wp == WM_SYSKEYDOWN) ? 1 : 0);
  }
  return CallNextHookEx(NULL, code, wp, lp);   // never swallow: the game gets every key as usual
}

static void fire(const char *src) {
  if (!InterlockedExchange(&g_watch_on, 0)) return;   // once; PS5 Menu arms it again later
  char line[128]; snprintf(line, sizeof line, "{\"event\":\"home\",\"src\":\"%s\"}", src);
  put_line(line);
}

static DWORD WINAPI watch_thread(LPVOID p) {
  (void)p; MSG m;
  PeekMessageW(&m, NULL, WM_USER, WM_USER, PM_NOREMOVE);   // make the message queue
  SetEvent(g_wready);
  SetTimer(NULL, 0, 16, NULL);
  while (GetMessageW(&m, NULL, 0, 0) > 0) {
    if (m.message == WM_ARM) {
      if (g_esc_on && !g_hook) g_hook = SetWindowsHookExW(WH_KEYBOARD_LL, kb_hook, GetModuleHandleW(NULL), 0);
      if (!g_esc_on && g_hook) { UnhookWindowsHookEx(g_hook); g_hook = NULL; }
      unsigned long long now = GetTickCount64();
      g_pad_next[0] = g_pad_next[1] = g_pad_next[2] = g_pad_next[3] = 0;
      InterlockedExchange(&g_esc_down, (GetAsyncKeyState(VK_ESCAPE) & 0x8000) ? 1 : 0);
      hold_block_until_release(&g_hesc, g_esc_down);       // still held from the menu: release first
      hold_block_until_release(&g_hpad, pad_held(now));
      InterlockedExchange(&g_watch_on, 1);
    } else if (m.message == WM_DISARM) {
      InterlockedExchange(&g_watch_on, 0);
      if (g_hook) { UnhookWindowsHookEx(g_hook); g_hook = NULL; }
    } else if (m.message == WM_TIMER) {
      if (!g_watch_on) continue;
      unsigned long long now = GetTickCount64();
      if (g_esc_on && hold_step(&g_hesc, (int)g_esc_down, now, g_esc_ms)) fire("esc");
      if (g_pad_on && hold_step(&g_hpad, pad_held(now), now, g_pad_ms)) fire("pad");
    }
  }
  return 0;
}

static void cmd_watch(const char *a, const char *b, const char *c, const char *d) {
  g_esc_on = a && atoi(a); g_esc_ms = b ? (unsigned)atoi(b) : 1000;
  g_pad_on = c && atoi(c); g_pad_ms = d ? (unsigned)atoi(d) : 1000;
  if (g_esc_ms < 200) g_esc_ms = 200;
  if (g_pad_ms < 200) g_pad_ms = 200;
  if (!g_wtid) {
    load_xinput();
    g_wready = CreateEventW(NULL, TRUE, FALSE, NULL);
    HANDLE t = CreateThread(NULL, 0, watch_thread, NULL, 0, &g_wtid);
    if (t) { WaitForSingleObject(g_wready, 2000); CloseHandle(t); } else g_wtid = 0;
  }
  BOOL ok = g_wtid && PostThreadMessageW(g_wtid, WM_ARM, 0, 0);
  out("{\"ok\":%s,\"esc\":%s,\"pad\":%s,\"xinput\":\"%s\",\"guide\":%s}", ok ? "true" : "false",
      g_esc_on ? "true" : "false", g_pad_on && g_xget ? "true" : "false", g_xdll, g_xguide ? "true" : "false");
}
static void cmd_unwatch(void) {
  InterlockedExchange(&g_watch_on, 0);
  if (g_wtid) PostThreadMessageW(g_wtid, WM_DISARM, 0, 0);
  out("{\"ok\":true}");
}

static HWND parse_h(const char *s) { return (HWND)(ULONG_PTR)_strtoui64(s, NULL, 10); }

// Never outlive PS5 Menu: exit as soon as the parent process ends (in addition to stdin EOF).
static DWORD WINAPI parent_watch(LPVOID h) { WaitForSingleObject((HANDLE)h, INFINITE); resume_all(); ExitProcess(0); return 0; }
static void watch_parent(void) {
  snapshot_procs(); DWORD me = GetCurrentProcessId(), parent = 0;
  for (int i = 0; i < g_np; i++) if (g_pid[i] == me) { parent = g_ppid[i]; break; }
  HANDLE h = parent ? OpenProcess(SYNCHRONIZE, FALSE, parent) : NULL;
  if (!h) ExitProcess(0);
  CreateThread(NULL, 0, parent_watch, h, 0, NULL);
}

int main(void) {
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  InitializeCriticalSection(&g_io); InitializeCriticalSection(&g_sl);
  HMODULE nt = GetModuleHandleW(L"ntdll.dll");
  if (nt) { g_ntSuspend = (ntproc_t)(void *)GetProcAddress(nt, "NtSuspendProcess"); g_ntResume = (ntproc_t)(void *)GetProcAddress(nt, "NtResumeProcess"); }
  watch_parent();
  char line[8192];
  while (fgets(line, sizeof line, stdin)) {
    line[strcspn(line, "\r\n")] = 0;
    char *ctx = NULL; char *cmd = strtok_s(line, " ", &ctx); if (!cmd) continue;
    if (!strcmp(cmd, "quit")) break;
    else if (!strcmp(cmd, "snap")) { char *a = strtok_s(NULL, " ", &ctx); char *rest = ctx; cmd_snap(a ? strtoul(a, NULL, 10) : 0, rest); }
    else if (!strcmp(cmd, "alive")) {
      char *a = strtok_s(NULL, " ", &ctx); HWND h = a ? parse_h(a) : NULL; HWND fg = GetForegroundWindow();
      int al = h && IsWindow(h) && IsWindowVisible(h);
      out("{\"ok\":true,\"alive\":%s,\"minimized\":%s,\"fg\":%llu,\"isfg\":%s", al ? "true" : "false",
          (al && IsIconic(h)) ? "true" : "false", (unsigned long long)(ULONG_PTR)fg, fg == h ? "true" : "false");
      if (al) { out(",\"win\":"); win_json(h); }
      out("}");
    }
    else if (!strcmp(cmd, "fg")) { char *a = strtok_s(NULL, " ", &ctx); int ok = a ? cmd_fg(parse_h(a)) : 0; out("{\"ok\":%s,\"fg\":%llu}", ok ? "true" : "false", (unsigned long long)(ULONG_PTR)GetForegroundWindow()); }
    else if (!strcmp(cmd, "below")) {
      char *a = strtok_s(NULL, " ", &ctx), *b = strtok_s(NULL, " ", &ctx);
      BOOL ok = a && b && SetWindowPos(parse_h(a), parse_h(b), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
      out("{\"ok\":%s}", ok ? "true" : "false");
    }
    else if (!strcmp(cmd, "minimize")) { char *a = strtok_s(NULL, " ", &ctx); BOOL ok = a && ShowWindowAsync(parse_h(a), SW_SHOWMINNOACTIVE); out("{\"ok\":%s}", ok ? "true" : "false"); }
    else if (!strcmp(cmd, "keys")) { char *a = strtok_s(NULL, " ", &ctx), *b = strtok_s(NULL, " ", &ctx); if (a && b) cmd_keys(a, b); else out("{\"ok\":false}"); }
    else if (!strcmp(cmd, "restore")) { char *a = strtok_s(NULL, " ", &ctx); HWND h = a ? parse_h(a) : NULL; BOOL ok = h && IsWindow(h) && (IsIconic(h) ? ShowWindowAsync(h, SW_RESTORE) : TRUE); out("{\"ok\":%s}", ok ? "true" : "false"); }
    else if (!strcmp(cmd, "place")) {
      char *a = strtok_s(NULL, " ", &ctx), *x = strtok_s(NULL, " ", &ctx), *y = strtok_s(NULL, " ", &ctx), *w = strtok_s(NULL, " ", &ctx), *hh = strtok_s(NULL, " ", &ctx);
      BOOL ok = a && x && y && w && hh && SetWindowPos(parse_h(a), NULL, atoi(x), atoi(y), atoi(w), atoi(hh), SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS);
      out("{\"ok\":%s}", ok ? "true" : "false");
    }
    else if (!strcmp(cmd, "close")) { char *a = strtok_s(NULL, " ", &ctx); BOOL ok = a && IsWindow(parse_h(a)) && PostMessageW(parse_h(a), WM_CLOSE, 0, 0); out("{\"ok\":%s}", ok ? "true" : "false"); }
    else if (!strcmp(cmd, "suspend")) cmd_suspend(strtok_s(NULL, " ", &ctx));
    else if (!strcmp(cmd, "resume")) cmd_resume(strtok_s(NULL, " ", &ctx));
    else if (!strcmp(cmd, "term")) cmd_term(strtok_s(NULL, " ", &ctx));
    else if (!strcmp(cmd, "watch")) { char *a = strtok_s(NULL, " ", &ctx), *b = strtok_s(NULL, " ", &ctx), *c = strtok_s(NULL, " ", &ctx), *d = strtok_s(NULL, " ", &ctx); cmd_watch(a, b, c, d); }
    else if (!strcmp(cmd, "unwatch")) cmd_unwatch();
    else out("{\"ok\":false,\"error\":\"unknown command\"}");
    flush();
  }
  resume_all();   // quit or PS5 Menu closed our stdin: never leave a game paused
  return 0;
}
