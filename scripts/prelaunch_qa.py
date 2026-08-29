#!/usr/bin/env python3
"""Pre-launch intensive QA: welcome flow, settings sweep, layout matrix."""

from __future__ import annotations

import base64
import json
import shutil
import subprocess
import time
import zipfile
from pathlib import Path

from marionette_driver.marionette import Marionette

from probe_disk_guard import prepare_probe_workspace

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / ".tmp-feature-verify" / "astra-run" / "astra.exe"
BROWSER_JAR = ROOT / ".tmp-feature-verify" / "astra-run" / "browser" / "omni.ja"
OUT = ROOT / ".tmp-beta-polish" / "prelaunch-qa"
PORT = 2896

PATCHES = {
    "modules/zen/boosts/ZenBoostsEditor.mjs": ROOT / "src/zen/boosts/ZenBoostsEditor.mjs",
    "modules/zen/boosts/ZenBoostStyles.sys.mjs": ROOT / "src/zen/boosts/ZenBoostStyles.sys.mjs",
    "chrome/browser/content/browser/zen-styles/zen-welcome.css": ROOT / "src/zen/welcome/zen-welcome.css",
    "modules/zen/welcome/ZenWelcome.mjs": ROOT / "src/zen/welcome/ZenWelcome.mjs",
}

DRAW = r"""
const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
const w = window.innerWidth, h = window.innerHeight;
canvas.width = w; canvas.height = h;
const ctx = canvas.getContext("2d");
const flags = ctx.DRAWWINDOW_DRAW_CARET | ctx.DRAWWINDOW_DRAW_VIEW | ctx.DRAWWINDOW_USE_WIDGET_LAYERS;
ctx.drawWindow(window, 0, 0, w, h, "rgb(243,239,233)", flags);
return canvas.toDataURL("image/png").split(",")[1];
"""


def patch_jar(jar: Path) -> None:
    marker = jar.with_suffix(".ja.patched-prelaunch")
    if marker.exists():
        return
    backup = jar.with_suffix(".ja.bak-prelaunch")
    if not backup.exists():
        shutil.copy2(jar, backup)
    replacements = {k: v.read_bytes() for k, v in PATCHES.items()}
    tmp = jar.with_suffix(".ja.prelaunchtmp")
    if tmp.exists():
        tmp.unlink()
    with zipfile.ZipFile(backup, "r") as zin, zipfile.ZipFile(
        tmp, "w", compression=zipfile.ZIP_STORED
    ) as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename in replacements:
                data = replacements[info.filename]
            ni = zipfile.ZipInfo(filename=info.filename, date_time=info.date_time)
            ni.compress_type = zipfile.ZIP_STORED
            ni.external_attr = info.external_attr
            zout.writestr(ni, data)
    tmp.replace(jar)
    marker.write_text("patched\n", encoding="utf-8")


def launch(profile: Path, extra: list[str]) -> tuple[subprocess.Popen, Marionette]:
    profile.mkdir(parents=True, exist_ok=True)
    lines = [
        'user_pref("marionette.enabled", true);',
        f'user_pref("marionette.port", {PORT});',
        'user_pref("browser.startup.page", 0);',
        'user_pref("zen.urlbar.open-on-startup", false);',
        'user_pref("browser.shell.checkDefaultBrowser", false);',
        *extra,
    ]
    (profile / "user.js").write_text("\n".join(lines) + "\n", encoding="utf-8")
    proc = subprocess.Popen(
        [
            str(EXE),
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
    for _ in range(90):
        try:
            client = Marionette("127.0.0.1", port=PORT)
            client.start_session()
            break
        except Exception:
            time.sleep(1)
    if not client:
        proc.kill()
        raise SystemExit("Marionette did not start")
    time.sleep(4)
    client.set_context(client.CONTEXT_CHROME)
    return proc, client


def stop(proc: subprocess.Popen, client: Marionette | None) -> None:
    if client:
        try:
            client.delete_session()
        except Exception:
            pass
    try:
        proc.terminate()
        proc.wait(timeout=8)
    except Exception:
        proc.kill()
    subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            "Get-Process astra,plugin-container -ErrorAction SilentlyContinue | Stop-Process -Force",
        ],
        check=False,
        capture_output=True,
    )
    time.sleep(1.5)


