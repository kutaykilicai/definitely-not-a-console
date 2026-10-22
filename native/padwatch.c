// dnac-padwatch.exe: opens Definitely Not a Console when a controller connects, like a console that
// turns on with its controller. A small hidden window that waits for device notifications
// (Raw Input WM_INPUT_DEVICE_CHANGE for gamepads/joysticks + the XUSB interface for Xbox pads,
// WM_POWERBROADCAST for wake-ups); no polling, no admin rights. Started at login from
// HKCU\...\Run by the menu (Ayarlar > Kumanda bağlanınca menüyü aç).
//   dnac-padwatch.exe --menu "<menu exe>" --data "<menu data folder>"   watch
//   dnac-padwatch.exe --stop                                            ask a running watcher to exit
//   dnac-padwatch.exe --simulate                                        rules only: stdin events -> stdout decisions
// The menu writes <data>\cache\padwatch.txt (exe names of games/emulators, one per line),
// <data>\cache\menu-closed.txt (ms since 1970 when the user closed the menu), and
// <data>\cache\menu-state.txt ("game" while a game runs). Log: <data>\logs\padwatch.log
// Build: x86_64-w64-mingw32-gcc -O2 -s -mwindows -o dnac-padwatch.exe padwatch.c -luser32 -lshell32 -lshlwapi
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <dbt.h>
#include <shellapi.h>
#include <tlhelp32.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include "padwatch.h"

static const GUID XUSB_IFACE = { 0xEC87F1E3, 0xC13B, 0x4100, { 0xB5, 0xF7, 0x8B, 0x84, 0xD5, 0x42, 0x60, 0xCB } };
#define QUIT_EVENT L"Local\\DNAC-PadWatch-Quit"
#define TIMER_SETTLE 1
static wchar_t g_menu[MAX_PATH * 2], g_data[MAX_PATH * 2];
static pw_t g_pw; static HANDLE g_quit;
static int g_pending_arrival;

static unsigned long long now_ms(void) { return GetTickCount64(); }
static unsigned long long epoch_ms(void) { FILETIME ft; GetSystemTimeAsFileTime(&ft); ULARGE_INTEGER u; u.LowPart = ft.dwLowDateTime; u.HighPart = ft.dwHighDateTime; return (u.QuadPart - 116444736000000000ULL) / 10000ULL; }

static void logf_(const char *fmt, ...) {
  if (!g_data[0]) return;
  wchar_t f[MAX_PATH * 2]; _snwprintf(f, MAX_PATH * 2, L"%ls\\logs\\padwatch.log", g_data);
  wchar_t d[MAX_PATH * 2]; _snwprintf(d, MAX_PATH * 2, L"%ls\\logs", g_data); CreateDirectoryW(d, NULL);
  // keep it small: start over past 256 KB
  WIN32_FILE_ATTRIBUTE_DATA a; if (GetFileAttributesExW(f, GetFileExInfoStandard, &a) && a.nFileSizeLow > 256 * 1024) DeleteFileW(f);
  FILE *fp = _wfopen(f, L"a"); if (!fp) return;
  SYSTEMTIME t; GetLocalTime(&t); fprintf(fp, "%04d-%02d-%02d %02d:%02d:%02d ", t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond);
  va_list ap; va_start(ap, fmt); vfprintf(fp, fmt, ap); va_end(ap); fputc('\n', fp); fclose(fp);
}
static int read_small(const wchar_t *name, char *buf, int cap) {
  wchar_t f[MAX_PATH * 2]; _snwprintf(f, MAX_PATH * 2, L"%ls\\cache\\%ls", g_data, name);
  HANDLE h = CreateFileW(f, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, OPEN_EXISTING, 0, NULL);
  if (h == INVALID_HANDLE_VALUE) { buf[0] = 0; return 0; }
  DWORD n = 0; ReadFile(h, buf, cap - 1, &n, NULL); CloseHandle(h); buf[n] = 0; return (int)n;
}

