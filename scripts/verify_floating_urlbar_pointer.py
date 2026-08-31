#!/usr/bin/env python3
"""Marionette: floating new-tab urlbar visibility + suggestion click hit-testing."""

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
OUT = ROOT / ".tmp-foot-spacing" / "floating-urlbar-pointer"
PORT = int(os.environ.get("MARIONETTE_PORT", "2857"))

PROBE = r"""
const done = arguments[arguments.length - 1];
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function probeEl(el) {
  if (!el) return { present: false };
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    present: true,
    id: el.id || null,
    tag: el.localName,
    class: el.className?.toString?.() || "",
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    pointerEvents: cs.pointerEvents,
    opacity: cs.opacity,
    visibility: cs.visibility,
    display: cs.display,
    zIndex: cs.zIndex,
  };
}

async function openNewTabOverlay() {
  while (gBrowser.tabs.length > 1) {
    gBrowser.removeTab(gBrowser.tabs[gBrowser.tabs.length - 1], { animate: false });
  }
  if (gURLBar?.hasAttribute("zen-newtab")) {
    gZenUIManager?.handleUrlbarClose?.(false, false);
    await sleep(300);
  }
  document.getElementById("cmd_newNavigatorTab")?.doCommand?.();
  await sleep(900);
}

async function runLayout(label, singleToolbar) {
  Services.prefs.setBoolPref("zen.view.use-single-toolbar", singleToolbar);
  Services.prefs.setBoolPref("zen.view.sidebar-expanded", true);
  gZenVerticalTabsManager?._updateEvent();
  await sleep(1000);
  await openNewTabOverlay();

  const urlbar = document.getElementById("urlbar");
  const container = document.getElementById("urlbar-container");
  const row = document.querySelector("#urlbar-results .urlbarView-row");
  const rowInner = row?.querySelector(".urlbarView-row-inner");
  const rowR = rowInner?.getBoundingClientRect() || row?.getBoundingClientRect();
  const hit = rowR
    ? document.elementFromPoint(rowR.x + rowR.width / 2, rowR.y + rowR.height / 2)
    : null;

  const hitTag = hit?.localName;
  const hitClass = hit?.className?.toString?.() || "";
  const hitId = hit?.id || "";
  const rowClickable =
    !!row &&
    getComputedStyle(row).pointerEvents !== "none" &&
    !!hit &&
    (hitClass.includes("urlbarView") || hitId.startsWith("urlbarView"));

  return {
    layout: label,
    singleToolbar: document.documentElement.getAttribute("zen-single-toolbar"),
    container: probeEl(container),
    urlbar: probeEl(urlbar),
    firstRowPointerEvents: row ? getComputedStyle(row).pointerEvents : null,
    elementFromRowCenter: hit ? { id: hitId, tag: hitTag, class: hitClass } : null,
    rowClickable,
    urlbarVisible:
      !!urlbar &&
      urlbar.getBoundingClientRect().width > 100 &&
      getComputedStyle(urlbar).opacity !== "0" &&
      getComputedStyle(urlbar).visibility !== "hidden",
  };
}

(async () => {
  const newTabItem = document
    .getElementById("zenCreateNewPopup")
    ?.querySelector('menuitem[command="cmd_newNavigatorTab"]');
  Services.prefs.setBoolPref("astra.create-new-popup.show-new-tab", false);
  gZenUIManager?._syncCreateNewPopupNewTabItem?.();
  const prefOffHidden =
    newTabItem?.hidden === true ||
    newTabItem?.getAttribute("hidden") === "true";
  Services.prefs.setBoolPref("astra.create-new-popup.show-new-tab", true);
  gZenUIManager?._syncCreateNewPopupNewTabItem?.();
  const prefOnVisible =
    newTabItem?.hidden === false &&
    newTabItem?.getAttribute("hidden") !== "true";
  Services.prefs.setBoolPref("astra.create-new-popup.show-new-tab", false);
  gZenUIManager?._syncCreateNewPopupNewTabItem?.();

  const results = [
    await runLayout("only-sidebar", true),
    await runLayout("sidebar+top-toolbar", false),
  ];
  const popupGate = {
    prefOffHidden,
    prefOnVisible,
    pass: prefOffHidden && prefOnVisible,
  };
  const checks = results.map(r => ({
    id: `${r.layout}/rowClickable`,
    pass: !!r.rowClickable,
    urlbarPointerEvents: r.urlbar?.pointerEvents,
    containerPointerEvents: r.container?.pointerEvents,
    hit: r.elementFromRowCenter,
  }));
  done({
    popupGate,
    results,
    checks,
    allPass: popupGate.pass && checks.every(c => c.pass),
  });
})().catch(e => done({ error: String(e), stack: e.stack }));
"""


def patch_omni() -> None:
    import patch_dev_omni

    patch_dev_omni.patch_omni()


def find_exe() -> Path:
    p = ROOT / ".tmp-content-scheme" / "astra-run" / "astra.exe"
    if p.is_file():
        return p
    return Path(r"C:\Program Files\Astra Browser\astra.exe")


def main() -> int:
    sys.path.insert(0, str(ROOT / "scripts"))
    patch_omni()
    OUT.mkdir(parents=True, exist_ok=True)
    profile = OUT / "profile"
    if profile.exists():
        shutil.rmtree(profile, ignore_errors=True)
    profile.mkdir()
    (profile / "user.js").write_text(
        f'user_pref("marionette.enabled", true);\nuser_pref("marionette.port", {PORT});\n'
        'user_pref("zen.welcome-screen.seen", true);\n'
        'user_pref("zen.urlbar.replace-newtab", true);\n'
        'user_pref("astra.newtab.layout", "minimal");\n',
        encoding="utf-8",
    )
    exe = find_exe()
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
    result = client.execute_async_script(PROBE, script_timeout=180000)
    out = OUT / "pointer-probe.json"
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    client.delete_session()
    proc.terminate()
    return 0 if result.get("allPass") else 1


if __name__ == "__main__":
    raise SystemExit(main())
