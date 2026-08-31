#!/usr/bin/env python3
"""Marionette: investigate sidebar urlbar/search bar state after New Tab via + popup."""

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
OUT = ROOT / ".tmp-foot-spacing" / "searchbar-bug"
PORT = int(os.environ.get("MARIONETTE_PORT", "2856"))

PROBE = r"""
const done = arguments[arguments.length - 1];
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function probeUrlbar(label) {
  const urlbar = document.getElementById("urlbar");
  const searchbar = document.getElementById("searchbar");
  const searchContainer = document.getElementById("search-container");
  const toolbox = document.getElementById("navigator-toolbox");
  const root = document.documentElement;

  function elProbe(el, name) {
    if (!el) return { name, present: false };
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const input = el.querySelector?.(".urlbar-input") || el.querySelector?.("input");
    const bg = el.querySelector?.(".urlbar-background");
    const bgCs = bg ? getComputedStyle(bg) : null;
    const inputCs = input ? getComputedStyle(input) : null;
    return {
      name,
      present: true,
      id: el.id,
      tag: el.localName,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      attrs: Array.from(el.attributes).map(a => `${a.name}=${JSON.stringify(a.value)}`),
      focused: el.focused ?? el.matches?.(":focus") ?? false,
      disabled: el.disabled ?? false,
      pointerEvents: cs.pointerEvents,
      opacity: cs.opacity,
      visibility: cs.visibility,
      backgroundColor: cs.backgroundColor,
      color: cs.color,
      zIndex: cs.zIndex,
      input: input
        ? {
            value: input.value,
            pointerEvents: inputCs.pointerEvents,
            opacity: inputCs.opacity,
            color: inputCs.color,
            disabled: input.disabled,
          }
        : null,
      background: bg
        ? {
            pointerEvents: bgCs.pointerEvents,
            opacity: bgCs.opacity,
            backgroundColor: bgCs.backgroundColor,
          }
        : null,
    };
  }

  const overlay = document.elementFromPoint(
    urlbar ? urlbar.getBoundingClientRect().x + urlbar.getBoundingClientRect().width / 2 : 100,
    urlbar ? urlbar.getBoundingClientRect().y + urlbar.getBoundingClientRect().height / 2 : 100
  );

  return {
    label,
    layout: {
      zenSingleToolbar: root.getAttribute("zen-single-toolbar"),
      zenHasEmptyTab: root.getAttribute("zen-has-empty-tab"),
      supressPrimaryAdjustment: root.getAttribute("supress-primary-adjustment"),
      zenCompactMode: root.getAttribute("zen-compact-mode"),
    },
    toolbox: toolbox
      ? {
          zenHasImplicitHover: toolbox.getAttribute("zen-has-implicit-hover"),
          zenHasHover: toolbox.getAttribute("zen-has-hover"),
          zenUserShow: toolbox.getAttribute("zen-user-show"),
          zenHasEmptyTab: toolbox.getAttribute("zen-has-empty-tab"),
        }
      : null,
    zenUIManager: {
      zenNewtabOnUrlbar: urlbar?.hasAttribute("zen-newtab"),
      breakoutExtend: urlbar?.hasAttribute("breakout-extend"),
      breakout: urlbar?.hasAttribute("breakout"),
      zenFloatingUrlbar: urlbar?.getAttribute("zen-floating-urlbar"),
      urlbarFocused: urlbar?.focused,
      overlayTab: !!gZenUIManager?._overlayTab,
      lastTab: !!gZenUIManager?._lastTab,
      tabCount: gBrowser?.tabs?.length,
      selectedTabEmpty: gBrowser?.selectedTab?.hasAttribute("zen-empty-tab"),
    },
    urlbar: elProbe(urlbar, "urlbar"),
    searchbar: elProbe(searchbar, "searchbar"),
    searchContainer: elProbe(searchContainer, "search-container"),
    elementFromCenter: overlay
      ? { id: overlay.id, tag: overlay.localName, class: overlay.className?.toString?.() }
      : null,
  };
}

async function tryFocusUrlbar() {
  const urlbar = document.getElementById("urlbar");
  if (!urlbar) return { ok: false, error: "no urlbar" };
  const beforeFocused = urlbar.focused;
  try {
    urlbar.focus();
    urlbar.click();
    const input = urlbar.querySelector(".urlbar-input");
    input?.focus?.();
    input?.click?.();
  } catch (e) {
    return { ok: false, error: String(e) };
  }
  await sleep(300);
  return {
    ok: true,
    focusedBefore: beforeFocused,
    focusedAfter: urlbar.focused,
    breakoutExtend: urlbar.hasAttribute("breakout-extend"),
    zenNewtab: urlbar.hasAttribute("zen-newtab"),
  };
}

async function resetTabs() {
  while (gBrowser.tabs.length > 1) {
    gBrowser.removeTab(gBrowser.tabs[gBrowser.tabs.length - 1], { animate: false });
  }
  if (gURLBar?.hasAttribute("zen-newtab")) {
    gZenUIManager?.handleUrlbarClose?.(false, false);
  }
  await sleep(400);
}

async function openNewTabViaPopup() {
  const popup = document.getElementById("zenCreateNewPopup");
  popup?.hidePopup?.();
  await sleep(150);
  const click = document.getElementById("zen-create-new-button");
  click?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await sleep(400);
  const popupOpen = popup && (popup.state === "open" || popup.hasAttribute("open"));
  if (!popupOpen) {
    return { ok: false, error: "popup did not open" };
  }
  const item = popup.querySelector('[command="cmd_newNavigatorTab"]');
  if (item?.doCommand) item.doCommand();
  else item?.click?.();
  await sleep(800);
  popup.hidePopup?.();
  await sleep(300);
  return { ok: true, popupOpen: true };
}

async function openNewTabViaKeyboard() {
  if (gURLBar?.hasAttribute("zen-newtab")) {
    gZenUIManager?.handleUrlbarClose?.(false, false);
    await sleep(300);
  }
  const before = gBrowser.tabs.length;
  document.getElementById("cmd_newNavigatorTab")?.doCommand?.();
  await sleep(800);
  return { ok: gBrowser.tabs.length > before, tabsBefore: before, tabsAfter: gBrowser.tabs.length };
}

function probeInlineSlot(label) {
  const container = document.getElementById("urlbar-container");
  const urlbar = document.getElementById("urlbar");
  const navBar = document.getElementById("nav-bar");
  function elProbe(el, name) {
    if (!el) return { name, present: false };
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      name,
      present: true,
      id: el.id,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      attrs: Array.from(el.attributes).map(a => `${a.name}=${JSON.stringify(a.value)}`),
      pointerEvents: cs.pointerEvents,
      opacity: cs.opacity,
      visibility: cs.visibility,
      backgroundColor: cs.backgroundColor,
      display: cs.display,
      zIndex: cs.zIndex,
    };
  }
  const slotRect = container?.getBoundingClientRect();
  const hit =
    slotRect && slotRect.width > 0
      ? document.elementFromPoint(slotRect.x + slotRect.width / 2, slotRect.y + slotRect.height / 2)
      : null;
  return {
    label,
    container: elProbe(container, "urlbar-container"),
    navBar: elProbe(navBar, "nav-bar"),
    urlbarFloating: urlbar?.hasAttribute("zen-floating-urlbar") ?? false,
    urlbarBreakoutExtend: urlbar?.hasAttribute("breakout-extend") ?? false,
    urlbarZenNewtab: urlbar?.hasAttribute("zen-newtab") ?? false,
    elementFromSlotCenter: hit
      ? { id: hit.id, tag: hit.localName, class: hit.className?.toString?.() }
      : null,
  };
}

async function dismissOverlay(method) {
  if (method === "escape") {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape", bubbles: true }));
    await sleep(500);
    return { method };
  }
  if (method === "blur") {
    gURLBar?.blur?.();
    document.getElementById("tabbrowser-tabbox")?.focus?.();
    await sleep(500);
    return { method };
  }
  if (method === "click-content") {
    const tabbox = document.getElementById("tabbrowser-tabbox");
    const r = tabbox?.getBoundingClientRect();
    if (r) {
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      tabbox.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: x, clientY: y })
      );
      tabbox.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: x, clientY: y })
      );
      tabbox.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y })
      );
    }
    await sleep(500);
    return { method };
  }
  return { method, error: "unknown" };
}

async function clickInlineSlot() {
  const container = document.getElementById("urlbar-container");
  if (!container) return { ok: false, error: "no container" };
  const r = container.getBoundingClientRect();
  const before = {
    zenNewtab: gURLBar?.hasAttribute("zen-newtab"),
    breakoutExtend: gURLBar?.hasAttribute("breakout-extend"),
    focused: gURLBar?.focused,
  };
  const x = r.x + r.width / 2;
  const y = r.y + r.height / 2;
  container.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: x, clientY: y })
  );
  container.dispatchEvent(
    new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: x, clientY: y })
  );
  container.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y })
  );
  await sleep(400);
  return {
    ok: true,
    before,
    after: {
      zenNewtab: gURLBar?.hasAttribute("zen-newtab"),
      breakoutExtend: gURLBar?.hasAttribute("breakout-extend"),
      focused: gURLBar?.focused,
      floating: gURLBar?.hasAttribute("zen-floating-urlbar"),
    },
  };
}

function isWashedPlaceholder(bg) {
  if (!bg) return false;
  return (
    bg === "rgba(255, 255, 255, 0.08)" ||
    bg.includes("251, 251, 251") ||
    bg.includes("255, 255, 255")
  );
}

function isTransparentBg(bg) {
  if (!bg) return true;
  return bg === "rgba(0, 0, 0, 0)" || bg === "transparent";
}

async function runFixScenario(layoutLabel, singleToolbar, trigger) {
  await resetTabs();
  Services.prefs.setBoolPref("zen.view.use-single-toolbar", singleToolbar);
  Services.prefs.setBoolPref("zen.view.sidebar-expanded", true);
  gZenVerticalTabsManager?._updateEvent();
  await sleep(1200);

  const inlineBefore = probeInlineSlot("before");
  let triggerResult;
  if (trigger === "popup") {
    triggerResult = await openNewTabViaPopup();
  } else {
    triggerResult = await openNewTabViaKeyboard();
  }
  const inlineDuringOverlay = probeInlineSlot("during-overlay");
  const floatingOk =
    inlineDuringOverlay.urlbarFloating &&
    inlineDuringOverlay.urlbarZenNewtab &&
    gURLBar?.focused;
  await dismissOverlay("click-content");
  await sleep(400);
  const inlineAfterDismiss = probeInlineSlot("after-dismiss");
  const restoredInline =
    !inlineAfterDismiss.urlbarFloating &&
    !inlineAfterDismiss.urlbarZenNewtab &&
    inlineAfterDismiss.elementFromSlotCenter?.id === "urlbar-input";

  const slotBg = inlineDuringOverlay.container?.backgroundColor;
  return {
    layout: layoutLabel,
    trigger,
    triggerResult,
    floatingOk,
    inlineBefore,
    inlineDuringOverlay,
    inlineAfterDismiss,
    checks: {
      overlayFloats: floatingOk,
      placeholderNotWashed: isTransparentBg(slotBg) && !isWashedPlaceholder(slotBg),
      dismissRestoresInline: restoredInline,
    },
  };
}

(async () => {
  const scenarios = [
    await runFixScenario("only-sidebar", true, "popup"),
    await runFixScenario("only-sidebar", true, "keyboard"),
    await runFixScenario("sidebar+top-toolbar", false, "popup"),
  ];
  const checks = [];
  for (const s of scenarios) {
    for (const [key, pass] of Object.entries(s.checks)) {
      checks.push({
        id: `${s.layout}/${s.trigger}/${key}`,
        pass: !!pass,
        layout: s.layout,
        trigger: s.trigger,
        key,
        slotBgDuringOverlay: s.inlineDuringOverlay?.container?.backgroundColor,
      });
    }
  }
  done({ scenarios, checks, allPass: checks.every(c => c.pass) });
})().catch(e => done({ error: String(e), stack: e.stack }));
"""


def patch_omni() -> None:
    import sys

    sys.path.insert(0, str(ROOT / "scripts"))
    import patch_dev_omni

    patch_dev_omni.patch_omni()


def find_exe() -> Path:
    env = os.environ.get("ASTRA_EXE")
    if env and Path(env).is_file():
        return Path(env)
    p = ROOT / ".tmp-content-scheme" / "astra-run" / "astra.exe"
    if p.is_file():
        return p
    return Path(r"C:\Program Files\Astra Browser\astra.exe")


def main() -> int:
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
        print("Marionette failed", file=sys.stderr)
        return 1

    time.sleep(4)
    client.set_context(client.CONTEXT_CHROME)
    result = client.execute_async_script(PROBE, script_timeout=180000)
    report = OUT / "searchbar-fix-verify.json"
    report.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    client.delete_session()
    proc.terminate()
    return 0 if result.get("allPass") else 1


if __name__ == "__main__":
    raise SystemExit(main())
