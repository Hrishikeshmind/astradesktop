#!/usr/bin/env python3
"""Quick chrome dump: overlay computed styles for contrast diagnosis."""

from __future__ import annotations

from probe_disk_guard import prepare_probe_workspace
import json
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(r"c:\ZenFork\astradesktop")
EXE = ROOT / ".tmp-content-scheme" / "astra-run" / "astra.exe"
PORT = 2837

DUMP = r"""
const wrap = document.getElementById('zen-appcontent-navbar-wrapper');
gZenCompactModeManager._setElementExpandAttribute(wrap, true, 'zen-has-hover');
const bg = wrap?.querySelector('.zen-toolbar-background');
const btn = wrap?.querySelector('#nav-bar toolbarbutton, toolbarbutton');
const icon = btn?.querySelector('.toolbarbutton-icon, image, .toolbarbutton-badge-stack') || btn;
const root = document.documentElement;
const bgCs = bg ? getComputedStyle(bg) : null;
const btnCs = btn ? getComputedStyle(btn) : null;
const iconCs = icon ? getComputedStyle(icon) : null;
return {
  schemePref: Services.prefs.getIntPref('zen.view.window.scheme'),
  colorScheme: getComputedStyle(root).colorScheme,
  varBg: getComputedStyle(root).getPropertyValue('--zen-compact-toolbar-overlay-bg'),
  varBorder: getComputedStyle(root).getPropertyValue('--zen-compact-toolbar-overlay-border'),
  varDrop: getComputedStyle(root).getPropertyValue('--zen-compact-toolbar-overlay-drop'),
  bgExists: !!bg,
  bgDisplay: bgCs?.display,
  bgBackground: bgCs?.background,
  bgBackgroundColor: bgCs?.backgroundColor,
  bgBorderBottom: bgCs?.borderBottom,
  bgBoxShadow: bgCs?.boxShadow,
  bgFilter: bgCs?.backdropFilter || bgCs?.webkitBackdropFilter,
  btnId: btn?.id,
  btnColor: btnCs?.color,
  btnFill: btnCs?.fill,
  iconTag: icon?.tagName,
  iconColor: iconCs?.color,
  iconFill: iconCs?.fill,
  iconOpacity: iconCs?.opacity,
  wrapH: wrap?.getBoundingClientRect().height,
};
"""


class M:
    def __init__(self, port: int):
        self.port = port
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=30)
        self._read()
        self._id = 0

    def _read(self, timeout=120):
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

    def req(self, name, params=None, timeout=120):
        self._id += 1
        payload = json.dumps([0, self._id, name, params or {}]).encode("utf-8")
        self.sock.sendall(f"{len(payload)}:".encode("ascii") + payload)
        resp = self._read(timeout=timeout)
        if resp[2]:
            raise RuntimeError(f"{name}: {resp[2]}")
        return resp[3]

    def start(self):
        self.req("WebDriver:NewSession", {"capabilities": {}}, timeout=180)
        self.req("Marionette:SetContext", {"value": "chrome"})

    def ex(self, script, timeout=90):
        r = self.req(
            "WebDriver:ExecuteScript",
            {"script": script, "args": [], "sandbox": "chrome", "newSandbox": True},
            timeout=timeout,
        )
        return r.get("value", r)


def kill():
    subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "Get-Process astra,plugin-container,firefox -ErrorAction SilentlyContinue | Stop-Process -Force"],
        check=False,
    )
    time.sleep(2)


def wait_port(port, seconds=90):
    for _ in range(seconds):
        try:
            s = socket.create_connection(("127.0.0.1", port), timeout=2)
            s.close()
            return True
        except OSError:
            time.sleep(1)
    return False


def main():
    kill()
    d = Path(tempfile.mkdtemp(prefix="astra-dump-"))
    (d / "user.js").write_text(
        'user_pref("marionette.enabled", true);\n'
        f'user_pref("marionette.port", {PORT});\n'
        'user_pref("zen.welcome-screen.seen", true);\n'
        'user_pref("zen.view.use-single-toolbar", false);\n'
        'user_pref("zen.view.sidebar-expanded", true);\n'
        'user_pref("zen.view.window.scheme", 1);\n'
        'user_pref("zen.view.compact.hide-toolbar", true);\n',
        encoding="utf-8",
    )
    subprocess.Popen(
        [str(EXE), "-marionette", "-remote-allow-system-access", "-no-remote",
         "-profile", str(d), f"-marionette-port={PORT}", "-foreground"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if not wait_port(PORT):
        raise SystemExit("port timeout")
    m = M(PORT)
    m.start()
    m.ex("""
      Services.prefs.setIntPref('zen.view.window.scheme', 1);
      Services.prefs.setBoolPref('zen.view.use-single-toolbar', false);
      Services.prefs.setBoolPref('zen.view.sidebar-expanded', true);
      Services.prefs.setBoolPref('zen.view.compact.hide-toolbar', true);
      gZenVerticalTabsManager._updateEvent();
      gZenCompactModeManager.preference = true;
      return true;
    """)
    time.sleep(1.2)
    m.ex("""
      const uri = Services.io.newURI('https://en.wikipedia.org/wiki/Main_Page');
      gBrowser.loadURI(uri, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      return true;
    """)
    time.sleep(4)
    light = m.ex(DUMP)
    m.ex("Services.prefs.setIntPref('zen.view.window.scheme', 0); return true;")
    time.sleep(1)
    dark = m.ex(DUMP)
    out = {"light_scheme1": light, "dark_scheme0": dark}
    Path(r"c:\ZenFork\astradesktop\.tmp-content-scheme\overlay-style-dump.json").write_text(
        json.dumps(out, indent=2), encoding="utf-8"
    )
    print(json.dumps(out, indent=2))
    m.req("WebDriver:DeleteSession")
    kill()
    shutil.rmtree(d, ignore_errors=True)


if __name__ == "__main__":
    prepare_probe_workspace(Path(__file__).resolve().parents[1], label="dump_overlay_styles")
    main()
