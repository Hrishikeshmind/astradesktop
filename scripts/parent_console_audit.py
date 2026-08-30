#!/usr/bin/env python3
"""Capture Browser Console (parent process) messages from a realistic Astra session.

Patches installed build with current dev sources, drives a normal startup flow via
Marionette, and records every nsIConsoleService message for triage.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

from marionette_driver.marionette import Marionette

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / ".tmp-beta-polish" / "astra-live-verify"
OUT = ROOT / ".tmp-beta-polish" / "console-audit"
PORT = int(os.environ.get("MARIONETTE_PORT", "2910"))
INSTALLED = Path(r"C:\Program Files\Astra Browser")

# omni.ja paths -> workspace source files (latest dev tree)
BROWSER_PATCHES: dict[str, Path] = {
    "chrome/browser/content/browser/zen-components/ZenMods.mjs": ROOT
    / "src/zen/mods/ZenMods.mjs",
    "chrome/browser/content/browser/ZenUIManager.mjs": ROOT
    / "src/zen/common/modules/ZenUIManager.mjs",
    "chrome/browser/content/browser/zen-components/ZenCompactMode.mjs": ROOT
    / "src/zen/compact-mode/ZenCompactMode.mjs",
    "chrome/browser/content/browser/preferences/zen-settings.js": ROOT
    / "src/browser/components/preferences/zen-settings.js",
    "chrome/browser/content/browser/zen-styles/astra-compact.css": ROOT
    / "src/zen/common/styles/astra-compact.css",
    "chrome/browser/content/browser/zen-styles/astra-sidebar.css": ROOT
    / "src/zen/common/styles/astra-sidebar.css",
    "chrome/browser/skin/classic/browser/preferences/zen-preferences.css": ROOT
    / "src/browser/themes/shared/preferences/zen-preferences.css",
    "modules/zen/boosts/ZenBoostHighlightsUI.mjs": ROOT
    / "src/zen/boosts/ZenBoostHighlightsUI.mjs",
    "modules/zen/boosts/ZenBoostHighlightsContent.sys.mjs": ROOT
    / "src/zen/boosts/ZenBoostHighlightsContent.sys.mjs",
    "modules/zen/boosts/ZenBoostHighlightsManager.sys.mjs": ROOT
    / "src/zen/boosts/ZenBoostHighlightsManager.sys.mjs",
    "modules/zen/boosts/ZenBoostsEditor.mjs": ROOT
    / "src/zen/boosts/ZenBoostsEditor.mjs",
    "modules/zen/boosts/ZenBoostStyles.sys.mjs": ROOT
    / "src/zen/boosts/ZenBoostStyles.sys.mjs",
    "chrome/browser/content/browser/zen-styles/zen-welcome.css": ROOT
    / "src/zen/welcome/zen-welcome.css",
    "chrome/browser/content/browser/parent/ext-browser.js": ROOT
    / ".tmp-beta-polish" / "patched-ext-browser.js",
}

EXT_BROWSER_PATCH = ROOT / "src/browser/components/extensions/parent/ext-browser-js.patch"

CONSOLE_PROBE = r"""
const done = arguments[arguments.length - 1];
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  const hits = [];
  const seen = new Set();
  const push = (level, text, meta = {}) => {
    const line = String(text || "").replace(/\s+/g, " ").trim();
    if (!line) return;
    const key = level + "|" + line.slice(0, 240);
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ level, message: line, ...meta });
  };

  const parseMsg = (msg) => {
    try {
      const err = msg.QueryInterface(Ci.nsIScriptError);
      const level =
        err.flags & Ci.nsIScriptError.errorFlag ? "error"
        : err.flags & Ci.nsIScriptError.warningFlag ? "warn"
        : err.flags & Ci.nsIScriptError.logFlag ? "log"
        : "info";
      push(level, err.errorMessage || err.message, {
        source: err.sourceName || null,
        line: err.lineNumber || 0,
        category: err.category || null,
      });
      return;
    } catch {}
    try {
      push("log", msg.message);
    } catch {}
  };

  for (const msg of Services.console.getMessageArray()) {
    parseMsg(msg);
  }

  const listener = {
    observe(message) {
      parseMsg(message);
    },
  };
  Services.console.registerListener(listener);

  const actions = [];
  const run = async (name, fn) => {
    const before = hits.length;
    try {
      await fn();
      actions.push({ name, ok: true, newMessages: hits.length - before });
    } catch (e) {
      actions.push({ name, ok: false, error: String(e), newMessages: hits.length - before });
    }
    await sleep(400);
  };

  await run("startup-settle", async () => {
    await sleep(2500);
  });

  await run("open-settings", async () => {
    const prefsWin = Services.ww.openWindow(
      win,
      "chrome://browser/content/preferences/preferences.xhtml",
      "_blank",
      "chrome,dialog=no,all",
      null
    );
    await sleep(2000);
    prefsWin.document.getElementById("category-general")?.click();
    await sleep(500);
    prefsWin.document.getElementById("category-zen-looks")?.click();
    await sleep(600);
    prefsWin.close();
  });

  await run("about-dialog", async () => {
    const aboutWin = Services.ww.openWindow(
      win,
      "chrome://browser/content/aboutDialog.xhtml",
      "About",
      "chrome,centerscreen,dialog",
      null
    );
    await sleep(1200);
    aboutWin?.close();
  });

  await run("browse-example", async () => {
    const tab = win.gBrowser.addTab("https://example.com/", {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
    win.gBrowser.selectedTab = tab;
    await sleep(2500);
  });

  await run("compact-mode-toggle", async () => {
    Services.prefs.setBoolPref("zen.view.use-single-toolbar", true);
    Services.prefs.setBoolPref("zen.view.sidebar-expanded", false);
    win.gZenVerticalTabsManager?._updateEvent();
    await sleep(900);
    Services.prefs.setBoolPref("zen.view.use-single-toolbar", false);
    Services.prefs.setBoolPref("zen.view.sidebar-expanded", true);
    win.gZenVerticalTabsManager?._updateEvent();
    await sleep(700);
  });

  await run("new-private-window", async () => {
    const pb = Services.ww.openWindow(
      win,
      "chrome://browser/content/browser.xhtml",
      "_blank",
      "chrome,all,dialog=no,private",
      null
    );
    await sleep(2000);
    pb?.close();
  });

  await run("app-hub-open", async () => {
    if (typeof win.gZenAppHub?.open === "function") {
      win.gZenAppHub.open();
      await sleep(1200);
      win.gZenAppHub?.close?.();
    } else if (win.document.getElementById("zen-app-hub-button")) {
      win.document.getElementById("zen-app-hub-button").click();
      await sleep(1200);
    }
  });

  Services.console.unregisterListener(listener);
  done({ hits, actions, total: hits.length });
})().catch(e => done({ error: String(e) }));
"""


def apply_ext_browser_patch(jar_path: Path, out_path: Path) -> None:
    """Extract ext-browser.js from omni.ja, apply ext-browser-js.patch, write out."""
    with zipfile.ZipFile(jar_path, "r") as zin:
        data = zin.read("chrome/browser/content/browser/parent/ext-browser.js")
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "ext-browser.js"
        src.write_bytes(data)
        patch_copy = Path(td) / "patch"
        # Normalize patch paths for git apply
        patch_text = EXT_BROWSER_PATCH.read_text(encoding="utf-8")
        patch_text = patch_text.replace(
            "a/browser/components/extensions/parent/ext-browser.js",
            "a/ext-browser.js",
        ).replace(
            "b/browser/components/extensions/parent/ext-browser.js",
            "b/ext-browser.js",
        )
        patch_copy.write_text(patch_text, encoding="utf-8")
        r = subprocess.run(
            ["git", "apply", "--check", str(patch_copy)],
            cwd=td,
            capture_output=True,
            text=True,
        )
        if r.returncode != 0:
            # Already patched in jar — use as-is
            out_path.write_bytes(data)
            return
        subprocess.run(
            ["git", "apply", str(patch_copy)],
            cwd=td,
            check=True,
        )
        out_path.write_bytes(src.read_bytes())


def ensure_patched_build() -> Path:
    exe = INSTALLED / "astra.exe"
    if not exe.is_file():
        raise SystemExit(f"Installed Astra not found: {exe}")
    if not LIVE.is_dir() or not (LIVE / "astra.exe").is_file():
        print("Copying install to", LIVE, flush=True)
        if LIVE.exists():
            shutil.rmtree(LIVE, ignore_errors=True)
        shutil.copytree(INSTALLED, LIVE)

    patched_ext = ROOT / ".tmp-beta-polish" / "patched-ext-browser.js"
    patched_ext.parent.mkdir(parents=True, exist_ok=True)
    jar = LIVE / "browser" / "omni.ja"
    apply_ext_browser_patch(jar, patched_ext)

    replacements = {k: v.read_bytes() for k, v in BROWSER_PATCHES.items() if v.exists()}
    tmp = jar.with_suffix(".ja.consoletmp")
    with zipfile.ZipFile(jar, "r") as zin, zipfile.ZipFile(
        tmp, "w", compression=zipfile.ZIP_STORED
    ) as zout:
        for info in zin.infolist():
            data = replacements.get(info.filename, zin.read(info.filename))
            ni = zipfile.ZipInfo(filename=info.filename, date_time=info.date_time)
            ni.compress_type = zipfile.ZIP_STORED
            ni.external_attr = info.external_attr
            zout.writestr(ni, data)
    tmp.replace(jar)
    print(f"Patched {len(replacements)} files into omni.ja", flush=True)
    return LIVE / "astra.exe"


def launch(exe: Path, profile: Path) -> tuple[subprocess.Popen, Marionette]:
    profile.mkdir(parents=True, exist_ok=True)
    (profile / "user.js").write_text(
        "\n".join(
            [
                'user_pref("marionette.enabled", true);',
                f'user_pref("marionette.port", {PORT});',
                'user_pref("zen.welcome-screen.seen", true);',
                'user_pref("browser.startup.page", 0);',
                'user_pref("zen.urlbar.open-on-startup", false);',
                'user_pref("astra.apphub.enabled", true);',
                'user_pref("browser.shell.checkDefaultBrowser", false);',
            ]
        )
        + "\n",
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
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
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
    return proc, client


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    exe = ensure_patched_build()
    profile = OUT / "profile"
    if profile.exists():
        shutil.rmtree(profile, ignore_errors=True)

    proc, client = launch(exe, profile)
    stderr_lines: list[str] = []
    try:
        time.sleep(3)
        client.set_context(client.CONTEXT_CHROME)
        result = client.execute_async_script(CONSOLE_PROBE, script_timeout=120000)
        # Drain any process stdout (MOZ_LOG etc.)
        try:
            proc.stdout.flush()  # type: ignore[union-attr]
        except Exception:
            pass
        time.sleep(0.5)
        if proc.stdout:
            while proc.stdout.readable():
                chunk = proc.stdout.read(4096)
                if not chunk:
                    break
                stderr_lines.extend(chunk.splitlines())
    finally:
        try:
            client.delete_session()
        except Exception:
            pass
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()

    report = {
        "console": result,
        "process_stdout": stderr_lines[:200],
        "exe": str(exe),
    }
    out_path = OUT / "parent_console_report.json"
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"total": result.get("total"), "actions": result.get("actions")}, indent=2))
    if result.get("error"):
        print("PROBE ERROR:", result["error"], file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
