#!/usr/bin/env python3
"""Lightweight settings + layout probes for pre-launch QA."""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from pathlib import Path

from marionette_driver.marionette import Marionette

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / ".tmp-feature-verify" / "astra-run" / "astra.exe"
PORT = 2898
OUT = ROOT / ".tmp-beta-polish" / "prelaunch-qa" / "probes.json"

PREFS_JS = """
const issues = [];
let prefWin = null;
try {
  window.openPreferences();
} catch (e) {
  return { error: String(e), issues: [{ id: "prefs-open-fail", severity: "critical" }] };
}
for (const w of Services.wm.getEnumerator(null)) {
  try {
    if (String(w.location.href).includes("preferences.xhtml")) { prefWin = w; break; }
  } catch (e) {}
}
if (!prefWin) return { error: "no pref window", issues: [{ id: "prefs-no-window", severity: "critical" }] };

const doc = prefWin.document;
const nav = [...doc.querySelectorAll("[id^='category-']")].map(b => ({
  id: b.id,
  view: b.getAttribute("view"),
  label: (b.textContent || "").trim().slice(0, 60),
}));
const panes = [];
for (const btn of nav) {
  try {
    doc.getElementById(btn.id)?.click();
    const pane = doc.getElementById(btn.view);
    panes.push({
      id: btn.id,
      view: btn.view,
      found: !!pane,
      hidden: pane?.hidden,
      checkboxes: pane?.querySelectorAll("checkbox").length || 0,
      buttons: pane?.querySelectorAll("button").length || 0,
    });
  } catch (e) {
    issues.push({ id: "prefs-nav", pane: btn.view, error: String(e) });
  }
}
prefWin.close();
return { issues, nav, panes };
"""

LAYOUT_JS = """
const issues = [];
const matrix = [];
const P = Services.prefs;
for (const c of [
  { theme: "light", compact: false, right: false },
  { theme: "dark", compact: false, right: false },
  { theme: "light", compact: true, right: false },
  { theme: "dark", compact: true, right: true },
]) {
  P.setBoolPref("zen.view.sidebar-expanded", !c.compact);
  P.setBoolPref("zen.view.use-single-toolbar", c.compact);
  P.setBoolPref("zen.tabs.vertical.right-side", c.right);
  P.setIntPref("browser.theme.content-theme", c.theme === "dark" ? 0 : 1);
  P.setIntPref("browser.theme.toolbar-theme", c.theme === "dark" ? 0 : 1);
  gZenVerticalTabsManager?._updateEvent();
  const snap = {
    combo: c,
    htmlExpanded: document.documentElement.getAttribute("zen-sidebar-expanded"),
    toolboxExpanded: document.getElementById("navigator-toolbox")?.getAttribute("zen-sidebar-expanded"),
    tabExpanded: document.getElementById("tabbrowser-tabs")?.hasAttribute("expanded"),
  };
  matrix.push(snap);
  if (c.compact && snap.htmlExpanded === "true") {
    issues.push({ id: "compact-not-collapsed", combo: c, snap });
  }
}
return { issues, matrix };
"""

ABOUT_JS = """
return new Promise((done) => {
  try {
    const win = Services.wm.getMostRecentWindow("navigator:browser");
    const dlg = Services.ww.openWindow(
      win, "chrome://browser/content/aboutDialog.xhtml", "About", "chrome,centerscreen,dialog", null
    );
    if (!dlg) {
      done({ ok: false, error: "dialog missing" });
      return;
    }
    setTimeout(() => {
      try {
        const text = dlg.document.body?.textContent?.replace(/\\s+/g, " ").trim().slice(0, 300);
        const hasAstra = /astra/i.test(text || "");
        const links = [...dlg.document.querySelectorAll("a, label[is=text-link]")].map(el => ({
          text: (el.textContent||"").trim().slice(0,40),
          href: el.getAttribute("href"),
        }));
        dlg.close();
        done({ ok: true, hasAstra, text, links });
      } catch (e) {
        done({ ok: false, error: String(e) });
      }
    }, 1200);
  } catch (e) {
    done({ ok: false, error: String(e) });
  }
});
"""


def run(extra_prefs: list[str], js: str) -> dict:
    profile = ROOT / ".tmp-beta-polish" / "profile-probes"
    if profile.exists():
        shutil.rmtree(profile, ignore_errors=True)
    profile.mkdir(parents=True)
    lines = [
        'user_pref("marionette.enabled", true);',
        f'user_pref("marionette.port", {PORT});',
        'user_pref("zen.welcome-screen.seen", true);',
        *extra_prefs,
    ]
    (profile / "user.js").write_text("\n".join(lines) + "\n", encoding="utf-8")
    proc = subprocess.Popen(
        [str(EXE), "-no-remote", "-profile", str(profile), "-marionette", "-remote-allow-system-access"],
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
        return {"error": "marionette timeout"}
    time.sleep(4)
    client.set_context(client.CONTEXT_CHROME)
    try:
        return client.execute_script(js, script_timeout=60000)
    finally:
        client.delete_session()
        proc.terminate()
        subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-Process astra,plugin-container -ErrorAction SilentlyContinue | Stop-Process -Force"],
            check=False, capture_output=True,
        )


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "prefs": run([], PREFS_JS),
        "layout": run([], LAYOUT_JS),
        "about": run([], ABOUT_JS),
    }
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
