#!/usr/bin/env python3
"""Pre-launch QA against patched feature-verify build."""

from __future__ import annotations

import base64
import json
import shutil
import subprocess
import time
import zipfile
from pathlib import Path

from marionette_driver.marionette import Marionette

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / ".tmp-feature-verify" / "astra-run" / "astra.exe"
JAR = ROOT / ".tmp-feature-verify" / "astra-run" / "browser" / "omni.ja"
OUT = ROOT / ".tmp-beta-polish" / "prelaunch-qa"
PORT = 2899

PATCHES = {
    "modules/zen/welcome/ZenWelcome.mjs": ROOT / "src/zen/welcome/ZenWelcome.mjs",
    "chrome/browser/content/browser/zen-styles/zen-welcome.css": ROOT / "src/zen/welcome/zen-welcome.css",
    "modules/zen/boosts/ZenBoostsEditor.mjs": ROOT / "src/zen/boosts/ZenBoostsEditor.mjs",
}


def patch_jar() -> None:
    backup = JAR.with_suffix(".ja.bak-prelaunch2")
    if not backup.exists():
        shutil.copy2(JAR, backup)
    replacements = {k: v.read_bytes() for k, v in PATCHES.items()}
    tmp = JAR.with_suffix(".ja.prelaunch2tmp")
    with zipfile.ZipFile(backup, "r") as zin, zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_STORED) as zout:
        for info in zin.infolist():
            data = replacements.get(info.filename, zin.read(info.filename))
            ni = zipfile.ZipInfo(filename=info.filename, date_time=info.date_time)
            ni.compress_type = zipfile.ZIP_STORED
            ni.external_attr = info.external_attr
            zout.writestr(ni, data)
    tmp.replace(JAR)


