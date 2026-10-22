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
// <data>\cache\menu-state.txt ("game" while a game runs), <data>\cache\guide.txt ("0": the Xbox
// button does not open the menu). Log: <data>\logs\padwatch.log
// Xbox button: while a controller is connected its state is read every 50 ms (XInputGetStateEx,
// xinput1_4 ordinal 100, the only call that reports the Guide bit; empty slots every 2 s). One press
// opens the menu or brings it to the front ("--from-pad --guide"); over a game the menu shows Home
// and the game keeps running.
// Share button (Xbox Series controllers; XInput has no bit for it): read from the controller's own
// HID input reports through Raw Input (RIDEV_INPUTSINK, shared, works over Bluetooth while a game
// is in front; nothing is opened exclusively). Found by the HID descriptor (Consumer page, usage
// 0xB2 "Record", how the Series controller reports Share), else for the Series Bluetooth controller
// (045E:0B13) byte 16 bit 0 of report 1. One press (cache\share.txt "0": off) shows the Windows
// desktop like Win+D; a running menu gets "--from-pad --desktop" and puts itself and the game on the
// taskbar (the game keeps running).
// Build: x86_64-w64-mingw32-gcc -O2 -s -mwindows -municode -o dnac-padwatch.exe padwatch.c -luser32 -lshell32 -lshlwapi -lhid
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <dbt.h>
#include <hidsdi.h>
#include <hidpi.h>
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
#define TIMER_PAD 2
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
// Is the foreground window one of the menu's own (its full-screen window counts as "full screen" for
// Windows, but it is not a game)?
static int fg_is_menu(void) {
  HWND fg = GetForegroundWindow(); if (!fg) return 0;
  DWORD pid = 0; GetWindowThreadProcessId(fg, &pid); if (!pid) return 0;
  HANDLE ph = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid); if (!ph) return 0;
  wchar_t img[MAX_PATH * 2]; DWORD n = MAX_PATH * 2; int r = 0;
  if (QueryFullProcessImageNameW(ph, 0, img, &n)) {
    const wchar_t *a = wcsrchr(img, L'\\'), *b = wcsrchr(g_menu, L'\\');
    r = !_wcsicmp(a ? a + 1 : img, b ? b + 1 : g_menu);
  }
  CloseHandle(ph); return r;
}
static int busy_now(int *why_fs) {
  QUERY_USER_NOTIFICATION_STATE q = QUNS_ACCEPTS_NOTIFICATIONS;
  *why_fs = 0;
  char st0[64]; read_small(L"menu-state.txt", st0, sizeof st0);
  if (strncmp(st0, "game", 4) != 0 && fg_is_menu()) return 0;   // the menu itself is in front
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
// front: 0 open, 1 to the front (controller arrival), 2 Xbox button (Home over a running game),
// 3 Share button (the running menu goes to the taskbar with the game)
static void launch_menu(int front) {
  wchar_t cmd[MAX_PATH * 3]; _snwprintf(cmd, MAX_PATH * 3, L"\"%ls\" --from-pad%ls", g_menu, front == 2 ? L" --guide" : front == 3 ? L" --desktop" : L"");
  STARTUPINFOW si; PROCESS_INFORMATION pi; ZeroMemory(&si, sizeof si); si.cb = sizeof si; ZeroMemory(&pi, sizeof pi);
  wchar_t dir[MAX_PATH * 2]; wcsncpy(dir, g_menu, MAX_PATH * 2 - 1); dir[MAX_PATH * 2 - 1] = 0; wchar_t *sl = wcsrchr(dir, L'\\'); if (sl) *sl = 0;
  // A second start of the menu only brings the running one to the front (single instance).
  if (CreateProcessW(g_menu, cmd, NULL, NULL, FALSE, 0, NULL, dir, &si, &pi)) { CloseHandle(pi.hThread); CloseHandle(pi.hProcess); logf_("%s menu", front == 3 ? "desktop" : front ? "front" : "open"); }
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
// ---------- Xbox button ----------
typedef struct { WORD wButtons; BYTE lt, rt; SHORT lx, ly, rx, ry; } xpad_t;
typedef struct { DWORD packet; xpad_t pad; } xstate_t;
typedef DWORD (WINAPI *xget_t)(DWORD, xstate_t *);
static xget_t g_xget; static pw_btn_t g_gb[4]; static unsigned long long g_xnext[4];
static void load_xinput(void) {
  static const char *dlls[] = { "xinput1_4.dll", "xinput1_3.dll" };
  for (int i = 0; i < 2 && !g_xget; i++) { HMODULE m = LoadLibraryA(dlls[i]); if (m) g_xget = (xget_t)(void *)GetProcAddress(m, (LPCSTR)(ULONG_PTR)100); }
  logf_("xinput guide %s", g_xget ? "ok" : "unavailable");
}
static int guide_enabled(void) { char b[16]; return !(read_small(L"guide.txt", b, sizeof b) && b[0] == '0'); }
static void poll_guide(void) {
  if (!g_xget) return;
  unsigned long long t = now_ms();
  for (DWORD i = 0; i < 4; i++) {
    if (!g_gb[i].known && t < g_xnext[i]) continue;      // empty slot: look again every 2 s
    xstate_t st; ZeroMemory(&st, sizeof st);
    int conn = g_xget(i, &st) == 0; if (!conn) g_xnext[i] = t + 2000;
    if (!pw_edge(&g_gb[i], conn, conn && (st.pad.wButtons & 0x0400))) continue;
    int menu, game; scan_procs(&menu, &game);
    int why; int act = pw_guide(&g_pw, t, menu, guide_enabled(), &why);
    logf_("guide pad=%lu menu=%d game=%d -> %s (%s)", (unsigned long)i, menu, game, act == PW_OPEN ? "open" : act == PW_FRONT ? "front" : "none", pw_why_name[why]);
    if (act != PW_NONE) launch_menu(act == PW_FRONT ? 2 : 0);
  }
}

// ---------- Share button ----------
typedef struct { HANDLE dev; int mode; PHIDP_PREPARSED_DATA pp; pw_btn_t b; } sdev_t;   // mode 0: not a Share pad, 1: consumer 0xB2, 2: byte 16
static sdev_t g_sd[8]; static int g_sd_next;
static int share_enabled(void) { char b[16]; return !(read_small(L"share.txt", b, sizeof b) && b[0] == '0'); }
static void share_forget(HANDLE d) { for (int i = 0; i < 8; i++) if (g_sd[i].dev == d) { free(g_sd[i].pp); ZeroMemory(&g_sd[i], sizeof g_sd[i]); } }
static sdev_t *share_dev(HANDLE d) {
  for (int i = 0; i < 8; i++) if (g_sd[i].dev == d) return &g_sd[i];
  sdev_t *s = &g_sd[g_sd_next]; g_sd_next = (g_sd_next + 1) % 8;
  free(s->pp); ZeroMemory(s, sizeof *s); s->dev = d;
  RID_DEVICE_INFO info; UINT sz = sizeof info; info.cbSize = sizeof info;
  if (GetRawInputDeviceInfoW(d, RIDI_DEVICEINFO, &info, &sz) == (UINT)-1 || info.dwType != RIM_TYPEHID || info.hid.dwVendorId != 0x045E) return s;
  UINT ps = 0; GetRawInputDeviceInfoW(d, RIDI_PREPARSEDDATA, NULL, &ps);
  if (ps && (s->pp = (PHIDP_PREPARSED_DATA)malloc(ps)) && GetRawInputDeviceInfoW(d, RIDI_PREPARSEDDATA, s->pp, &ps) != (UINT)-1) {
    HIDP_CAPS caps; if (HidP_GetCaps(s->pp, &caps) == HIDP_STATUS_SUCCESS && caps.NumberInputButtonCaps) {
      USHORT n = caps.NumberInputButtonCaps; HIDP_BUTTON_CAPS *bc = (HIDP_BUTTON_CAPS *)calloc(n, sizeof *bc);
      if (bc && HidP_GetButtonCaps(HidP_Input, bc, &n, s->pp) == HIDP_STATUS_SUCCESS)
        for (USHORT k = 0; k < n; k++) if (bc[k].UsagePage == 0x0C && (bc[k].IsRange ? (bc[k].Range.UsageMin <= 0xB2 && 0xB2 <= bc[k].Range.UsageMax) : bc[k].NotRange.Usage == 0xB2)) s->mode = 1;
      free(bc);
    }
  }
  if (!s->mode && info.hid.dwProductId == 0x0B13) s->mode = 2;
  logf_("share pad %04lX:%04lX -> %s", (unsigned long)info.hid.dwVendorId, (unsigned long)info.hid.dwProductId, s->mode == 1 ? "hid consumer 0xB2" : s->mode == 2 ? "report byte 16" : "no share button");
  return s;
}
// Show the Windows desktop (the taskbar's own "show desktop", as Win+D); not when it is already showing.
static void show_desktop(void) {
  wchar_t cls[64] = L""; HWND fg = GetForegroundWindow(); if (fg) GetClassNameW(fg, cls, 64);
  if (!wcscmp(cls, L"Progman") || !wcscmp(cls, L"WorkerW")) { logf_("desktop already"); return; }
  HWND tray = FindWindowW(L"Shell_TrayWnd", NULL);
  if (tray && PostMessageW(tray, WM_COMMAND, 407, 0)) { logf_("desktop shown"); return; }
  INPUT in[4]; ZeroMemory(in, sizeof in);
  for (int i = 0; i < 4; i++) in[i].type = INPUT_KEYBOARD;
  in[0].ki.wVk = VK_LWIN; in[1].ki.wVk = 'D'; in[2].ki.wVk = 'D'; in[2].ki.dwFlags = KEYEVENTF_KEYUP; in[3].ki.wVk = VK_LWIN; in[3].ki.dwFlags = KEYEVENTF_KEYUP;
  logf_("desktop win+d %u", SendInput(4, in, sizeof in[0]));
}
static void on_share(void) {
  int menu, game; scan_procs(&menu, &game);
  int why; int act = pw_share(&g_pw, now_ms(), share_enabled(), &why);
  logf_("share menu=%d game=%d -> %s (%s)", menu, game, act == PW_DESKTOP ? "desktop" : "none", pw_why_name[why]);
  if (act != PW_DESKTOP) return;
  if (menu) launch_menu(3);
  show_desktop();
}
static void on_input(HRAWINPUT hr) {
  static BYTE buf[2048]; UINT sz = 0;
  if (GetRawInputData(hr, RID_INPUT, NULL, &sz, sizeof(RAWINPUTHEADER)) != 0 || sz > sizeof buf) return;
  if (GetRawInputData(hr, RID_INPUT, buf, &sz, sizeof(RAWINPUTHEADER)) == (UINT)-1) return;
  RAWINPUT *ri = (RAWINPUT *)buf; if (ri->header.dwType != RIM_TYPEHID) return;
  sdev_t *d = share_dev(ri->header.hDevice); if (!d->mode) return;
  DWORD len = ri->data.hid.dwSizeHid;
  for (DWORD i = 0; i < ri->data.hid.dwCount; i++) {
    BYTE *r = ri->data.hid.bRawData + i * len; int down = -1;
    if (d->mode == 1) {
      USAGE us[16]; ULONG n = 16;
      NTSTATUS st = HidP_GetUsages(HidP_Input, 0x0C, 0, us, &n, d->pp, (PCHAR)r, len);
      if (st == HIDP_STATUS_SUCCESS) { down = 0; for (ULONG k = 0; k < n; k++) if (us[k] == 0xB2) down = 1; }
    } else if (len >= 17 && r[0] == 0x01) down = r[16] & 1;
    if (down >= 0 && pw_edge(&d->b, 1, down)) on_share();   // other reports (battery, Guide) leave it as it was
  }
}

static LRESULT CALLBACK wndproc(HWND h, UINT m, WPARAM w, LPARAM l) {
  switch (m) {
    case WM_INPUT: on_input((HRAWINPUT)l); break;   // DefWindowProc frees the input
    case WM_INPUT_DEVICE_CHANGE:
      if (w == GIDC_REMOVAL) share_forget((HANDLE)l);
      /* fall through */
    case WM_DEVICECHANGE:
      if (m == WM_DEVICECHANGE && w != DBT_DEVICEARRIVAL && w != DBT_DEVICEREMOVECOMPLETE) break;
      if ((m == WM_INPUT_DEVICE_CHANGE && w == GIDC_ARRIVAL) || (m == WM_DEVICECHANGE && w == DBT_DEVICEARRIVAL)) g_pending_arrival = 1;
      // several notifications come for one controller; decide once, after they settle
      SetTimer(h, TIMER_SETTLE, 1200, NULL); return 0;
    case WM_TIMER: if (w == TIMER_SETTLE) { KillTimer(h, TIMER_SETTLE); settle(); } else if (w == TIMER_PAD) poll_guide(); return 0;
    case WM_POWERBROADCAST: if (w == PBT_APMRESUMEAUTOMATIC || w == PBT_APMRESUMESUSPEND) { pw_resume(&g_pw, now_ms()); logf_("resume"); } return TRUE;
    case WM_ENDSESSION: if (w) PostQuitMessage(0); return 0;
  }
  return DefWindowProcW(h, m, w, l);
}
static const wchar_t *argval(int argc, wchar_t **argv, const wchar_t *k) { for (int i = 1; i + 1 < argc; i++) if (!wcscmp(argv[i], k)) return argv[i + 1]; return NULL; }
static int hasarg(int argc, wchar_t **argv, const wchar_t *k) { for (int i = 1; i < argc; i++) if (!wcscmp(argv[i], k)) return 1; return 0; }

// --simulate: "<ms> arrival|removal|resume <pads> <menu 0/1> <busy 0/1> <closedAgoMs or -1>" per line,
//             "<ms> guide <menu 0/1> <enabled 0/1>" for an Xbox button press, "<ms> share <enabled 0/1>"
static int simulate(void) {
  pw_t p; char line[256]; int inited = 0;
  while (fgets(line, sizeof line, stdin)) {
    unsigned long long t = 0; char ev[32] = ""; int pads = 0, menu = 0, busy = 0; long long ago = -1;
    if (sscanf(line, "%llu %31s %d %d %d %lld", &t, ev, &pads, &menu, &busy, &ago) < 2) continue;
    if (!inited) { pw_init(&p, t); inited = 1; if (!strcmp(ev, "start")) { printf("%llu start\n", t); fflush(stdout); continue; } }
    if (!strcmp(ev, "resume")) { pw_resume(&p, t); printf("%llu resume\n", t); fflush(stdout); continue; }
    if (!strcmp(ev, "share")) {   // field: <enabled>
      int why; int act = pw_share(&p, t, pads, &why);
      printf("%llu share -> %s %s\n", t, act == PW_DESKTOP ? "desktop" : "none", pw_why_name[why]); fflush(stdout); continue;
    }
    if (!strcmp(ev, "guide")) {   // fields: <menu> <enabled> (read into pads / menu)
      int why; int act = pw_guide(&p, t, pads, menu, &why);
      printf("%llu guide -> %s %s\n", t, act == PW_OPEN ? "open" : act == PW_FRONT ? "front" : "none", pw_why_name[why]); fflush(stdout); continue;
    }
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
  SetPriorityClass(GetCurrentProcess(), BELOW_NORMAL_PRIORITY_CLASS);   // idle priority could delay the Xbox button behind a busy game
  pw_init(&g_pw, now_ms()); g_pw.pads = count_pads();
  WNDCLASSW wc; ZeroMemory(&wc, sizeof wc); wc.lpfnWndProc = wndproc; wc.hInstance = hi; wc.lpszClassName = L"DNACPadWatch";
  RegisterClassW(&wc);
  HWND h = CreateWindowExW(WS_EX_TOOLWINDOW, wc.lpszClassName, L"DNAC PadWatch", WS_POPUP, 0, 0, 0, 0, NULL, NULL, hi, NULL);   // never shown
  // gamepads, joysticks: notifications, and input reports in the background for the Share button
  RAWINPUTDEVICE rid[2] = { { 1, 5, RIDEV_DEVNOTIFY | RIDEV_INPUTSINK, h }, { 1, 4, RIDEV_DEVNOTIFY | RIDEV_INPUTSINK, h } };
  RegisterRawInputDevices(rid, 2, sizeof rid[0]);
  DEV_BROADCAST_DEVICEINTERFACE_W f; ZeroMemory(&f, sizeof f); f.dbcc_size = sizeof f; f.dbcc_devicetype = DBT_DEVTYP_DEVICEINTERFACE; f.dbcc_classguid = XUSB_IFACE;
  HDEVNOTIFY dn = RegisterDeviceNotificationW(h, &f, DEVICE_NOTIFY_WINDOW_HANDLE);
  logf_("start pads=%d menu=%ls", g_pw.pads, g_menu);
  load_xinput();
  SetTimer(h, TIMER_PAD, 50, NULL);
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
