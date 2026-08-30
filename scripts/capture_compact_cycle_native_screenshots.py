#!/usr/bin/env python3
"""Capture real Win32 window screenshots for the full compact-mode cycle."""

from __future__ import annotations

import ctypes
import json
import os
import shutil
import subprocess
import sys
import time
import zipfile
from ctypes import wintypes
from pathlib import Path

from marionette_driver.marionette import Marionette
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".tmp-beta-polish" / "launch-regression-verify" / "screenshots"
LIVE = ROOT / ".tmp-beta-polish" / "astra-live-verify"
PORT = int(os.environ.get("MARIONETTE_PORT", "2906"))

JAR_PATHS = {
    "chrome/browser/content/browser/ZenUIManager.mjs": ROOT
    / "src/zen/common/modules/ZenUIManager.mjs",
    "chrome/browser/content/browser/zen-components/ZenCompactMode.mjs": ROOT
    / "src/zen/compact-mode/ZenCompactMode.mjs",
    "chrome/browser/content/browser/zen-styles/astra-compact.css": ROOT
    / "src/zen/common/styles/astra-compact.css",
    "chrome/browser/content/browser/zen-styles/astra-sidebar.css": ROOT
    / "src/zen/common/styles/astra-sidebar.css",
}

user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32

PW_RENDERFULLCONTENT = 0x00000002

SETUP = r"""
const done = arguments[arguments.length - 1];
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const P = Services.prefs;
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  const doc = win.document;

  P.setBoolPref("zen.view.use-single-toolbar", %USE_SINGLE%);
  P.setBoolPref("zen.view.sidebar-expanded", true);
  P.setBoolPref("zen.view.compact.hide-toolbar", true);
  P.setBoolPref("zen.view.compact.hide-tabbar", true);
  P.setBoolPref("astra.sidebar.collapsed-layout.enabled", false);

  const tab = gBrowser.addTab("https://example.com/", {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  });
  gBrowser.selectedTab = tab;
  await sleep(2500);
  gZenVerticalTabsManager?._updateEvent();
  await sleep(900);
  win.resizeTo(Math.max(win.outerWidth, 1280), Math.max(win.outerHeight, 820));
  await sleep(500);
  win.focus();
  await sleep(300);
  done({
    ok: true,
    singleToolbar: doc.documentElement.getAttribute("zen-single-toolbar"),
    useSingleToolbarPref: P.getBoolPref("zen.view.use-single-toolbar", false),
  });
})().catch(e => done({ error: String(e), stack: e.stack }));
"""