// Processes: is the menu running, is one of the listed games/emulators running?
static void scan_procs(int *menu, int *game) {
  *menu = 0; *game = 0;
  static char list[16384]; read_small(L"padwatch.txt", list, sizeof list);
  const wchar_t *mexe = wcsrchr(g_menu, L'\\'); mexe = mexe ? mexe + 1 : g_menu;
  HANDLE s = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0); if (s == INVALID_HANDLE_VALUE) return;
  PROCESSENTRY32W e; e.dwSize = sizeof e;
  for (BOOL ok = Process32FirstW(s, &e); ok; ok = Process32NextW(s, &e)) {
    if (!_wcsicmp(e.szExeFile, mexe)) { *menu = 1; continue; }
    if (!list[0]) continue;
    char name[MAX_PATH * 3]; int n = WideCharToMultiByte(CP_UTF8, 0, e.szExeFile, -1, name, sizeof name, NULL, NULL); if (n <= 1) continue;
    for (char *c = name; *c; c++) if (*c >= 'A' && *c <= 'Z') *c += 32;
    // whole-line match in the list (lower-case names, one per line)
    size_t L = strlen(name);
    for (const char *p = strstr(list, name); p; p = strstr(p + 1, name))
      if ((p == list || p[-1] == '\n') && (p[L] == '\r' || p[L] == '\n' || p[L] == 0)) { *game = 1; break; }
  }
  CloseHandle(s);
}
static int busy_now(int *why_fs) {
  QUERY_USER_NOTIFICATION_STATE q = QUNS_ACCEPTS_NOTIFICATIONS;
  *why_fs = 0;
  if (SUCCEEDED(SHQueryUserNotificationState(&q)) && (q == QUNS_BUSY || q == QUNS_RUNNING_D3D_FULL_SCREEN || q == QUNS_PRESENTATION_MODE)) { *why_fs = (int)q; return 1; }
  char st[64]; read_small(L"menu-state.txt", st, sizeof st);
  return strncmp(st, "game", 4) == 0;
}
static unsigned long long closed_at_tick(void) {
  char b[64]; if (!read_small(L"menu-closed.txt", b, sizeof b)) return 0;
  unsigned long long at = _strtoui64(b, NULL, 10), e = epoch_ms(); if (!at || at > e) return 0;
  unsigned long long ago = e - at, t = now_ms(); return ago < t ? t - ago : 1;
}
static int count_pads(void) {
  UINT n = 0; if (GetRawInputDeviceList(NULL, &n, sizeof(RAWINPUTDEVICELIST)) != 0 || !n) return 0;
  RAWINPUTDEVICELIST *l = (RAWINPUTDEVICELIST *)calloc(n, sizeof *l); if (!l) return 0;
  int pads = 0; UINT got = GetRawInputDeviceList(l, &n, sizeof *l);
  for (UINT i = 0; i < got && got != (UINT)-1; i++) {
    if (l[i].dwType != RIM_TYPEHID) continue;
    RID_DEVICE_INFO info; UINT sz = sizeof info; info.cbSize = sizeof info;
    if (GetRawInputDeviceInfoW(l[i].hDevice, RIDI_DEVICEINFO, &info, &sz) == (UINT)-1) continue;
    if (info.hid.usUsagePage == 1 && (info.hid.usUsage == 4 || info.hid.usUsage == 5)) pads++;
  }
  free(l); return pads;
}
static void launch_menu(int front) {
  wchar_t cmd[MAX_PATH * 3]; _snwprintf(cmd, MAX_PATH * 3, L"\"%ls\" --from-pad", g_menu);
  STARTUPINFOW si; PROCESS_INFORMATION pi; ZeroMemory(&si, sizeof si); si.cb = sizeof si; ZeroMemory(&pi, sizeof pi);
  wchar_t dir[MAX_PATH * 2]; wcsncpy(dir, g_menu, MAX_PATH * 2 - 1); dir[MAX_PATH * 2 - 1] = 0; wchar_t *sl = wcsrchr(dir, L'\\'); if (sl) *sl = 0;
  // A second start of the menu only brings the running one to the front (single instance).
  if (CreateProcessW(g_menu, cmd, NULL, NULL, FALSE, 0, NULL, dir, &si, &pi)) { CloseHandle(pi.hThread); CloseHandle(pi.hProcess); logf_("%s menu", front ? "front" : "open"); }
  else logf_("start failed %lu", GetLastError());
}
static void settle(void) {
  int pads = count_pads(), menu, game, fs; scan_procs(&menu, &game);
  int busy = game || busy_now(&fs);
  int why; int act = pw_event(&g_pw, g_pending_arrival, pads, now_ms(), menu, busy, closed_at_tick(), &why);
  logf_("%s pads=%d menu=%d busy=%d -> %s (%s)", g_pending_arrival ? "arrival" : "removal", pads, menu, busy, act == PW_OPEN ? "open" : act == PW_FRONT ? "front" : "none", pw_why_name[why]);
  g_pending_arrival = 0;
  if (act != PW_NONE) launch_menu(act == PW_FRONT);
}
static LRESULT CALLBACK wndproc(HWND h, UINT m, WPARAM w, LPARAM l) {
  switch (m) {
    case WM_INPUT_DEVICE_CHANGE:
    case WM_DEVICECHANGE:
      if (m == WM_DEVICECHANGE && w != DBT_DEVICEARRIVAL && w != DBT_DEVICEREMOVECOMPLETE) break;
      if ((m == WM_INPUT_DEVICE_CHANGE && w == GIDC_ARRIVAL) || (m == WM_DEVICECHANGE && w == DBT_DEVICEARRIVAL)) g_pending_arrival = 1;
      // several notifications come for one controller; decide once, after they settle
      SetTimer(h, TIMER_SETTLE, 1200, NULL); return 0;
    case WM_TIMER: if (w == TIMER_SETTLE) { KillTimer(h, TIMER_SETTLE); settle(); } return 0;
    case WM_POWERBROADCAST: if (w == PBT_APMRESUMEAUTOMATIC || w == PBT_APMRESUMESUSPEND) { pw_resume(&g_pw, now_ms()); logf_("resume"); } return TRUE;
    case WM_ENDSESSION: if (w) PostQuitMessage(0); return 0;
  }
  return DefWindowProcW(h, m, w, l);
}
static const wchar_t *argval(int argc, wchar_t **argv, const wchar_t *k) { for (int i = 1; i + 1 < argc; i++) if (!wcscmp(argv[i], k)) return argv[i + 1]; return NULL; }
static int hasarg(int argc, wchar_t **argv, const wchar_t *k) { for (int i = 1; i < argc; i++) if (!wcscmp(argv[i], k)) return 1; return 0; }

