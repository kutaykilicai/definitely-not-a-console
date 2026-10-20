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
//   quit
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
static void flush(void) { g_out[g_len] = 0; fputs(g_out, stdout); fputc('\n', stdout); fflush(stdout); g_len = 0; }

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

static HWND parse_h(const char *s) { return (HWND)(ULONG_PTR)_strtoui64(s, NULL, 10); }

// Never outlive PS5 Menu: exit as soon as the parent process ends (in addition to stdin EOF).
static DWORD WINAPI parent_watch(LPVOID h) { WaitForSingleObject((HANDLE)h, INFINITE); ExitProcess(0); return 0; }
static void watch_parent(void) {
  snapshot_procs(); DWORD me = GetCurrentProcessId(), parent = 0;
  for (int i = 0; i < g_np; i++) if (g_pid[i] == me) { parent = g_ppid[i]; break; }
  HANDLE h = parent ? OpenProcess(SYNCHRONIZE, FALSE, parent) : NULL;
  if (!h) ExitProcess(0);
  CreateThread(NULL, 0, parent_watch, h, 0, NULL);
}

int main(void) {
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
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
    else out("{\"ok\":false,\"error\":\"unknown command\"}");
    flush();
  }
  return 0;
}