STEP_SCRIPTS = {
    "01-compact-off-normal": r"""
const done = arguments[arguments.length - 1];
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  const doc = win.document;
  if (gZenCompactModeManager.preference) {
    gZenCompactModeManager.preference = false;
    await sleep(1200);
  }
  gZenVerticalTabsManager?._updateEvent();
  await sleep(600);
  win.focus();
  await sleep(400);
  done({ compactMode: doc.documentElement.getAttribute("zen-compact-mode") });
})().catch(e => done({ error: String(e), stack: e.stack }));
""",
    "02-compact-on-before-hover": r"""
const done = arguments[arguments.length - 1];
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  const doc = win.document;
  const toolbox = doc.getElementById("navigator-toolbox");
  const toolbarWrap = doc.getElementById("zen-appcontent-navbar-wrapper");

  gZenCompactModeManager._ignoreNextHover = true;
  gZenCompactModeManager.preference = true;
  await sleep(1800);
  toolbox?.removeAttribute("zen-has-hover");
  toolbarWrap?.removeAttribute("zen-has-hover");
  gZenCompactModeManager._edgeRevealActive = false;
  gZenCompactModeManager._topToolbarEdgeRevealActive = false;
  gZenCompactModeManager._setCompactChromeRevealed?.(false, { immediate: true });
  await sleep(700);
  win.focus();
  await sleep(400);
  done({
    compactMode: doc.documentElement.getAttribute("zen-compact-mode"),
    toolboxHover: toolbox?.hasAttribute("zen-has-hover"),
    toolboxLeft: toolbox?.getBoundingClientRect().left,
  });
})().catch(e => done({ error: String(e), stack: e.stack }));
""",
    "03-compact-on-hover-revealed": r"""
const done = arguments[arguments.length - 1];
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  const doc = win.document;
  const toolbox = doc.getElementById("navigator-toolbox");
  const toolbarWrap = doc.getElementById("zen-appcontent-navbar-wrapper");
  const toolbarEdge = doc.getElementById("zen-compact-hover-toolbar-edge");
  const sidebarEdge = doc.getElementById("zen-compact-hover-sidebar-edge");

  toolbarEdge?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  sidebarEdge?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  await sleep(350);
  gZenCompactModeManager._setCompactChromeRevealed?.(true);
  toolbox?.setAttribute("zen-has-hover", "true");
  toolbarWrap?.setAttribute("zen-has-hover", "true");
  await sleep(550);

  const compact = doc.getElementById("zen-toggle-compact-mode");
  const ai = doc.getElementById("astra-ai-sidebar-button");
  const navBar = doc.getElementById("nav-bar");
  const navTarget = doc.getElementById("nav-bar-customization-target");
  win.focus();
  await sleep(400);
  done({
    compactMode: doc.documentElement.getAttribute("zen-compact-mode"),
    compactParent: compact?.parentElement?.id,
    aiParent: ai?.parentElement?.id,
    compactInNav: navTarget?.contains(compact),
    aiInNav: navTarget?.contains(ai),
    compactInToolbar: navBar?.contains(compact),
    aiInToolbar: navBar?.contains(ai),
    stripParent: doc.getElementById("zen-sidebar-top-buttons")?.parentElement?.id,
    toolbarHover: toolbarWrap?.hasAttribute("zen-has-hover"),
  });
})().catch(e => done({ error: String(e), stack: e.stack }));
""",
    "04-compact-off-after-hover-cycle": r"""
const done = arguments[arguments.length - 1];
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  const doc = win.document;
  const toolbox = doc.getElementById("navigator-toolbox");
  const toolbarWrap = doc.getElementById("zen-appcontent-navbar-wrapper");

  toolbox?.removeAttribute("zen-has-hover");
  toolbarWrap?.removeAttribute("zen-has-hover");
  gZenCompactModeManager._setCompactChromeRevealed?.(false, { immediate: true });
  gZenCompactModeManager._clearEdgeRevealState?.();
  await sleep(500);

  gZenCompactModeManager.preference = false;
  await sleep(1500);
  gZenVerticalTabsManager?._updateEvent();
  await sleep(600);
  win.focus();
  await sleep(400);

  const foot = doc.getElementById("zen-sidebar-foot-buttons");
  const children = foot
    ? [...foot.children].map(el => {
        const r = el.getBoundingClientRect();
        const cs = win.getComputedStyle(el);
        return {
          id: el.id || el.localName,
          x: Math.round(r.x * 10) / 10,
          w: Math.round(r.width * 10) / 10,
          display: cs.display,
        };
      })
    : [];
  const vis = children.filter(c => c.display !== "none" && c.w > 0);
  done({
    compactMode: doc.documentElement.getAttribute("zen-compact-mode"),
    footGap: vis.length >= 2 ? Math.round((vis[1].x - (vis[0].x + vis[0].w)) * 10) / 10 : null,
    children,
  });
})().catch(e => done({ error: String(e), stack: e.stack }));
""",
}


