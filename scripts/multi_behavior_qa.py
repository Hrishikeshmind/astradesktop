#!/usr/bin/env python3
"""Five distinct real-user behavior patterns for pre-launch regression detection.

Report-only: writes combined findings JSON; does not apply fixes.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path

from marionette_driver.marionette import Marionette

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / ".tmp-beta-polish" / "astra-live-verify"
OUT = ROOT / ".tmp-beta-polish" / "multi-behavior-qa"
PORT = int(os.environ.get("MARIONETTE_PORT", "2911"))
INSTALLED = Path(r"C:\Program Files\Astra Browser")

BEHAVIORS: list[dict] = [
    {
        "id": "heavy_tab_switcher",
        "name": "Heavy tab switcher (15 tabs, rapid Ctrl+Tab)",
        "prefs": ['user_pref("zen.welcome-screen.seen", true);'],
        "script": r"""
const done = arguments[arguments.length - 1];
(async () => {
  const issues = [];
  const data = { tabsOpened: 0, switches: 0 };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  const urls = [
    "https://example.com/", "https://www.wikipedia.org/",
    "https://news.ycombinator.com/", "https://github.com/",
    "https://developer.mozilla.org/", "https://www.bbc.com/",
    "https://www.reddit.com/", "https://stackoverflow.com/",
    "https://www.google.com/", "https://www.amazon.in/",
    "https://www.flipkart.com/", "https://timesofindia.indiatimes.com/",
    "https://www.irctc.co.in/", "https://www.nseindia.com/",
    "https://www.moneycontrol.com/",
  ];
  for (const u of urls) {
    try {
      const t = win.gBrowser.addTab(u, {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
      data.tabsOpened++;
      await sleep(350);
    } catch (e) {
      issues.push({ id: "tab-open-fail", url: u, error: String(e) });
    }
  }
  const tabs = [...win.gBrowser.tabs];
  for (let i = 0; i < 20; i++) {
    const tab = tabs[i % tabs.length];
    if (tab) {
      win.gBrowser.selectedTab = tab;
      data.switches++;
      await sleep(120);
    }
  }
  const sel = win.gBrowser.selectedBrowser;
  data.selectedUrl = sel?.currentURI?.spec?.slice(0, 80);
  data.tabCount = win.gBrowser.tabs.length;
  const toolbox = win.document.getElementById("navigator-toolbox");
  data.toolboxVisible = toolbox ? win.getComputedStyle(toolbox).visibility : null;
  done({ issues, data });
})().catch(e => done({ error: String(e), issues: [{ id: "probe-crash", error: String(e) }] }));
""",
    },
    {
        "id": "compact_mode_only",
        "name": "Compact-mode-only user (hover reveal, urlbar focus)",
        "prefs": [
            'user_pref("zen.welcome-screen.seen", true);',
            'user_pref("zen.view.use-single-toolbar", true);',
            'user_pref("zen.view.sidebar-expanded", false);',
        ],
        "script": r"""
const done = arguments[arguments.length - 1];
(async () => {
  const issues = [];
  const data = {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  const P = Services.prefs;
  P.setBoolPref("zen.view.use-single-toolbar", true);
  P.setBoolPref("zen.view.sidebar-expanded", false);
  win.gZenVerticalTabsManager?._updateEvent();
  await sleep(1200);
  const urlbar = win.document.getElementById("urlbar");
  const sidebar = win.document.getElementById("zen-sidebar");
  data.compactAttrs = {
    singleToolbar: P.getBoolPref("zen.view.use-single-toolbar"),
    sidebarExpanded: P.getBoolPref("zen.view.sidebar-expanded"),
    htmlZenExpanded: win.document.documentElement.getAttribute("zen-sidebar-expanded"),
  };
  const hit = (x, y) => {
    const el = win.document.elementFromPoint(x, y);
    return el ? { id: el.id, tag: el.localName, cls: String(el.className).slice(0, 60) } : null;
  };
  data.urlbarHitBefore = hit(
    urlbar ? urlbar.getBoundingClientRect().x + 40 : 400,
    urlbar ? urlbar.getBoundingClientRect().y + 10 : 40
  );
  if (urlbar) {
    urlbar.focus();
    await sleep(300);
    data.urlbarFocused = win.document.activeElement?.id === "urlbar-input" || urlbar.matches(":focus-within");
    const pe = win.getComputedStyle(urlbar).pointerEvents;
    if (pe === "none") {
      issues.push({ id: "urlbar-pointer-events-none", severity: "high", detail: "Urlbar not clickable in compact mode" });
    }
  }
  if (sidebar) {
    const sbPe = win.getComputedStyle(sidebar).pointerEvents;
    data.sidebarPointerEvents = sbPe;
  }
  done({ issues, data });
})().catch(e => done({ error: String(e), issues: [{ id: "probe-crash", error: String(e) }] }));
""",
    },
    {
        "id": "keyboard_only",
        "name": "Keyboard-navigation-only user (shortcuts, no mouse)",
        "prefs": ['user_pref("zen.welcome-screen.seen", true);'],
        "script": r"""
const done = arguments[arguments.length - 1];
(async () => {
  const issues = [];
  const data = { shortcuts: [] };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  const before = win.gBrowser.tabs.length;
  // Ctrl+T new tab
  const evt = new win.KeyboardEvent("keydown", { key: "t", code: "KeyT", ctrlKey: true, bubbles: true });
  win.document.dispatchEvent(evt);
  await sleep(800);
  data.shortcuts.push({ action: "ctrl-t", tabDelta: win.gBrowser.tabs.length - before });
  if (win.gBrowser.tabs.length <= before) {
    issues.push({ id: "ctrl-t-no-new-tab", severity: "medium" });
  }
  // Ctrl+L focus urlbar
  const evt2 = new win.KeyboardEvent("keydown", { key: "l", code: "KeyL", ctrlKey: true, bubbles: true });
  win.document.dispatchEvent(evt2);
  await sleep(400);
  const urlbar = win.document.getElementById("urlbar");
  data.urlbarFocusAfterCtrlL = urlbar?.matches(":focus-within") || false;
  // Ctrl+Shift+A addons (should open without error)
  try {
    const evt3 = new win.KeyboardEvent("keydown", { key: "A", code: "KeyA", ctrlKey: true, shiftKey: true, bubbles: true });
    win.document.dispatchEvent(evt3);
    await sleep(1000);
    const addons = Services.wm.getMostRecentWindow("AddonManager");
    data.addonsOpened = !!addons;
    addons?.close();
  } catch (e) {
    issues.push({ id: "addons-shortcut-error", severity: "low", error: String(e) });
  }
  done({ issues, data });
})().catch(e => done({ error: String(e), issues: [{ id: "probe-crash", error: String(e) }] }));
""",
    },
    {
        "id": "extension_heavy",
        "name": "Extension-heavy user (uBlock preinstalled, addons page, content scripts)",
        "prefs": [
            'user_pref("zen.welcome-screen.seen", true);',
            'user_pref("extensions.ui.lastCategory", "extension");',
        ],
        "script": r"""
const done = arguments[arguments.length - 1];
(async () => {
  const issues = [];
  const data = {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  const addons = Cc["@mozilla.org/addons/integration;1"]
    .getService(Ci.nsIObserver)
    .QueryInterface(Ci.nsISupports);
  // Open about:addons
  const tab = win.gBrowser.addTab("about:addons", {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  });
  win.gBrowser.selectedTab = tab;
  await sleep(2500);
  const doc = tab.linkedBrowser.contentDocument;
  const txt = doc?.body?.innerText?.slice(0, 500) || "";
  data.addonsSnippet = txt.replace(/\s+/g, " ").slice(0, 200);
  if (/zen browser/i.test(txt) && !/astra/i.test(txt)) {
    issues.push({ id: "addons-zen-branding", severity: "medium", detail: "about:addons shows Zen branding" });
  }
  const ublock = [...(doc?.querySelectorAll("[name], .name") || [])].find(
    el => /ublock/i.test(el.textContent || "")
  );
  data.ublockListed = !!ublock;
  // Browse ad-heavy page
  const tab2 = win.gBrowser.addTab("https://www.ndtv.com/", {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  });
  win.gBrowser.selectedTab = tab2;
  await sleep(4000);
  data.ndtvTitle = tab2.linkedBrowser.contentTitle?.slice(0, 80);
  done({ issues, data });
})().catch(e => done({ error: String(e), issues: [{ id: "probe-crash", error: String(e) }] }));
""",
    },
    {
        "id": "hindi_regional",
        "name": "Hindi/regional-language browsing user",
        "prefs": [
            'user_pref("zen.welcome-screen.seen", true);',
            'user_pref("intl.accept_languages", "hi,en-US,en");',
        ],
        "script": r"""
const done = arguments[arguments.length - 1];
(async () => {
  const issues = [];
  const data = {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  const urls = [
    "https://www.bbc.com/hindi",
    "https://www.aajtak.in/",
    "https://hindi.news18.com/",
  ];
  for (const u of urls) {
    const tab = win.gBrowser.addTab(u, {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
    win.gBrowser.selectedTab = tab;
    await sleep(3500);
    const bc = tab.linkedBrowser;
    const bodyFont = await bc.contentWindow.wrappedJSObject
      ? null
      : null;
    let fontFamily = null;
    try {
      fontFamily = bc.contentDocument?.defaultView
        ?.getComputedStyle(bc.contentDocument.body)
        ?.fontFamily?.slice(0, 120);
    } catch {}
    data[u] = {
      title: bc.contentTitle?.slice(0, 60),
      fontFamily,
      hasDevanagari: /[\u0900-\u097F]/.test(bc.contentDocument?.body?.innerText?.slice(0, 500) || ""),
    };
    if (!fontFamily || /^-apple-system|Segoe UI/i.test(fontFamily) && !/Nirmala|Noto|Mukta|Lohit/i.test(fontFamily)) {
      issues.push({
        id: "indic-font-fallback",
        severity: "low",
        url: u,
        fontFamily,
        detail: "Page may not be using Indic Boost font stack",
      });
    }
  }
  done({ issues, data });
})().catch(e => done({ error: String(e), issues: [{ id: "probe-crash", error: String(e) }] }));
""",
    },
]


def ensure_exe() -> Path:
    exe = LIVE / "astra.exe"
    if not exe.is_file():
        if not (INSTALLED / "astra.exe").is_file():
            raise SystemExit("No Astra binary found")
        shutil.copytree(INSTALLED, LIVE)
    return exe


def run_behavior(exe: Path, behavior: dict, index: int) -> dict:
    profile = OUT / f"profile-{behavior['id']}"
    if profile.exists():
        shutil.rmtree(profile, ignore_errors=True)
    profile.mkdir(parents=True)
    lines = [
        'user_pref("marionette.enabled", true);',
        f'user_pref("marionette.port", {PORT});',
        'user_pref("browser.startup.page", 0);',
        'user_pref("zen.urlbar.open-on-startup", false);',
        'user_pref("browser.shell.checkDefaultBrowser", false);',
        *behavior.get("prefs", []),
    ]
    (profile / "user.js").write_text("\n".join(lines) + "\n", encoding="utf-8")
    proc = subprocess.Popen(
        [
            str(exe),
            "-no-remote",
            "-profile",
            str(profile),
            "-marionette",
            "-remote-allow-system-access",
        ],
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
        return {"id": behavior["id"], "name": behavior["name"], "error": "marionette-timeout", "issues": []}
    try:
        time.sleep(2)
        client.set_context(client.CONTEXT_CHROME)
        result = client.execute_async_script(behavior["script"], script_timeout=180000)
        return {
            "id": behavior["id"],
            "name": behavior["name"],
            "issues": result.get("issues", []),
            "data": result.get("data"),
            "probeError": result.get("error"),
        }
    finally:
        try:
            client.delete_session()
        except Exception:
            pass
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        time.sleep(2)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    exe = ensure_exe()
    results = []
    for i, b in enumerate(BEHAVIORS):
        print(f"[{i+1}/5] {b['name']}...", flush=True)
        results.append(run_behavior(exe, b, i))
    report = {"behaviors": results, "summary": {
        "totalIssues": sum(len(r.get("issues") or []) for r in results),
        "behaviorsWithIssues": [r["id"] for r in results if r.get("issues")],
    }}
    out_path = OUT / "report.json"
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()
