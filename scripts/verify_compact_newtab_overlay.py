#!/usr/bin/env python3
"""Marionette probe: compact new-tab overlay click + identity state."""

from __future__ import annotations

from probe_disk_guard import prepare_probe_workspace
import json
import shutil
import socket
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path

ROOT = Path(r"c:\ZenFork\astradesktop")
SRC = ROOT / "src"
RUN = ROOT / ".tmp-content-scheme" / "astra-run"
EXE = RUN / "astra.exe"
OMNI = RUN / "browser" / "omni.ja"
INSTALLED = Path(r"C:\Program Files\Astra Browser")
INSTALLED_EXE = INSTALLED / "astra.exe"
INSTALLED_OMNI = INSTALLED / "browser" / "omni.ja"
OUT = ROOT / ".tmp-content-scheme" / "compact-newtab-overlay-probe.json"
PORT = 2844

REPLACEMENTS = {
    "chrome/browser/content/browser/zen-components/ZenCompactMode.mjs": SRC
    / "zen/compact-mode/ZenCompactMode.mjs",
    "chrome/browser/content/browser/zen-components/ZenUIManager.mjs": SRC
    / "zen/common/modules/ZenUIManager.mjs",
    "chrome/browser/content/browser/zen-styles/astra-compact.css": SRC
    / "zen/common/styles/astra-compact.css",
    "chrome/browser/content/browser/zen-styles/zen-omnibox.css": SRC
    / "zen/common/styles/zen-omnibox.css",
}

PROBE_JS = r"""
(async () => {
async function waitFor(fn, label, ms = 15000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const v = fn();
      if (v) return v;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("timeout: " + label);
}

async function probeOverlay(compact) {
  if (compact) {
    gZenCompactModeManager.preference = true;
    await new Promise(r => setTimeout(r, 500));
  } else if (gZenCompactModeManager.preference) {
    gZenCompactModeManager.preference = false;
    await new Promise(r => setTimeout(r, 500));
  }

  const prevTab = gBrowser.addTrustedTab("https://example.com/");
  gBrowser.selectedTab = prevTab;
  await waitFor(
    () => prevTab.linkedBrowser.currentURI?.spec?.startsWith("https://example.com"),
    "example.com load"
  );

  if (compact) {
    gZenCompactModeManager._setElementExpandAttribute(gNavToolbox, true, "zen-has-hover");
    await new Promise(r => setTimeout(r, 300));
  }

  const prevTesting = gZenUIManager.testingEnabled;
  gZenUIManager.testingEnabled = false;
  const opened = gZenUIManager.handleNewTab(false, false, "tab");
  gZenUIManager.testingEnabled = prevTesting;
  if (!opened) {
    return { error: "handleNewTab returned false" };
  }

  await waitFor(
    () => gURLBar.hasAttribute("breakout-extend"),
    "urlbar breakout"
  );
  const row = await waitFor(
    () => document.querySelector("#urlbar-results .urlbarView-row"),
    "suggestion row"
  );

  const rowRect = row.getBoundingClientRect();
  const cx = rowRect.x + rowRect.width / 2;
  const cy = rowRect.y + rowRect.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  const toolbox = document.getElementById("navigator-toolbox");
  const urlbar = document.getElementById("urlbar");
  const identity = document.getElementById("identity-box");
  const identityLabel = document.getElementById("identity-icon-label");

  const rowStyle = getComputedStyle(row);
  const toolboxStyle = toolbox ? getComputedStyle(toolbox) : null;
  const urlbarStyle = urlbar ? getComputedStyle(urlbar) : null;
  const identityStyle = identity ? getComputedStyle(identity) : null;

  return {
    compact,
    compactAttr: document.documentElement.getAttribute("zen-compact-mode"),
    zenNewtab: urlbar.hasAttribute("zen-newtab"),
    breakoutExtend: urlbar.hasAttribute("breakout-extend"),
    floatingUrlbar: urlbar.getAttribute("zen-floating-urlbar"),
    pageProxyState: urlbar.getAttribute("pageproxystate"),
    overlaySpec: gBrowser.selectedTab.linkedBrowser.currentURI.spec,
    identityBox: identity ? {
      display: identityStyle.display,
      visibility: identityStyle.visibility,
      className: identity.className,
      pageProxyState: identity.getAttribute("pageproxystate"),
      label: identityLabel ? (identityLabel.textContent || "").trim() : null,
    } : null,
    rowCenter: { x: Math.round(cx * 10) / 10, y: Math.round(cy * 10) / 10 },
    elementFromPoint: hit ? {
      tag: hit.tagName,
      id: hit.id || null,
      className: (hit.className && hit.className.toString()) || "",
    } : null,
    rowIsHitTarget: !!(hit && (hit === row || row.contains(hit))),
    rowStyle: {
      pointerEvents: rowStyle.pointerEvents,
      zIndex: rowStyle.zIndex,
      position: rowStyle.position,
    },
    toolbox: toolbox ? {
      overflow: toolboxStyle.overflow,
      zIndex: toolboxStyle.zIndex,
      position: toolboxStyle.position,
      compactActive: toolbox.hasAttribute("zen-compact-mode-active"),
      hasHover: toolbox.hasAttribute("zen-has-hover"),
    } : null,
    urlbar: {
      zIndex: urlbarStyle.zIndex,
      position: urlbarStyle.position,
      top: urlbarStyle.top,
      left: urlbarStyle.left,
    },
    clickNavigates: await (async () => {
      const before = gBrowser.selectedTab.linkedBrowser.currentURI.spec;
      if (typeof EventUtils !== "undefined") {
        EventUtils.synthesizeMouseAtCenter(row, {}, window);
      } else {
        for (const type of ["mousedown", "mouseup", "click"]) {
          row.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 }));
        }
      }
      await waitFor(
        () => gBrowser.selectedTab.linkedBrowser.currentURI.spec !== before,
        "row click navigation",
        8000
      );
      return {
        before,
        after: gBrowser.selectedTab.linkedBrowser.currentURI.spec,
      };
    })(),
  };
}

const normal = await probeOverlay(false);
if (gURLBar.hasAttribute("zen-newtab")) {
  gZenUIManager.handleUrlbarClose(false, false);
}
while (gBrowser.tabs.length > 1) {
  gBrowser.removeTab(gBrowser.tabs[gBrowser.tabs.length - 1], { animate: false });
}
const compact = await probeOverlay(true);
if (gURLBar.hasAttribute("zen-newtab")) {
  gZenUIManager.handleUrlbarClose(false, false);
}
return { normal, compact };
})()
"""