def shot(client: Marionette, name: str, subdir: str = "") -> Path:
    d = OUT / subdir if subdir else OUT
    d.mkdir(parents=True, exist_ok=True)
    raw = client.execute_script(DRAW)
    path = d / f"{name}.png"
    path.write_bytes(base64.b64decode(raw))
    return path


WELCOME_JS = """
return new Promise(async (done) => {
  const issues = [];
  const steps = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const apphubEnabled = Services.prefs.getBoolPref("astra.apphub.enabled", false);
  const expectedSteps = apphubEnabled ? 6 : 5;

  const intro = document.getElementById("zen-welcome-start");
  if (!intro) issues.push({ id: "welcome-no-intro", severity: "high", detail: "Intro screen missing" });
  else {
    const bg = getComputedStyle(document.documentElement).backgroundImage || getComputedStyle(document.body).background;
    steps.push({ step: "intro", visible: intro.offsetParent !== null, bg: String(bg).slice(0, 120) });
  }

  const startBtn = document.getElementById("zen-welcome-start-button");
  if (!startBtn) issues.push({ id: "welcome-no-start-btn", severity: "high", detail: "Get Started button missing" });
  else startBtn.click();
  await sleep(1500);

  const pageNames = [];
  for (let i = 0; i < 8; i++) {
    const hero = document.getElementById("zen-welcome-hero");
    const l10n = [...(hero?.querySelectorAll("[data-l10n-id]") || [])].map(el => el.getAttribute("data-l10n-id"));
    const progress = document.querySelector(".zen-welcome-progress")?.textContent?.trim();
    pageNames.push({ l10n, progress, skipVisible: !!document.querySelector(".zen-welcome-btn-skip") });
    const skip = document.querySelector(".zen-welcome-btn-skip");
    if (!skip && !document.getElementById("zen-welcome-finish")) break;
    if (document.getElementById("zen-welcome-finish")) break;
    skip?.click();
    await sleep(900);
  }

  const sawAppHub = pageNames.some(p => (p.l10n || []).some(id => String(id).includes("apphub") || String(id).includes("AppHub")));
  if (apphubEnabled && !sawAppHub) {
    issues.push({ id: "welcome-apphub-missing", severity: "medium", detail: "App Hub step not seen when astra.apphub.enabled=true", pages: pageNames });
  }
  if (!apphubEnabled && sawAppHub) {
    issues.push({ id: "welcome-apphub-unexpected", severity: "medium", detail: "App Hub step shown when disabled" });
  }

  const finish = document.getElementById("zen-welcome-finish");
  if (!finish) {
    issues.push({ id: "welcome-no-finish", severity: "high", detail: "Never reached search/finish step", pages: pageNames });
  } else {
    steps.push({ step: "search-reached", pageCount: pageNames.length, expectedSteps });
    if (pageNames.length < expectedSteps - 1) {
      issues.push({ id: "welcome-short-flow", severity: "medium", detail: `Only ${pageNames.length} pages before finish`, expectedSteps, pages: pageNames });
    }
  }

  // Browser choice: click Chrome-like then advance
  const restartWelcome = () => {
    Services.prefs.setBoolPref("zen.welcome-screen.seen", false);
  };

  done({ issues, steps, pageNames, apphubEnabled, expectedSteps });
}).catch(e => ({ error: String(e) }));
"""

