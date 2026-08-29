#!/usr/bin/env python3
"""Patch local Astra build + capture welcome + Boost Indic-font screenshots."""

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
BROWSER_JAR = ROOT / ".tmp-feature-verify" / "astra-run" / "browser" / "omni.ja"
OUT = ROOT / ".tmp-beta-polish" / "beta-build-shots"
PORT = 2895

BROWSER_PATCHES = {
    "modules/zen/boosts/ZenBoostsEditor.mjs": ROOT
    / "src/zen/boosts/ZenBoostsEditor.mjs",
    "modules/zen/boosts/ZenBoostStyles.sys.mjs": ROOT
    / "src/zen/boosts/ZenBoostStyles.sys.mjs",
    "chrome/browser/content/browser/zen-styles/zen-welcome.css": ROOT
    / "src/zen/welcome/zen-welcome.css",
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


def patch_jar(jar: Path, force: bool = False) -> None:
    marker = jar.with_suffix(".ja.patched-beta")
    if marker.exists() and not force:
        return
    backup = jar.with_suffix(".ja.bak-beta")
    if not backup.exists():
        shutil.copy2(jar, backup)
    replacements = {k: v.read_bytes() for k, v in BROWSER_PATCHES.items()}
    tmp = jar.with_suffix(".ja.betatmp")
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


def shot(client: Marionette, name: str) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    raw = client.execute_script(DRAW)
    path = OUT / f"{name}.png"
    path.write_bytes(base64.b64decode(raw))
    print("shot", path.name, path.stat().st_size, flush=True)
    return path


def capture_welcome(client: Marionette) -> list[dict]:
    records: list[dict] = []
    time.sleep(2)
    shot(client, "welcome-01-intro")
    records.append({"step": "intro", "file": "welcome-01-intro.png"})
    client.execute_script(
        "document.getElementById('zen-welcome-start-button')?.click();"
    )
    time.sleep(2)
    step_names = [
        "browser-choice",
        "ublock",
        "compact",
        "search",
    ]
    for i, step in enumerate(step_names, start=2):
        hero = client.execute_script(
            """
            const hero = document.getElementById('zen-welcome-hero');
            const ids = [...(hero?.querySelectorAll('[data-l10n-id]') || [])]
              .map(el => el.getAttribute('data-l10n-id'));
            return ids || [];
            """
        )
        fname = f"welcome-{i:02d}-{step}"
        shot(client, fname)
        records.append({"step": step, "l10n": hero, "file": f"{fname}.png"})
        if step == "search":
            break
        client.execute_script(
            "document.querySelector('.zen-welcome-btn-skip')?.click();"
        )
        time.sleep(1.5)
    return records


def capture_boost_indic(client: Marionette) -> dict:
    client.set_context(client.CONTEXT_CHROME)
    client.execute_script(
        """
        const { gBrowser } = window;
        const tab = gBrowser.addTab('https://www.bbc.com/hindi', {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
        gBrowser.selectedTab = tab;
        """
    )
    time.sleep(6)
    client.set_context(client.CONTEXT_CONTENT)
    font_probe = client.execute_script(
        """
        const body = document.body;
        if (!body) return { error: 'no body' };
        const before = getComputedStyle(body).fontFamily;
        return { before, sample: (body.innerText || '').slice(0, 120) };
        """
    )
    client.set_context(client.CONTEXT_CHROME)
    indic_fonts = client.execute_script(
        """
        const fe = Cc['@mozilla.org/gfx/fontenumerator;1'].createInstance(Ci.nsIFontEnumerator);
        const all = fe.EnumerateFonts(null, null);
        const targets = [
          'Nirmala UI', 'Mangal', 'Aparajita', 'Noto Sans Devanagari',
          'Noto Sans Tamil', 'Noto Sans Bengali'
        ];
        return { available: targets.filter(f => all.includes(f)), count: all.length };
        """
    )
    chosen = indic_fonts.get("available", ["Mangal", "Nirmala UI"])
    pick = None
    for candidate in ["Nirmala UI", "Mangal", "Aparajita", "Noto Sans Devanagari"]:
        if candidate in chosen:
            pick = candidate
            break
    if not pick and chosen:
        pick = chosen[0]
    if not pick:
        return {"error": "no indic fonts on system", "probe": font_probe, "indic_fonts": indic_fonts}

    client.execute_script(
        f"""
        const tab = gBrowser.selectedTab;
        const browser = tab.linkedBrowser;
        const domain = 'bbc.com';
        const {{ gZenBoostsManager }} = ChromeUtils.importESModule(
          'resource:///modules/zen/boosts/ZenBoostsManager.sys.mjs'
        );
        const boost = gZenBoostsManager.createNewBoost(domain);
        boost.boostEntry.boostData.fontFamily = {json.dumps(pick)};
        boost.boostEntry.boostData.changeWasMade = true;
        gZenBoostsManager.saveBoostToStore(boost);
        gZenBoostsManager.makeBoostActiveForDomain(domain, boost.id);
        browser.reload();
        """
    )
    time.sleep(5)
    client.set_context(client.CONTEXT_CONTENT)
    after = client.execute_script(
        """
        const el = document.querySelector('h1, h2, p, article, main') || document.body;
        const style = getComputedStyle(el);
        return {
          fontFamily: style.fontFamily,
          text: (el.innerText || '').trim().slice(0, 160),
        };
        """
    )
    client.set_context(client.CONTEXT_CHROME)
    shot(client, "boost-hindi-after-font")

    # Open boost editor to capture Indic font grid buttons.
    grid_info = client.execute_script(
        """
        const tab = gBrowser.selectedTab;
        const uri = tab.linkedBrowser.currentURI;
        const domain = 'bbc.com';
        const { gZenBoostsManager } = ChromeUtils.importESModule(
          'resource:///modules/zen/boosts/ZenBoostsManager.sys.mjs'
        );
        const boost = gZenBoostsManager.loadActiveBoostFromStore(domain);
        gZenBoostsManager.openBoostWindow(window, boost, uri);
        return new Promise(resolve => {
          setTimeout(() => {
            const win = Services.wm.getMostRecentWindow('zen-boost-editor');
            const grid = win?.document?.getElementById('zen-boost-font-grid');
            const buttons = [...(grid?.children || [])].map(btn => ({
              title: btn.title,
              preview: btn.textContent,
              font: btn.getAttribute('font-data'),
            }));
            resolve({ buttons, count: buttons.length });
          }, 1200);
        });
        """,
        script_timeout=8000,
    )
    editor_shot = client.execute_script(
        """
        const win = Services.wm.getMostRecentWindow('zen-boost-editor');
        if (!win) return null;
        const canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
        const w = win.innerWidth, h = win.innerHeight;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const flags = ctx.DRAWWINDOW_DRAW_CARET | ctx.DRAWWINDOW_DRAW_VIEW | ctx.DRAWWINDOW_USE_WIDGET_LAYERS;
        ctx.drawWindow(win, 0, 0, w, h, 'rgb(255,255,255)', flags);
        return canvas.toDataURL('image/png').split(',')[1];
        """
    )
    if editor_shot:
        path = OUT / "boost-font-grid-indic.png"
        path.write_bytes(base64.b64decode(editor_shot))
        print("shot", path.name, path.stat().st_size, flush=True)

    return {
        "picked_font": pick,
        "before": font_probe,
        "after": after,
        "indic_fonts": indic_fonts,
        "font_grid": grid_info,
    }


def main() -> None:
    if not EXE.exists():
        raise SystemExit(f"Missing build: {EXE}")
    patch_jar(BROWSER_JAR)
    report: dict = {"shots_dir": str(OUT), "welcome": [], "boost": {}}

    profile = ROOT / ".tmp-beta-polish" / "profile-welcome-boost"
    proc, client = launch(profile, ['user_pref("zen.welcome-screen.seen", false);'])
    try:
        report["welcome"] = capture_welcome(client)
    finally:
        stop(proc, client)

    profile2 = ROOT / ".tmp-beta-polish" / "profile-boost-hindi"
    proc2, client2 = launch(profile2, ['user_pref("zen.welcome-screen.seen", true);'])
    try:
        report["boost"] = capture_boost_indic(client2)
    finally:
        stop(proc2, client2)

    report_path = OUT / "report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("report", report_path, flush=True)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "boost-only":
        if not EXE.exists():
            raise SystemExit(f"Missing build: {EXE}")
        patch_jar(BROWSER_JAR)
        profile2 = ROOT / ".tmp-beta-polish" / "profile-boost-hindi"
        proc2, client2 = launch(profile2, ['user_pref("zen.welcome-screen.seen", true);'])
        try:
            result = capture_boost_indic(client2)
            report_path = OUT / "boost-report.json"
            report_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
            print(json.dumps(result, indent=2))
        finally:
            stop(proc2, client2)
    else:
        main()