// --simulate: "<ms> arrival|removal|resume <pads> <menu 0/1> <busy 0/1> <closedAgoMs or -1>" per line
static int simulate(void) {
  pw_t p; char line[256]; int inited = 0;
  while (fgets(line, sizeof line, stdin)) {
    unsigned long long t = 0; char ev[32] = ""; int pads = 0, menu = 0, busy = 0; long long ago = -1;
    if (sscanf(line, "%llu %31s %d %d %d %lld", &t, ev, &pads, &menu, &busy, &ago) < 2) continue;
    if (!inited) { pw_init(&p, t); inited = 1; if (!strcmp(ev, "start")) { printf("%llu start\n", t); fflush(stdout); continue; } }
    if (!strcmp(ev, "resume")) { pw_resume(&p, t); printf("%llu resume\n", t); fflush(stdout); continue; }
    int why; int act = pw_event(&p, !strcmp(ev, "arrival"), pads, t, menu, busy, ago >= 0 ? t - (unsigned long long)ago : 0, &why);
    printf("%llu %s -> %s %s\n", t, ev, act == PW_OPEN ? "open" : act == PW_FRONT ? "front" : "none", pw_why_name[why]); fflush(stdout);
  }
  return 0;
}

int WINAPI wWinMain(HINSTANCE hi, HINSTANCE prev, PWSTR cl, int show) {
  (void)prev; (void)cl; (void)show;
  int argc = 0; wchar_t **argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  if (hasarg(argc, argv, L"--simulate")) return simulate();
  if (hasarg(argc, argv, L"--stop")) { HANDLE e = OpenEventW(EVENT_MODIFY_STATE, FALSE, QUIT_EVENT); if (e) { SetEvent(e); CloseHandle(e); return 0; } return 1; }
  const wchar_t *menu = argval(argc, argv, L"--menu"), *data = argval(argc, argv, L"--data");
  if (!menu || !data) return 2;
  wcsncpy(g_menu, menu, MAX_PATH * 2 - 1); wcsncpy(g_data, data, MAX_PATH * 2 - 1);
  HANDLE mx = CreateMutexW(NULL, TRUE, L"Local\\DNAC-PadWatch"); if (GetLastError() == ERROR_ALREADY_EXISTS) return 0;   // one watcher
  g_quit = CreateEventW(NULL, TRUE, FALSE, QUIT_EVENT);
  SetPriorityClass(GetCurrentProcess(), IDLE_PRIORITY_CLASS);
  pw_init(&g_pw, now_ms()); g_pw.pads = count_pads();
  WNDCLASSW wc; ZeroMemory(&wc, sizeof wc); wc.lpfnWndProc = wndproc; wc.hInstance = hi; wc.lpszClassName = L"DNACPadWatch";
  RegisterClassW(&wc);
  HWND h = CreateWindowExW(WS_EX_TOOLWINDOW, wc.lpszClassName, L"DNAC PadWatch", WS_POPUP, 0, 0, 0, 0, NULL, NULL, hi, NULL);   // never shown
  RAWINPUTDEVICE rid[2] = { { 1, 5, RIDEV_DEVNOTIFY, h }, { 1, 4, RIDEV_DEVNOTIFY, h } };   // gamepads, joysticks; no input reports
  RegisterRawInputDevices(rid, 2, sizeof rid[0]);
  DEV_BROADCAST_DEVICEINTERFACE_W f; ZeroMemory(&f, sizeof f); f.dbcc_size = sizeof f; f.dbcc_devicetype = DBT_DEVTYP_DEVICEINTERFACE; f.dbcc_classguid = XUSB_IFACE;
  HDEVNOTIFY dn = RegisterDeviceNotificationW(h, &f, DEVICE_NOTIFY_WINDOW_HANDLE);
  logf_("start pads=%d menu=%ls", g_pw.pads, g_menu);
  for (;;) {
    DWORD r = MsgWaitForMultipleObjects(1, &g_quit, FALSE, INFINITE, QS_ALLINPUT);
    if (r == WAIT_OBJECT_0) break;
    MSG msg; int quit = 0;
    while (PeekMessageW(&msg, NULL, 0, 0, PM_REMOVE)) { if (msg.message == WM_QUIT) { quit = 1; break; } TranslateMessage(&msg); DispatchMessageW(&msg); }
    if (quit) break;
  }
  logf_("stop");
  if (dn) UnregisterDeviceNotification(dn);
  DestroyWindow(h); if (mx) { ReleaseMutex(mx); CloseHandle(mx); }
  return 0;
}