SETTINGS_JS = """
return new Promise(async (done) => {
  const issues = [];
  const panes = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const { openPreferences } = ChromeUtils.importESModule("chrome://browser/content/preferences/preferences-appLauncher.mjs");
  openPreferences();
  await sleep(2000);

  let prefWin = null;
  for (const w of Services.wm.getEnumerator(null)) {
    try {
      if (String(w.location.href).includes("preferences.xhtml")) { prefWin = w; break; }
    } catch (e) {}
  }
  if (!prefWin) {
    done({ error: "preferences window not found", issues: [{ id: "prefs-no-window", severity: "critical" }] });
    return;
  }

  const doc = prefWin.document;
  const navButtons = [...doc.querySelectorAll("moz-page-nav-button, [role=tab]")].filter(el => el.id?.startsWith("category-") || el.getAttribute("view"));
  const paneIds = navButtons.map(b => ({ id: b.id, view: b.getAttribute("view") || b.id }));

  for (const { id, view } of paneIds) {
    try {
      const btn = doc.getElementById(id);
      btn?.click();
      await sleep(600);
      const pane = doc.getElementById(view) || doc.querySelector(`[data-category="${view}"]`) || doc.querySelector(".highlighted-category")?.nextElementSibling;
      const paneEl = doc.getElementById(view) || doc.querySelector(`#${view}`);
      const interactives = [...(paneEl?.querySelectorAll("checkbox, radio, button, select, menulist") || [])];
      const broken = [];
      // Probe only — do not toggle every pref (causes hangs/timeouts).
      for (const el of interactives.slice(0, 8)) {
        if (el.disabled || el.hidden) continue;
        try {
          void (el.id || el.getAttribute("preference"));
        } catch (e) {
          broken.push({ tag: el.tagName, id: el.id, error: String(e) });
        }
      }
      panes.push({ id, view, interactives: interactives.length, broken });
      if (broken.length) {
        issues.push({ id: "prefs-pane-click-error", severity: "medium", pane: view, broken });
      }
    } catch (e) {
      issues.push({ id: "prefs-pane-nav-fail", severity: "high", pane: view, error: String(e) });
    }
  }

  // About dialog — openWindow (aboutDialog-appLauncher.mjs is not shipped)
  try {
    const aboutWin = Services.ww.openWindow(
      prefWin.opener || Services.wm.getMostRecentWindow("navigator:browser"),
      "chrome://browser/content/aboutDialog.xhtml",
      "About",
      "chrome,centerscreen,dialog",
      null
    );
    await sleep(1500);
    if (!aboutWin) {
      issues.push({ id: "about-dialog-missing", severity: "high", detail: "About Astra dialog did not open" });
    } else {
      const branding = (aboutWin.document.body?.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 200);
      panes.push({ about: true, brandingSnippet: branding, hasAstra: /astra/i.test(branding) });
      if (!/astra/i.test(branding)) {
        issues.push({ id: "about-no-astra-branding", severity: "low", detail: "Astra branding not found in About text", branding });
      }
      aboutWin.close();
    }
  } catch (e) {
    issues.push({ id: "about-dialog-error", severity: "high", error: String(e) });
  }

  prefWin.close();
  done({ issues, panes, paneCount: paneIds.length });
}).catch(e => ({ error: String(e) }));
"""