def ensure_patched_copy() -> Path:
    src_dir = Path(r"C:\Program Files\Astra Browser")
    exe = src_dir / "astra.exe"
    if not exe.is_file():
        raise SystemExit(f"Installed binary not found: {exe}")
    if not LIVE.is_dir() or not (LIVE / "astra.exe").is_file():
        print("Copying full install to", LIVE, flush=True)
        if LIVE.exists():
            shutil.rmtree(LIVE, ignore_errors=True)
        shutil.copytree(src_dir, LIVE)
    jar = LIVE / "browser" / "omni.ja"
    repl = {k: v.read_bytes() for k, v in JAR_PATHS.items()}
    tmp = jar.with_suffix(".ja.cycletmp")
    with zipfile.ZipFile(jar, "r") as zin, zipfile.ZipFile(
        tmp, "w", compression=zipfile.ZIP_STORED
    ) as zout:
        for info in zin.infolist():
            data = repl.get(info.filename, zin.read(info.filename))
            ni = zipfile.ZipInfo(filename=info.filename, date_time=info.date_time)
            ni.compress_type = zipfile.ZIP_STORED
            ni.external_attr = info.external_attr
            zout.writestr(ni, data)
    tmp.replace(jar)
    print("Patched omni.ja with current dev fixes", flush=True)
    return LIVE / "astra.exe"


def find_exe() -> Path:
    env = os.environ.get("ASTRA_EXE")
    if env:
        p = Path(env)
        if p.is_file():
            return p
        raise SystemExit(f"ASTRA_EXE not found: {p}")
    if os.environ.get("USE_PATCHED", "1") != "0":
        return ensure_patched_copy()
    candidates = [
        ROOT / "engine" / "obj-x86_64-pc-windows-msvc" / "dist" / "bin" / "astra.exe",
        Path(r"C:\Program Files\Astra Browser\astra.exe"),
    ]
    for c in candidates:
        if c.is_file():
            return c
    raise SystemExit("No astra.exe found. Set ASTRA_EXE or install Astra Browser.")


def kill_astra() -> None:
    subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            "Get-Process astra,plugin-container -ErrorAction SilentlyContinue | Stop-Process -Force",
        ],
        check=False,
    )
    time.sleep(2)


def astra_pids() -> set[int]:
    pids: set[int] = set()
    out = subprocess.run(
        ["powershell", "-NoProfile", "-Command", "(Get-Process astra -ErrorAction SilentlyContinue).Id"],
        capture_output=True,
        text=True,
        check=False,
    ).stdout
    for token in out.split():
        if token.strip().isdigit():
            pids.add(int(token.strip()))
    return pids


def find_main_hwnd(_pid: int) -> int | None:
    candidates: list[tuple[int, int, int, str]] = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def enum_proc(hwnd: int, _lparam: int) -> bool:
        if not user32.IsWindowVisible(hwnd):
            return True
        proc_id = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(proc_id))
        if proc_id.value not in astra_pids():
            return True
        cls = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, cls, 256)
        if cls.value != "MozillaWindowClass":
            return True
        title = ctypes.create_unicode_buffer(512)
        user32.GetWindowTextW(hwnd, title, 512)
        rect = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        w = rect.right - rect.left
        h = rect.bottom - rect.top
        if w < 400 or h < 300:
            return True
        candidates.append((w * h, w, h, title.value))
        return True

    user32.EnumWindows(enum_proc, 0)
    if not candidates:
        return None
    # Prefer the largest browser chrome window (main navigator window).
    best_area = max(c[0] for c in candidates)
    best: int | None = None

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def pick_proc(hwnd: int, _lparam: int) -> bool:
        nonlocal best
        if not user32.IsWindowVisible(hwnd):
            return True
        proc_id = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(proc_id))
        if proc_id.value not in astra_pids():
            return True
        cls = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, cls, 256)
        if cls.value != "MozillaWindowClass":
            return True
        rect = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        w = rect.right - rect.left
        h = rect.bottom - rect.top
        if w * h == best_area:
            best = hwnd
            return False
        return True

    user32.EnumWindows(pick_proc, 0)
    return best