class Marionette:
    def __init__(self, port: int):
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=30)
        self._read()
        self._id = 0

    def _read(self, timeout=180):
        self.sock.settimeout(timeout)
        buf = b""
        while b":" not in buf:
            chunk = self.sock.recv(1)
            if not chunk:
                raise RuntimeError("socket closed")
            buf += chunk
        length = int(buf.split(b":", 1)[0])
        rest = buf.split(b":", 1)[1]
        while len(rest) < length:
            rest += self.sock.recv(length - len(rest))
        return json.loads(rest.decode("utf-8"))

    def call(self, name, params=None, timeout=180):
        self._id += 1
        payload = json.dumps([0, self._id, name, params or {}]).encode("utf-8")
        self.sock.sendall(f"{len(payload)}:".encode("ascii") + payload)
        resp = self._read(timeout=timeout)
        if resp[2]:
            raise RuntimeError(f"{name}: {resp[2]}")
        return resp[3]

    def start(self):
        self.call("WebDriver:NewSession", {"capabilities": {}}, timeout=180)
        self.call("WebDriver:SetTimeouts", {"script": 180000})
        self.call("Marionette:SetContext", {"value": "chrome"})

    def js(self, script, timeout=120):
        r = self.call(
            "WebDriver:ExecuteScript",
            {"script": script, "args": [], "sandbox": "chrome", "newSandbox": True},
            timeout=timeout,
        )
        val = r.get("value", r)
        if isinstance(val, dict) and val.get("error"):
            raise RuntimeError(val["error"])
        return val

    def js_async(self, script, timeout=120):
        wrapped = (
            "(() => {"
            "const done = arguments[arguments.length - 1];"
            "(async () => {"
            "try { done(await (" + script + ")); }"
            "catch (e) { done({error: String(e), stack: e?.stack}); }"
            "})();"
            "})()"
        )
        r = self.call(
            "WebDriver:ExecuteAsyncScript",
            {"script": wrapped, "args": [], "sandbox": "chrome", "newSandbox": True},
            timeout=timeout,
        )
        val = r.get("value", r)
        if isinstance(val, dict) and val.get("error"):
            raise RuntimeError(val["error"])
        return val

    def close(self):
        try:
            self.call("WebDriver:DeleteSession", {})
        except Exception:
            pass
        self.sock.close()