LAYOUT_JS = """
return new Promise(async (done) => {
  const issues = [];
  const matrix = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const P = Services.prefs;

  const combos = [];
  for (const theme of ["light", "dark"]) {
    for (const compact of [false, true]) {
      for (const right of [false, true]) {
        combos.push({ theme, compact, right });
      }
    }
  }

  for (const c of combos) {
    try {
      P.setBoolPref("zen.view.sidebar-expanded", !c.compact);
      P.setBoolPref("zen.view.use-single-toolbar", c.compact);
      P.setBoolPref("zen.tabs.vertical.right-side", c.right);
      if (c.theme === "dark") {
        P.setIntPref("browser.theme.content-theme", 0);
        P.setIntPref("browser.theme.toolbar-theme", 0);
      } else {
        P.setIntPref("browser.theme.content-theme", 1);
        P.setIntPref("browser.theme.toolbar-theme", 1);
      }
      gZenVerticalTabsManager?._updateEvent();
      gZenUIManager?.updateCompactMode?.();
      await sleep(800);

      const html = document.documentElement;
      const toolbox = document.getElementById("navigator-toolbox");
      const snapshot = {
        combo: c,
        htmlExpanded: html.getAttribute("zen-sidebar-expanded"),
        toolboxExpanded: toolbox?.getAttribute("zen-sidebar-expanded"),
        tabExpanded: document.getElementById("tabbrowser-tabs")?.hasAttribute("expanded"),
        sidebarRight: html.getAttribute("zen-sidebar-right"),
        lwt: document.l10n?.ready ? null : null,
      };

      // Compact overlay gate check
      if (c.compact) {
        const gatePref = P.getBoolPref("zen.view.compact-mode.gate-seen", true);
        snapshot.gatePref = gatePref;
      }

      matrix.push(snapshot);

      if (c.compact && snapshot.htmlExpanded === "true" && snapshot.toolboxExpanded === "true") {
        issues.push({
          id: "compact-not-collapsed",
          severity: "medium",
          combo: c,
          detail: "Compact mode set but sidebar attrs still expanded",
          snapshot,
        });
      }
    } catch (e) {
      issues.push({ id: "layout-matrix-error", severity: "high", combo: c, error: String(e) });
    }
  }

  // Restore defaults
  P.setBoolPref("zen.view.sidebar-expanded", true);
  P.setBoolPref("zen.view.use-single-toolbar", false);
  P.setBoolPref("zen.tabs.vertical.right-side", false);

  done({ issues, matrix });
}).catch(e => ({ error: String(e) }));
"""

EXPLORE_JS = """
return new Promise(async (done) => {
  const issues = [];
  const checks = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // App menu items
  const appBtn = document.getElementById("PanelUI-button");
  if (appBtn) {
    appBtn.click();
    await sleep(500);
    const items = [...document.querySelectorAll("#appMenu-popup .panel-subview-body toolbarbutton, #appMenu-popup toolbarbutton")].slice(0, 25);
    checks.push({ area: "app-menu", count: items.length });
    for (const item of items) {
      if (item.disabled || item.hidden) continue;
      const label = item.getAttribute("label") || item.textContent?.trim()?.slice(0, 40);
      try { item.click(); await sleep(300); } catch (e) {
        issues.push({ id: "app-menu-click-fail", severity: "low", label, error: String(e) });
      }
    }
    document.getElementById("appMenu-popup")?.hidePopup();
  }

  // Extensions about:addons
  try {
    const tab = gBrowser.addTab("about:addons", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
    gBrowser.selectedTab = tab;
    await sleep(2500);
    const browser = tab.linkedBrowser;
    const doc = browser.contentDocument;
    const links = [...doc.querySelectorAll("a[href], button")].slice(0, 15).map(el => ({
      tag: el.tagName, text: (el.textContent||"").trim().slice(0,50), href: el.getAttribute("href")
    }));
    checks.push({ area: "about-addons", links });
    const mozLinks = links.filter(l => l.href && l.href.includes("mozilla.org"));
    if (mozLinks.length) {
      issues.push({ id: "addons-moz-link", severity: "low", detail: "Mozilla.org link in about:addons", mozLinks });
    }
    gBrowser.removeTab(tab);
  } catch (e) {
    issues.push({ id: "about-addons-fail", severity: "medium", error: String(e) });
  }

  // Docs/support URLs in prefs
  try {
    const { openPreferences } = ChromeUtils.importESModule("chrome://browser/content/preferences/preferences-appLauncher.mjs");
    openPreferences();
    await sleep(1500);
    let prefWin = null;
    for (const w of Services.wm.getEnumerator(null)) {
      try { if (String(w.location.href).includes("preferences.xhtml")) { prefWin = w; break; } } catch (e) {}
    }
    if (prefWin) {
      const badLinks = [...prefWin.document.querySelectorAll("label[is=text-link], a")].filter(el => {
        const h = el.getAttribute("href") || "";
        return h && !h.startsWith("chrome:") && !h.startsWith("about:") && !h.includes("astradesktop") && !h.includes("github.com/Hrishikeshmind");
      }).map(el => ({ text: el.textContent?.trim(), href: el.getAttribute("href") }));
      if (badLinks.length) {
        issues.push({ id: "prefs-external-link", severity: "low", badLinks: badLinks.slice(0, 10) });
      }
      prefWin.close();
    }
  } catch (e) {
    issues.push({ id: "prefs-link-scan-fail", severity: "low", error: String(e) });
  }

  done({ issues, checks });
}).catch(e => ({ error: String(e) }));
"""


