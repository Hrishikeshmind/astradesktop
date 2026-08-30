#!/usr/bin/env python3
"""Verify Boost highlighter with pref ON vs OFF (evidence for Part 2)."""

from __future__ import annotations

import json
import shutil
import subprocess
import time
import urllib.parse
from pathlib import Path

from marionette_driver.marionette import Marionette

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / ".tmp-beta-polish" / "astra-live-verify"
OUT = ROOT / ".tmp-beta-polish" / "highlighter-verify"
PORT = 2912

CHROME_SETUP = r"""
const done = arguments[arguments.length - 1];
(async () => {
  const prefOn = Services.prefs.getBoolPref("astra.boost.highlighter.enabled", false);
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  const menu = win.document.getElementById("zen-boost-highlight-menu");
  const badge = win.document.getElementById("zen-boost-highlight-badge");
  done({
    prefOn,
    shippedDefault: Services.prefs.getDefaultBranch("").getBoolPref("astra.boost.highlighter.enabled", true),
    menuPresent: !!menu,
    badgePresent: !!badge,
    uiInitialized: !!win.gZenBoostHighlightsUI,
  });
})().catch(e => done({ error: String(e) }));
"""

CHROME_HIGHLIGHT = r"""
const done = arguments[arguments.length - 1];
(async () => {
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  const browser = win.gBrowser.selectedBrowser;
  const actor = browser.browsingContext?.currentWindowGlobal?.getActor("ZenBoosts");
  if (!actor) {
    done({ ok: false, reason: "no-actor" });
    return;
  }
  const result = await actor.sendQuery("ZenBoost:HighlightSelection");
  await new Promise(r => setTimeout(r, 600));
  const mgr = ChromeUtils.importESModule(
    "resource:///modules/zen/boosts/ZenBoostHighlightsManager.sys.mjs"
  ).gZenBoostHighlightsManager;
  const url = browser.currentURI.spec;
  const savedCount = await mgr.countForURL(url);
  let markCount = 0;
  try {
    markCount = browser.contentDocument?.querySelectorAll("mark.zen-boost-highlight")?.length ?? 0;
  } catch {}
  const badge = win.document.getElementById("zen-boost-highlight-badge");
  done({
    result,
    markCount,
    savedCount,
    badgeHidden: badge?.hidden,
    badgeLabel: badge?.getAttribute("label"),
    url: url.slice(0, 120),
  });
})().catch(e => done({ error: String(e) }));
"""

SELECT_TEXT = r"""
const done = arguments[arguments.length - 1];
(() => {
  const p = document.querySelector("p");
  if (!p || !p.firstChild) {
    done({ ok: false, reason: "no-paragraph" });
    return;
  }
  const range = document.createRange();
  range.setStart(p.firstChild, 0);
  range.setEnd(p.firstChild, Math.min(20, p.textContent.length));
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  done({ ok: true, text: sel.toString() });
})().catch(e => done({ error: String(e) }));
"""


def run_case(pref_enabled: bool) -> dict:
    profile = OUT / ("profile-on" if pref_enabled else "profile-off")
    if profile.exists():
        shutil.rmtree(profile, ignore_errors=True)
    profile.mkdir(parents=True)
    pref_line = (
        'user_pref("astra.boost.highlighter.enabled", true);'
        if pref_enabled
        else 'user_pref("astra.boost.highlighter.enabled", false);'
    )
    (profile / "user.js").write_text(
        "\n".join(
            [
                'user_pref("marionette.enabled", true);',
                f'user_pref("marionette.port", {PORT});',
                'user_pref("zen.welcome-screen.seen", true);',
                'user_pref("browser.startup.page", 0);',
                pref_line,
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    exe = LIVE / "astra.exe"
    proc = subprocess.Popen(
        [str(exe), "-no-remote", "-profile", str(profile), "-marionette", "-remote-allow-system-access"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    client = None
    for _ in range(60):
        try:
            client = Marionette("127.0.0.1", port=PORT)
            client.start_session()
            break
        except Exception:
            time.sleep(1)
    if not client:
        proc.kill()
        return {"error": "timeout"}
    try:
        time.sleep(2)
        client.set_context(client.CONTEXT_CHROME)
        out = client.execute_async_script(CHROME_SETUP, script_timeout=30000)
        if pref_enabled:
            html = "<!DOCTYPE html><html><body><p>Hello Boost highlight test page for Astra</p></body></html>"
            client.set_context(client.CONTEXT_CONTENT)
            client.navigate(f"data:text/html,{urllib.parse.quote(html)}")
            time.sleep(1)
            client.set_context(client.CONTEXT_CONTENT)
            out["selection"] = client.execute_async_script(SELECT_TEXT, script_timeout=15000)
            client.set_context(client.CONTEXT_CHROME)
            out["highlight"] = client.execute_async_script(CHROME_HIGHLIGHT, script_timeout=30000)
        return out
    finally:
        client.delete_session()
        proc.terminate()
        time.sleep(2)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    report = {
        "prefOff": run_case(False),
        "prefOn": run_case(True),
        "yamlDefault": "false (astra.boost.highlighter.enabled in prefs/zen/view.yaml)",
    }
    (OUT / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