def kill_astra() -> None:
    subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            "Get-Process astra,plugin-container,firefox -ErrorAction SilentlyContinue | Stop-Process -Force",
        ],
        check=False,
    )
    time.sleep(2)


def wait_port(port: int, seconds: int = 90) -> bool:
    for _ in range(seconds):
        try:
            s = socket.create_connection(("127.0.0.1", port), timeout=2)
            s.close()
            return True
        except OSError:
            time.sleep(1)
    return False


def ensure_run_dir() -> None:
    RUN.mkdir(parents=True, exist_ok=True)
    if not EXE.exists() and INSTALLED_EXE.exists():
        print("copying installed browser to", RUN)
        if RUN.exists():
            shutil.rmtree(RUN, ignore_errors=True)
        shutil.copytree(INSTALLED, RUN, dirs_exist_ok=True)
    if not OMNI.exists() and INSTALLED_OMNI.exists():
        OMNI.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(INSTALLED_OMNI, OMNI)


def patch_omni() -> None:
    ensure_run_dir()
    tmp = OMNI.with_suffix(".ja.tmp")
    if tmp.exists():
        tmp.unlink()
    with zipfile.ZipFile(OMNI, "r") as zin:
        names = set(zin.namelist())
    resolved: dict[str, Path] = {}
    for rel, path in REPLACEMENTS.items():
        if rel not in names:
            hits = [n for n in names if Path(n).name == Path(rel).name]
            if not hits:
                raise SystemExit(f"missing in omni: {rel}")
            rel = hits[0]
        resolved[rel] = path
    with zipfile.ZipFile(OMNI, "r") as zin, zipfile.ZipFile(
        tmp, "w", compression=zipfile.ZIP_STORED
    ) as zout:
        for item in zin.infolist():
            data = resolved[item.filename].read_bytes() if item.filename in resolved else zin.read(item.filename)
            info = zipfile.ZipInfo(item.filename)
            info.compress_type = zipfile.ZIP_STORED
            info.external_attr = item.external_attr
            zout.writestr(info, data)
            if item.filename in resolved:
                print("patched", item.filename, len(data))
    shutil.move(str(tmp), str(OMNI))


def launch(profile: Path) -> subprocess.Popen:
    (profile / "user.js").write_text(
        "\n".join(
            [
                'user_pref("marionette.enabled", true);',
                f'user_pref("marionette.port", {PORT});',
                'user_pref("zen.welcome-screen.seen", true);',
                'user_pref("browser.aboutwelcome.enabled", false);',
                'user_pref("startup.homepage_welcome_url", "");',
                'user_pref("browser.shell.checkDefaultBrowser", false);',
                'user_pref("browser.startup.page", 0);',
                'user_pref("browser.startup.homepage", "about:blank");',
                'user_pref("zen.tabs.vertical", true);',
                'user_pref("zen.view.use-single-toolbar", false);',
                'user_pref("zen.view.sidebar-expanded", false);',
                'user_pref("zen.view.compact.hide-toolbar", true);',
                'user_pref("zen.view.compact.enable-at-startup", false);',
                'user_pref("astra.newtab.layout", "minimal");',
                'user_pref("zen.urlbar.replace-newtab", true);',
                'user_pref("zen.urlbar.behavior", "floating-on-type");',
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    return subprocess.Popen(
        [
            str(EXE),
            "-marionette",
            "-remote-allow-system-access",
            "-no-remote",
            "-profile",
            str(profile),
            f"-marionette-port={PORT}",
            "-foreground",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main() -> None:
    kill_astra()
    patch_omni()
    kill_astra()
    profile = Path(tempfile.mkdtemp(prefix="astra-newtab-overlay-", dir=str(ROOT / ".tmp-content-scheme")))
    proc = launch(profile)
    if not wait_port(PORT):
        proc.kill()
        raise SystemExit("marionette port timeout")
    time.sleep(4)
    client = Marionette(PORT)
    client.start()
    try:
        client.js(
            """
            Services.prefs.setBoolPref("zen.view.sidebar-expanded", false);
            gZenVerticalTabsManager._updateEvent();
            return true;
            """
        )
        data = client.js_async(PROBE_JS, timeout=180)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(json.dumps(data, indent=2))
        print("wrote", OUT)
    finally:
        client.close()
        kill_astra()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    prepare_probe_workspace(Path(__file__).resolve().parents[1], label="verify_compact_newtab_overlay")
    main()