def capture_hwnd(hwnd: int) -> Image.Image:
    rect = wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    width = rect.right - rect.left
    height = rect.bottom - rect.top
    if width <= 0 or height <= 0:
        raise RuntimeError(f"Invalid window size: {width}x{height}")

    hwnd_dc = user32.GetWindowDC(hwnd)
    if not hwnd_dc:
        raise RuntimeError("GetWindowDC failed")
    mem_dc = gdi32.CreateCompatibleDC(hwnd_dc)
    bitmap = gdi32.CreateCompatibleBitmap(hwnd_dc, width, height)
    old = gdi32.SelectObject(mem_dc, bitmap)
    ok = user32.PrintWindow(hwnd, mem_dc, PW_RENDERFULLCONTENT)
    if not ok:
        user32.PrintWindow(hwnd, mem_dc, 0)

    class BITMAPINFOHEADER(ctypes.Structure):
        _fields_ = [
            ("biSize", wintypes.DWORD),
            ("biWidth", wintypes.LONG),
            ("biHeight", wintypes.LONG),
            ("biPlanes", wintypes.WORD),
            ("biBitCount", wintypes.WORD),
            ("biCompression", wintypes.DWORD),
            ("biSizeImage", wintypes.DWORD),
            ("biXPelsPerMeter", wintypes.LONG),
            ("biYPelsPerMeter", wintypes.LONG),
            ("biClrUsed", wintypes.DWORD),
            ("biClrImportant", wintypes.DWORD),
        ]

    bmi = BITMAPINFOHEADER()
    bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    bmi.biWidth = width
    bmi.biHeight = -height
    bmi.biPlanes = 1
    bmi.biBitCount = 32
    bmi.biCompression = 0

    buf = (ctypes.c_char * (width * height * 4))()
    gdi32.GetDIBits(mem_dc, bitmap, 0, height, buf, ctypes.byref(bmi), 0)
    gdi32.SelectObject(mem_dc, old)
    gdi32.DeleteObject(bitmap)
    gdi32.DeleteDC(mem_dc)
    user32.ReleaseDC(hwnd, hwnd_dc)

    img = Image.frombuffer("RGBA", (width, height), bytes(buf), "raw", "BGRA", 0, 1)
    return img.convert("RGB")