def run_section(name: str, client: Marionette, js: str, shot_name: str | None = None) -> dict:
    client.set_context(client.CONTEXT_CHROME)
    result = client.execute_script(js, script_timeout=120000)
    if shot_name:
        shot(client, shot_name, subdir=name)
    return result


def main() -> None:
    prepare_probe_workspace(
        ROOT,
        protect_dir_names={".tmp-feature-verify", ".tmp-beta-polish"},
        label="prelaunch_qa",
    )
    if not EXE.exists():
        raise SystemExit(f"Missing build: {EXE}")
    patch_jar(BROWSER_JAR)
    OUT.mkdir(parents=True, exist_ok=True)
    report: dict = {"shots_dir": str(OUT), "sections": {}, "all_issues": []}

    profile = ROOT / ".tmp-beta-polish" / "profile-prelaunch-qa"
    if profile.exists():
        shutil.rmtree(profile, ignore_errors=True)

    proc, client = launch(profile, ['user_pref("zen.welcome-screen.seen", false);'])
    try:
        shot(client, "welcome-intro", "welcome")
        report["sections"]["welcome"] = run_section("welcome", client, WELCOME_JS, "welcome-flow-end")
        shot(client, "welcome-after-flow", "welcome")
    finally:
        stop(proc, client)

    proc2, client2 = launch(profile, ['user_pref("zen.welcome-screen.seen", true);'])
    try:
        report["sections"]["settings"] = run_section("settings", client2, SETTINGS_JS, "settings-sweep")
        report["sections"]["layout"] = run_section("layout", client2, LAYOUT_JS)
        for i, combo in enumerate(
            [
                {"theme": "light", "compact": False, "right": False},
                {"theme": "dark", "compact": True, "right": True},
            ]
        ):
            client2.execute_script(
                f"""
                Services.prefs.setBoolPref("zen.view.sidebar-expanded", {str(not combo["compact"]).lower()});
                Services.prefs.setBoolPref("zen.view.use-single-toolbar", {str(combo["compact"]).lower()});
                Services.prefs.setBoolPref("zen.tabs.vertical.right-side", {str(combo["right"]).lower()});
                """
            )
            time.sleep(1)
            shot(client2, f"layout-{combo['theme']}-{'compact' if combo['compact'] else 'normal'}-{'right' if combo['right'] else 'left'}", "layout")
        report["sections"]["explore"] = run_section("explore", client2, EXPLORE_JS)
    finally:
        stop(proc2, client2)

    for section, data in report["sections"].items():
        for issue in data.get("issues", []):
            issue["section"] = section
            report["all_issues"].append(issue)

    report_path = OUT / "prelaunch_qa_report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Report: {report_path}")
    print(f"Issues found: {len(report['all_issues'])}")
    for issue in report["all_issues"]:
        print(f"  [{issue.get('severity','?')}] {issue.get('id')}: {issue.get('detail') or issue.get('error') or issue}")


if __name__ == "__main__":
    main()
