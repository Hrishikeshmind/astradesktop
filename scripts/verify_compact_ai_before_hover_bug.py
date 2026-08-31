#!/usr/bin/env python3
"""Targeted probe: stale panel lock when AI opens before Compact Mode."""

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
OUT = ROOT / ".tmp-beta-polish" / "compact-ai-before-hover"
PORT = int(os.environ.get("MARIONETTE_PORT", "2903"))

PROBE = r"""
const done = arguments[arguments.length - 1];
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const P = Services.prefs;
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  const doc = win.document;
  const cm = gZenCompactModeManager;
  const TOKEN = "viewGenaiChatSidebar";

  const snap = label => {
    const toolbox = doc.getElementById("navigator-toolbox");
    const sidebarHit = doc.getElementById("zen-compact-hover-sidebar-edge");
    const toolbarHit = doc.getElementById("zen-compact-hover-toolbar-edge");
    const sc = window.SidebarController;
    const sidebarBox = doc.getElementById("sidebar-box");
    return {
      label,
      singleToolbar: doc.documentElement.getAttribute("zen-single-toolbar"),
      hasSetSingleToolbar: gZenVerticalTabsManager._hasSetSingleToolbar,
      compactMode: doc.documentElement.getAttribute("zen-compact-mode"),
      aiOpen: !!(sc?.isOpen && sc.currentID === TOKEN),
      sidebarCommand: sidebarBox?.getAttribute("sidebarcommand"),
      panelLocked: cm.isPanelLocked?.(),
      panelLockTokens: cm._panelLockTokens ? [...cm._panelLockTokens] : null,
      canHideToolbar: cm.canHideToolbar,
      usesUnified: cm.usesUnifiedCompactChrome,
      hitSidebarHidden: sidebarHit?.hasAttribute("hidden"),
      hitToolbarHidden: toolbarHit?.hasAttribute("hidden"),
      toolboxHover: toolbox?.hasAttribute("zen-has-hover"),
    };
  };

  const hoverSidebar = async () => {
    const hit = doc.getElementById("zen-compact-hover-sidebar-edge");
    hit?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await sleep(200);
    return snap("after-sidebar-hit");
  };

  const reset = async () => {
    if (cm.preference) {
      cm.preference = false;
      await sleep(1200);
    }
    cm._clearAllPanelLocks?.();
    try {
      if (SidebarController?.isOpen) SidebarController.hide();
    } catch (_) {}
    await sleep(400);
  };

  const setLayout = async single => {
    P.setBoolPref("zen.view.use-single-toolbar", single);
    P.setBoolPref("zen.view.sidebar-expanded", true);
    P.setBoolPref("zen.view.compact.hide-toolbar", true);
    P.setBoolPref("zen.view.compact.hide-tabbar", true);
    gZenVerticalTabsManager._updateEvent();
    await sleep(1000);
  };

  const openAiReal = async () => {
    const btn = doc.getElementById("astra-ai-sidebar-toolbarbutton");
    if (btn) {
      btn.doCommand?.();
      await sleep(900);
      return { method: "toolbarbutton", snap: snap("after-ai-btn") };
    }
    try {
      SidebarController.show(TOKEN);
      await sleep(900);
      return { method: "SidebarController.show", snap: snap("after-ai-show") };
    } catch (e) {
      return { method: "failed", error: String(e), snap: snap("after-ai-fail") };
    }
  };

  const runCase = async (layoutName, singleToolbar) => {
    await reset();
    await setLayout(singleToolbar);
    const tab = win.gBrowser.addTrustedTab("about:newtab", { inBackground: false });
    win.gBrowser.selectedTab = tab;
    await sleep(500);

    const out = { layout: layoutName, steps: {} };

    // Working baseline
    cm.preference = true;
    await sleep(1500);
    cm._syncEdgeHitTargets();
    out.steps.baseline = {
      state: snap("baseline"),
      hover: await hoverSidebar(),
    };
    await reset();
    await setLayout(singleToolbar);
    win.gBrowser.addTrustedTab("about:newtab", { inBackground: false });
    await sleep(500);

    // Path A: real AI toggle
    out.steps.realAi = await openAiReal();
    out.steps.afterAi = snap("after-ai");
    cm.preference = true;
    await sleep(1500);
    cm._syncEdgeHitTargets();
    out.steps.afterCompactRealAi = snap("after-compact-real-ai");
    out.steps.hoverRealAi = await hoverSidebar();
    await reset();
    await setLayout(singleToolbar);
    win.gBrowser.addTrustedTab("about:newtab", { inBackground: false });
    await sleep(500);

    // Path B: simulate lockForPanel (exact code path when AI opens before compact)
    cm.lockForPanel(TOKEN);
    out.steps.afterLockBeforeCompact = snap("after-lock-before-compact");
    cm.preference = true;
    await sleep(1500);
    cm._syncEdgeHitTargets();
    out.steps.afterCompactStaleLock = snap("after-compact-stale-lock");
    out.steps.hoverStaleLock = await hoverSidebar();

    return out;
  };

  const onlySidebar = await runCase("only-sidebar", true);
  const sidebarTop = await runCase("sidebar-top-toolbar", false);
  done({ onlySidebar, sidebarTop });
})().catch(e => done({ error: String(e), stack: e.stack }));
"""


def find_exe() -> Path | None:
    env = os.environ.get("ASTRA_EXE")
    if env and Path(env).is_file():
        return Path(env)
    for c in [
        Path(r"C:\Program Files\Astra Browser\astra.exe"),
        ROOT / "engine" / "obj-x86_64-pc-windows-msvc" / "dist" / "bin" / "astra.exe",
    ]:
        if c.is_file():
            return c
    return None


def main() -> int:
    exe = find_exe()
    if not exe:
        print("No astra.exe", file=sys.stderr)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    profile = OUT / "profile-v2"
    if profile.exists():
        shutil.rmtree(profile, ignore_errors=True)
    profile.mkdir()
    (profile / "user.js").write_text(
        f'user_pref("marionette.enabled", true);\nuser_pref("marionette.port", {PORT});\n'
        'user_pref("zen.welcome-screen.seen", true);\n',
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
        return 1

    time.sleep(4)
    client.set_context(client.CONTEXT_CHROME)
    result = client.execute_async_script(PROBE, script_timeout=240000)
    (OUT / "report-v2.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    client.delete_session()
    proc.terminate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