def capture_layout(layout_key: str, only_sidebar: bool, exe: Path) -> dict:
    label = "only-sidebar" if only_sidebar else "sidebar-top-toolbar"
    layout_out = OUT / label
    layout_out.mkdir(parents=True, exist_ok=True)
    port = PORT + (1 if only_sidebar else 0)

    profile = ROOT / ".tmp-beta-polish" / "launch-regression-verify" / f"profile-native-{label}"
    if profile.exists():
        shutil.rmtree(profile, ignore_errors=True)
    profile.mkdir(parents=True)
    (profile / "user.js").write_text(
        f'user_pref("marionette.enabled", true);\n'
        f'user_pref("marionette.port", {port});\n'
        'user_pref("zen.welcome-screen.seen", true);\n'
        'user_pref("browser.startup.page", 0);\n'
        'user_pref("astra.sidebar.collapsed-layout.enabled", false);\n'
        f'user_pref("zen.view.use-single-toolbar", {"true" if only_sidebar else "false"});\n'
        'user_pref("zen.view.sidebar-expanded", true);\n',
        encoding="utf-8",
    )

    proc = subprocess.Popen(
        [
            str(exe),
            "-no-remote",
            "-profile",
            str(profile),
            "-marionette",
            "-remote-allow-system-access",
            "-foreground",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    client = None
    meta: dict = {
        "layout": label,
        "onlySidebar": only_sidebar,
        "binary": str(exe),
        "steps": {},
    }
    saved: list[tuple[str, Path]] = []

    setup = SETUP.replace("%USE_SINGLE%", "true" if only_sidebar else "false")

    try:
        for _ in range(90):
            try:
                client = Marionette("127.0.0.1", port=port)
                client.start_session()
                break
            except Exception:
                time.sleep(1)
        if not client:
            raise SystemExit(f"Marionette failed to start for {label}")

        time.sleep(4)
        client.set_context(client.CONTEXT_CHROME)
        setup_result = client.execute_async_script(setup, script_timeout=120000)
        if setup_result.get("error"):
            raise SystemExit(json.dumps(setup_result, indent=2))
        meta["setup"] = setup_result
        if only_sidebar and setup_result.get("singleToolbar") != "true":
            raise SystemExit(
                f"Only Sidebar layout not active: {json.dumps(setup_result)}"
            )
        if not only_sidebar and setup_result.get("singleToolbar") == "true":
            raise SystemExit(
                f"Sidebar+Top Toolbar expected but got single-toolbar: {json.dumps(setup_result)}"
            )

        hwnd = None
        for _ in range(60):
            hwnd = find_main_hwnd(proc.pid)
            if hwnd:
                break
            time.sleep(0.5)
        if not hwnd:
            raise SystemExit(f"Could not find Astra main window for {label}")

        user32.SetForegroundWindow(hwnd)
        time.sleep(0.4)

        for name, script in STEP_SCRIPTS.items():
            step_meta = client.execute_async_script(script, script_timeout=120000)
            if step_meta.get("error"):
                raise SystemExit(json.dumps(step_meta, indent=2))
            meta["steps"][name] = step_meta
            user32.SetForegroundWindow(hwnd)
            time.sleep(0.35)
            img = capture_hwnd(hwnd)
            path = layout_out / f"{name}.png"
            img.save(path)
            saved.append((name.replace("-", " ").title(), path))
            print(f"saved {path} ({path.stat().st_size} bytes)", flush=True)

        side_by_side = layout_out / "compact-cycle-4up-native.png"
        stitch_four(saved, side_by_side, title_prefix=label.replace("-", " ").title())
        print(f"4-up -> {side_by_side}", flush=True)
        meta_path = layout_out / "compact-cycle-native-meta.json"
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        return meta
    finally:
        if client:
            try:
                client.delete_session()
            except Exception:
                pass
        proc.terminate()
        kill_astra()
        time.sleep(2)


def stitch_four(
    paths: list[tuple[str, Path]], out_path: Path, title_prefix: str = ""
) -> None:
    labels = [label for label, _ in paths]
    images = [Image.open(p) for _, p in paths]
    target_h = max(im.height for im in images)
    gap = 12
    label_h = 36
    scaled = []
    for im in images:
        if im.height != target_h:
            ratio = target_h / im.height
            scaled.append(im.resize((int(im.width * ratio), target_h), Image.Resampling.LANCZOS))
        else:
            scaled.append(im)
    total_w = sum(im.width for im in scaled) + gap * (len(scaled) - 1)
    canvas = Image.new("RGB", (total_w, target_h + label_h), (24, 24, 28))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("segoeui.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
    x = 0
    for label, im in zip(labels, scaled):
        canvas.paste(im, (x, label_h))
        prefix = f"{title_prefix} — " if title_prefix else ""
        draw.text((x + 4, 6), f"{prefix}{label}", fill=(230, 230, 235), font=font)
        x += im.width + gap
    canvas.save(out_path)


def main() -> int:
    kill_astra()
    exe = find_exe()
    print(f"Using binary: {exe}", flush=True)
    OUT.mkdir(parents=True, exist_ok=True)

    layouts = os.environ.get("LAYOUTS", "both").lower()
    run_only = layouts in ("both", "only", "only-sidebar", "1")
    run_multi = layouts in ("both", "multi", "sidebar-top-toolbar", "0")

    results = {}
    if run_multi:
        results["sidebar-top-toolbar"] = capture_layout("multi", False, exe)
    if run_only:
        results["only-sidebar"] = capture_layout("only", True, exe)

    summary_path = OUT / "compact-cycle-all-layouts.json"
    summary_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))

    for layout_result in results.values():
        step3 = layout_result.get("steps", {}).get("03-compact-on-hover-revealed", {})
        if layout_result.get("onlySidebar"):
            # Only Sidebar: compact lives in footer; strip may stay in sidebar toolbox.
            continue
        if not step3.get("compactInToolbar") or not step3.get("aiInToolbar"):
            print(
                "FAIL: Compact/AI not in top toolbar on hover reveal",
                file=sys.stderr,
            )
            return 1
        if step3.get("stripParent") not in ("nav-bar", None):
            print(
                f"FAIL: strip parked in {step3.get('stripParent')} instead of nav-bar",
                file=sys.stderr,
            )
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