PROBE = r"""
const done = arguments[arguments.length - 1];
(async () => {
  const issues = [];
  const data = {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow("navigator:browser");

  // --- About dialog via openWindow (not appLauncher) ---
  try {
    const aboutWin = Services.ww.openWindow(
      win, "chrome://browser/content/aboutDialog.xhtml", "About", "chrome,centerscreen,dialog", null
    );
    await sleep(1200);
    if (!aboutWin) {
      issues.push({ id: "about-not-opened", severity: "high" });
    } else {
      await aboutWin.document.l10n?.ready;
      await sleep(800);
      const txt = aboutWin.document.body?.textContent?.replace(/\s+/g, " ").trim().slice(0, 250);
      const versionLabel = aboutWin.document.getElementById("version")?.textContent?.trim();
      const trademark = aboutWin.document.getElementById("trademark")?.textContent?.trim();
      const hasAstra = /astra/i.test(txt || "") || /astra/i.test(versionLabel || "") || /astra/i.test(trademark || "");
      data.about = { text: txt || trademark || versionLabel, hasAstra, versionLabel, trademark };
      if (!hasAstra) issues.push({ id: "about-no-astra-branding", severity: "medium", text: txt, versionLabel, trademark });
      aboutWin.close();
    }
  } catch (e) {
    issues.push({ id: "about-open-error", severity: "high", error: String(e) });
  }

  // --- Settings panes ---
  try {
    const prefsWin = Services.ww.openWindow(
      win, "chrome://browser/content/preferences/preferences.xhtml", "_blank", "chrome,dialog=no,all", null
    );
    await sleep(2500);
    const doc = prefsWin.document;
    const nav = [...doc.querySelectorAll("[id^='category-']")];
    data.panes = [];
    for (const btn of nav) {
      btn.click();
      await sleep(400);
      const view = btn.getAttribute("view");
      const pane = doc.getElementById(view);
      const brokenLinks = [...(pane?.querySelectorAll('label[is="text-link"], a[href]') || [])]
        .filter(el => {
          const h = el.getAttribute("href") || "";
          return h.startsWith("http") && !h.includes("astradesktop") && !h.includes("github.com/Hrishikeshmind");
        })
        .map(el => ({ text: el.textContent?.trim().slice(0,50), href: el.getAttribute("href") }));
      data.panes.push({
        id: btn.id, view, label: btn.textContent?.trim().slice(0,40),
        checkboxes: pane?.querySelectorAll("checkbox").length || 0,
        badLinks: brokenLinks,
      });
      if (brokenLinks.length) {
        issues.push({ id: "prefs-moz-link", severity: "low", pane: view, badLinks: brokenLinks.slice(0,3) });
      }
    }
    const layoutList = doc.getElementById("zenLayoutList");
    data.layouts = layoutList ? [...layoutList.children].map(el => ({
      layout: el.getAttribute("layout"), selected: el.classList.contains("selected"), hidden: el.hidden,
    })) : null;
    const looksBtn = doc.getElementById("category-zen-looks");
    if (looksBtn) {
      looksBtn.click();
      await sleep(600);
      const looksPane = doc.getElementById("paneZenLooks");
      const list = doc.getElementById("zenLayoutList");
      data.layouts = list ? [...list.children].map(el => ({
        layout: el.getAttribute("layout"), selected: el.classList.contains("selected"), hidden: el.hidden,
      })) : null;
      const collapsed = list?.querySelector('[layout="collapsed"]');
      data.collapsedTileHidden = collapsed ? collapsed.hidden : null;
      if (collapsed && !collapsed.hidden) {
        issues.push({ id: "collapsed-layout-visible", severity: "medium", detail: "Collapsed layout tile should be hidden when pref gate is off" });
      }
    }
    prefsWin.close();
  } catch (e) {
    issues.push({ id: "prefs-error", severity: "high", error: String(e) });
  }

  // --- Layout matrix ---
  const P = Services.prefs;
  data.matrix = [];
  for (const c of [
    { name: "light-normal-left", compact: false, right: false, dark: false },
    { name: "dark-normal-right", compact: false, right: true, dark: true },
    { name: "light-compact-left", compact: true, right: false, dark: false },
    { name: "dark-compact-right", compact: true, right: true, dark: true },
  ]) {
    P.setBoolPref("zen.view.sidebar-expanded", !c.compact);
    P.setBoolPref("zen.view.use-single-toolbar", c.compact);
    P.setBoolPref("zen.tabs.vertical.right-side", c.right);
    P.setIntPref("browser.theme.content-theme", c.dark ? 0 : 1);
    P.setIntPref("browser.theme.toolbar-theme", c.dark ? 0 : 1);
    gZenVerticalTabsManager?._updateEvent();
    await sleep(700);
    data.matrix.push({
      ...c,
      htmlExpanded: document.documentElement.getAttribute("zen-sidebar-expanded"),
      toolboxExpanded: document.getElementById("navigator-toolbox")?.getAttribute("zen-sidebar-expanded"),
      tabExpanded: document.getElementById("tabbrowser-tabs")?.hasAttribute("expanded"),
    });
  }

  // --- Welcome visible state (already shown at startup if pref false) ---
  data.welcome = {
    seenPref: P.getBoolPref("zen.welcome-screen.seen", true),
    overlayPresent: !!document.getElementById("zen-welcome-screen"),
  };

  done({ issues, data });
})().catch(e => done({ error: String(e) }));
"""


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    patch_jar()
    profile = ROOT / ".tmp-beta-polish" / "profile-prelaunch-final"
    if profile.exists():
        shutil.rmtree(profile, ignore_errors=True)
    profile.mkdir(parents=True)
    (profile / "user.js").write_text(
        f'user_pref("marionette.enabled", true);\nuser_pref("marionette.port", {PORT});\n'
        'user_pref("zen.welcome-screen.seen", true);\nuser_pref("astra.apphub.enabled", true);\n',
        encoding="utf-8",
    )
    proc = subprocess.Popen(
        [str(EXE), "-no-remote", "-profile", str(profile), "-marionette", "-remote-allow-system-access"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
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
        raise SystemExit("no marionette")
    time.sleep(4)
    client.set_context(client.CONTEXT_CHROME)
    result = client.execute_async_script(PROBE, script_timeout=120000)
    report_path = OUT / "final_report.json"
    report_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    client.delete_session()
    proc.terminate()


if __name__ == "__main__":
    main()
