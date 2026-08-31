#!/usr/bin/env python3
"""Marionette verification for launch-blocking regressions (build 147+).

Patches vertical-tabs.css into the local dev omni.ja, then runs against
.tmp-content-scheme/astra-run/astra.exe (or ASTRA_EXE if set).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from marionette_driver.marionette import Marionette

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".tmp-beta-polish" / "launch-regression-verify"
PORT = int(os.environ.get("MARIONETTE_PORT", "2901"))

PROBE = r"""
const done = arguments[arguments.length - 1];
(async () => {
  const issues = [];
  const data = {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const P = Services.prefs;
  const win = Services.wm.getMostRecentWindow("navigator:browser");

  const hitTest = (x, y) => {
    const el = win.document.elementFromPoint(x, y);
    return el
      ? {
          id: el.id || null,
          localName: el.localName,
          className: String(el.className || "").slice(0, 80),
        }
      : null;
  };

  const cssSnap = (sel) => {
    const el = win.document.querySelector(sel);
    if (!el) return null;
    const cs = win.getComputedStyle(el);
    return {
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      pointerEvents: cs.pointerEvents,
      zIndex: cs.zIndex,
      top: cs.top,
      left: cs.left,
      width: cs.width,
      height: cs.height,
      attrs: [...el.attributes].map(a => `${a.name}=${a.value}`).slice(0, 12),
    };
  };

  // --- Bug 1: collapsed layout tile hidden when pref gate off ---
  try {
    P.setBoolPref("astra.sidebar.collapsed-layout.enabled", false);
    const prefsWin = Services.ww.openWindow(
      win,
      "chrome://browser/content/preferences/preferences.xhtml#paneZenLooks",
      "_blank",
      "chrome,dialog=no,all",
      null
    );
    await sleep(3000);
    await prefsWin.document.l10n?.ready;
    prefsWin.document.location.hash = "paneZenLooks";
    await sleep(800);
    const doc = prefsWin.document;
    const cs = el => prefsWin.getComputedStyle(el);
    doc.getElementById("category-zen-looks")?.click();
    await sleep(800);
    const list = doc.getElementById("zenLayoutList");
    const tiles = list
      ? [...list.children].map(el => ({
          layout: el.getAttribute("layout"),
          hidden: el.hidden,
          display: cs(el).display,
          pointerEvents: cs(el).pointerEvents,
        }))
      : [];
    data.bug1 = {
      tiles,
      gatePref: P.getBoolPref("astra.sidebar.collapsed-layout.enabled", false),
      listFound: !!list,
    };
    if (!list) {
      issues.push({
        id: "bug1-layout-list-missing",
        severity: "high",
        detail: "zenLayoutList not found in Settings after navigating Look and Feel",
      });
    }
    const collapsed = list?.querySelector('[layout="collapsed"]');
    if (collapsed && cs(collapsed).display !== "none") {
      issues.push({
        id: "bug1-collapsed-tile-visible",
        severity: "high",
        detail: "Collapsed layout tile must not render when pref gate is off",
        tile: tiles.find(t => t.layout === "collapsed"),
      });
    }
    prefsWin.close();
  } catch (e) {
    issues.push({ id: "bug1-error", severity: "high", error: String(e) });
  }

  // Sidebar+Top Toolbar baseline
  P.setBoolPref("zen.view.use-single-toolbar", false);
  P.setBoolPref("zen.view.sidebar-expanded", true);
  P.setBoolPref("zen.view.compact.hide-toolbar", true);
  P.setBoolPref("zen.view.compact.hide-tabbar", true);
  gZenVerticalTabsManager?._updateEvent();
  await sleep(600);

  const navTarget = win.document.getElementById("nav-bar-customization-target");
  const navBar = win.document.getElementById("nav-bar");
  const compact = win.document.getElementById("zen-toggle-compact-mode");
  const ai = win.document.getElementById("astra-ai-sidebar-button");
  data.preCompact = {
    compactParent: compact?.parentElement?.id || null,
    aiParent: ai?.parentElement?.id || null,
    compactInNav: navTarget?.contains(compact),
    compactInToolbar: navBar?.contains(compact),
  };

  // --- Enable Compact Mode ---
  if (!gZenCompactModeManager.preference) {
    gZenCompactModeManager.preference = true;
  }
  await sleep(1200);
  await sleep(300);

  const toolbox = win.document.getElementById("navigator-toolbox");
  data.postCompact = {
    compactMode: document.documentElement.getAttribute("zen-compact-mode"),
    compactParent: compact?.parentElement?.id || null,
    aiParent: ai?.parentElement?.id || null,
    compactInNav: navTarget?.contains(compact),
    aiInNav: navTarget?.contains(ai),
    compactInToolbar: navBar?.contains(compact),
    aiInToolbar: navBar?.contains(ai),
    stripParent: win.document.getElementById("zen-sidebar-top-buttons")?.parentElement?.id || null,
    toolboxHover: toolbox?.hasAttribute("zen-has-hover"),
    titlebar: cssSnap("#titlebar"),
    topButtons: cssSnap("#zen-sidebar-top-buttons"),
    toolbarWrapper: cssSnap("#zen-appcontent-navbar-wrapper"),
    urlbar: cssSnap("#urlbar"),
  };

  // Bug 3: Compact + AI stay on the top toolbar (parked strip on #nav-bar).
  if (!navBar?.contains(compact) || !navBar?.contains(ai)) {
    issues.push({
      id: "bug3-controls-not-in-nav-bar",
      severity: "high",
      detail: "Compact/AI must remain in top toolbar (#nav-bar) in Sidebar+TopToolbar layout",
      postCompact: data.postCompact,
    });
  }

  // Bug 2: ghosting — top-buttons strip should not overlap titlebar/tabs before hover
  const tbRect = win.document
    .getElementById("zen-sidebar-top-buttons")
    ?.getBoundingClientRect();
  const tabsRect = win.document
    .getElementById("tabbrowser-tabs")
    ?.getBoundingClientRect();
  if (tbRect && tabsRect && !toolbox?.hasAttribute("zen-has-hover")) {
    const overlap = tbRect.bottom > tabsRect.top + 4 && tbRect.height > 80;
    data.bug2 = { tbRect: { h: tbRect.height, top: tbRect.top, bottom: tbRect.bottom }, tabsTop: tabsRect.top, overlap };
    if (overlap) {
      issues.push({
        id: "bug2-initial-ghost-overlap",
        severity: "high",
        detail: "Sidebar top-buttons overlap tab stack before first hover",
        bug2: data.bug2,
      });
    }
  }

  // Simulate first hover then re-snapshot
  const sidebarHit = win.document.getElementById("zen-compact-hover-sidebar-edge");
  sidebarHit?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  await sleep(200);
  data.afterHover = {
    toolboxHover: toolbox?.hasAttribute("zen-has-hover"),
    topButtons: cssSnap("#zen-sidebar-top-buttons"),
    titlebar: cssSnap("#titlebar"),
  };

  // Bug 4: urlbar hit-test at center of nav-bar strip (after toolbar reveal)
  const toolbar = win.document.getElementById("zen-appcontent-navbar-wrapper");
  toolbar?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  await sleep(200);
  gZenCompactModeManager._setCompactChromeRevealed?.(true);
  await sleep(200);

  const compactRect = compact?.getBoundingClientRect();
  const aiRect = ai?.getBoundingClientRect();
  const urlbarBox = win.document.getElementById("urlbar-container")?.getBoundingClientRect();
  const newTab = win.document.getElementById("tabs-newtab-button");
  const newTabRect = newTab?.getBoundingClientRect();
  const titlebarEl = win.document.getElementById("titlebar");
  const titlebarRect = titlebarEl?.getBoundingClientRect();
  data.bug3Layout = {
    compact: compactRect && {
      x: compactRect.x, y: compactRect.y, w: compactRect.width, h: compactRect.height,
    },
    ai: aiRect && { x: aiRect.x, y: aiRect.y, w: aiRect.width, h: aiRect.height },
    urlbar: urlbarBox && { x: urlbarBox.x, y: urlbarBox.y, w: urlbarBox.width, h: urlbarBox.height },
    newTab: newTabRect && { x: newTabRect.x, y: newTabRect.y, w: newTabRect.width, h: newTabRect.height },
    titlebar: titlebarRect && { x: titlebarRect.x, y: titlebarRect.y, w: titlebarRect.width, h: titlebarRect.height },
    stripParent: win.document.getElementById("zen-sidebar-top-buttons")?.parentElement?.id || null,
    navChildren: [...(navBar?.children || [])].map(el => el.id || el.localName),
  };
  if (compactRect && urlbarBox && compactRect.width > 0 && compactRect.left > urlbarBox.left + 8) {
    issues.push({
      id: "bug3-controls-not-left-of-urlbar",
      severity: "high",
      detail: "Compact toggle is to the right of the urlbar; Compact-OFF places it on the left",
      bug3Layout: data.bug3Layout,
    });
  }
  if (newTabRect && titlebarRect && newTabRect.top - titlebarRect.top > 24) {
    issues.push({
      id: "bug3-sidebar-top-gap",
      severity: "high",
      detail: "Empty gap above New Tab in compact sidebar (Compact-OFF has none)",
      bug3Layout: data.bug3Layout,
    });
  }

  const urlbar = win.document.getElementById("urlbar");
  const ubRect = urlbar?.getBoundingClientRect();
  if (ubRect) {
    const cx = Math.floor(ubRect.left + ubRect.width / 2);
    const cy = Math.floor(ubRect.top + ubRect.height / 2);
    const hit = hitTest(cx, cy);
    const urlbarPointerEvents = win.getComputedStyle(urlbar).pointerEvents;
    const wrapperHover = toolbar?.hasAttribute("zen-has-hover");
    data.bug4 = {
      urlbarPointerEvents,
      wrapperPointerEvents: win.getComputedStyle(toolbar).pointerEvents,
      wrapperHover,
      wrapperHeight: win.getComputedStyle(toolbar).height,
      hit,
      coords: { cx, cy },
    };
    if (wrapperHover && urlbarPointerEvents === "none") {
      issues.push({
        id: "bug4-urlbar-blocked",
        severity: "high",
        detail: "Urlbar pointer-events still none after compact toolbar reveal",
        bug4: data.bug4,
      });
    }
  }

  // Bug 3b: AI open should lock/retract compact sidebar
  try {
    gZenUIManager._toggleAiChatSidebar?.();
    await sleep(800);
    data.aiOpen = {
      sidebarHover: toolbox?.hasAttribute("zen-has-hover"),
      panelLock: gZenCompactModeManager.isPanelLocked?.(),
      revampOpen: document.documentElement.hasAttribute("astra-compact-revamp-panel-open"),
      sidebarCommand: document.getElementById("sidebar-box")?.getAttribute("sidebarcommand"),
    };
    if (
      data.aiOpen.sidebarCommand === "viewGenaiChatSidebar" ||
      (typeof SidebarController !== "undefined" && SidebarController.isOpen)
    ) {
      if (toolbox?.hasAttribute("zen-has-hover")) {
        issues.push({
          id: "bug3-ai-sidebar-stuck-hover",
          severity: "high",
          detail: "AI panel open but compact sidebar still has zen-has-hover",
        });
      }
      if (!gZenCompactModeManager.isPanelLocked?.()) {
        issues.push({
          id: "bug3-ai-no-panel-lock",
          severity: "high",
          detail: "AI panel open without compact panel lock",
        });
      }
    }
    gZenUIManager._toggleAiChatSidebar?.();
    gZenCompactModeManager?.unlockForPanel?.("viewGenaiChatSidebar");
  } catch (e) {
    issues.push({ id: "bug3-ai-toggle-error", severity: "medium", error: String(e) });
  }

  gZenCompactModeManager.preference = false;
  await sleep(1200);
  gZenVerticalTabsManager?._updateEvent();
  await sleep(500);

  const foot = win.document.getElementById("zen-sidebar-foot-buttons");
  const footCs = foot ? win.getComputedStyle(foot) : null;
  const dl = win.document.getElementById("downloads-button");
  const theme = win.document.getElementById("zen-toggle-window-scheme");
  const plus = win.document.getElementById("zen-create-new-button");
  const dlR = dl?.getBoundingClientRect();
  const themeR = theme?.getBoundingClientRect();
  const plusR = plus?.getBoundingClientRect();
  const footR = foot?.getBoundingClientRect();
  data.bug5Foot = {
    compactMode: document.documentElement.getAttribute("zen-compact-mode"),
    toolboxHover: toolbox?.hasAttribute("zen-has-hover"),
    compactChrome: document.documentElement.getAttribute("zen-compact-chrome-revealed"),
    justifyContent: footCs?.justifyContent,
    flexDirection: footCs?.flexDirection,
    footStyle: foot?.getAttribute("style") || "",
    downloadToTheme:
      dlR && themeR
        ? Math.round((themeR.left - (dlR.left + dlR.width)) * 10) / 10
        : null,
    downloadX: dlR ? Math.round(dlR.left * 10) / 10 : null,
    themeX: themeR ? Math.round(themeR.left * 10) / 10 : null,
    plusX: plusR ? Math.round(plusR.left * 10) / 10 : null,
    footWidth: footR ? Math.round(footR.width * 10) / 10 : null,
  };
  if (toolbox?.hasAttribute("zen-has-hover")) {
    issues.push({
      id: "bug5-foot-hover-stuck",
      severity: "high",
      detail: "zen-has-hover must clear on toolbox after compact is disabled",
      bug5Foot: data.bug5Foot,
    });
  }
  if (document.documentElement.hasAttribute("zen-compact-chrome-revealed")) {
    issues.push({
      id: "bug5-compact-chrome-stuck",
      severity: "high",
      detail: "zen-compact-chrome-revealed must clear after compact is disabled",
      bug5Foot: data.bug5Foot,
    });
  }
  // Sidebar+Top Toolbar: download left, theme centered, + right (4e2217c).
  const singleToolbar = document.documentElement.getAttribute("zen-single-toolbar") === "true";
  if (!singleToolbar && footR && dlR && themeR && plusR) {
    const footCenter = footR.left + footR.width / 2;
    const themeCenter = themeR.left + themeR.width / 2;
    const downloadAtLeft = dlR.left - footR.left <= 12;
    const plusAtRight = footR.right - (plusR.left + plusR.width) <= 12;
    const themeCentered = Math.abs(themeCenter - footCenter) <= 22;
    data.bug5Foot.edgeSpread = { downloadAtLeft, plusAtRight, themeCentered };
    if (!downloadAtLeft || !plusAtRight || !themeCentered) {
      issues.push({
        id: "bug5-foot-not-edge-spread",
        severity: "high",
        detail:
          "Sidebar+Top foot row must stay edge-to-edge after compact off (download left, theme center, + right)",
        bug5Foot: data.bug5Foot,
      });
    }
  }

  done({ issues, data });
})().catch(e => done({ error: String(e), stack: e.stack }));
"""


def patch_omni() -> None:
    import sys

    sys.path.insert(0, str(ROOT / "scripts"))
    import patch_dev_omni

    patch_dev_omni.patch_omni()


def find_exe() -> Path | None:
    env = os.environ.get("ASTRA_EXE")
    if env and Path(env).is_file():
        return Path(env)
    candidates = [
        ROOT / ".tmp-content-scheme" / "astra-run" / "astra.exe",
        ROOT / ".tmp-feature-verify" / "astra-run" / "astra.exe",
        ROOT / "engine" / "obj-x86_64-pc-windows-msvc" / "dist" / "bin" / "astra.exe",
        Path(r"C:\Program Files\Astra Browser\astra.exe"),
        Path(os.environ.get("LOCALAPPDATA", "")) / "Astra" / "astra.exe",
    ]
    for c in candidates:
        if c.is_file():
            return c
    return None


def main() -> int:
    sys.path.insert(0, str(ROOT / "scripts"))
    patch_omni()
    exe = find_exe()
    if not exe:
        print("ASTRA_EXE not set and no astra.exe found — skipping live Marionette run.", file=sys.stderr)
        print("Set ASTRA_EXE to the installed 1.19.9b binary and re-run.", file=sys.stderr)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    profile = OUT / "profile"
    if profile.exists():
        shutil.rmtree(profile, ignore_errors=True)
    profile.mkdir(parents=True)
    (profile / "user.js").write_text(
        f'user_pref("marionette.enabled", true);\nuser_pref("marionette.port", {PORT});\n'
        'user_pref("zen.welcome-screen.seen", true);\n'
        'user_pref("astra.sidebar.collapsed-layout.enabled", false);\n',
        encoding="utf-8",
    )

    proc = subprocess.Popen(
        [str(exe), "-no-remote", "-profile", str(profile), "-marionette", "-remote-allow-system-access"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    client = None
    for _ in range(90):
        try:
            client = Marionette("127.0.0.1", port=PORT)
            client.start_session()
            break
        except Exception:
            time.sleep(1)
    if not client:
        proc.kill()
        print("Marionette session failed to start", file=sys.stderr)
        return 1

    time.sleep(4)
    client.set_context(client.CONTEXT_CHROME)
    result = client.execute_async_script(PROBE, script_timeout=180000)
    report = OUT / "report.json"
    report.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    client.delete_session()
    proc.terminate()
    return 0 if not result.get("issues") else 1


if __name__ == "__main__":
    raise SystemExit(main())
