#!/usr/bin/env python3
"""Dump toolbar overlay DOM structure."""

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
PORT = 2838
OUT = ROOT / ".tmp-content-scheme" / "overlay-dom-dump.json"

JS = r"""
const wrap = document.getElementById('zen-appcontent-navbar-wrapper');
gZenCompactModeManager._setElementExpandAttribute(wrap, true, 'zen-has-hover');
const byClass = [...document.querySelectorAll('.zen-toolbar-background')].map(el => ({
  id: el.id,
  parent: el.parentElement?.id,
  display: getComputedStyle(el).display,
  bg: getComputedStyle(el).backgroundColor,
  background: getComputedStyle(el).background.slice(0, 160),
}));
const byId = document.getElementById('zen-toolbar-background');
const container = document.getElementById('zen-appcontent-navbar-container');
const navBar = document.getElementById('nav-bar');
return {
  hasHover: wrap?.hasAttribute('zen-has-hover'),
  wrapH: wrap?.getBoundingClientRect().height,
  byClass,
  byId: byId ? {
    parent: byId.parentElement?.id,
    className: byId.className,
    display: getComputedStyle(byId).display,
    bg: getComputedStyle(byId).backgroundColor,
    background: getComputedStyle(byId).background.slice(0, 200),
    inWrap: !!wrap?.contains(byId),
  } : null,
  containerChildren: [...(container?.children || [])].map(c => ({
    tag: c.tagName, id: c.id, cls: String(c.className).slice(0, 100),
  })),
  wrapChildren: [...(wrap?.children || [])].map(c => ({
    tag: c.tagName, id: c.id, cls: String(c.className).slice(0, 100),
  })),
  containerBg: container ? getComputedStyle(container).backgroundColor : null,
  navBarBg: navBar ? getComputedStyle(navBar).backgroundColor : null,
  navBarBackground: navBar ? getComputedStyle(navBar).background.slice(0, 200) : null,
  toolboxBgIdParent: document.getElementById('navigator-toolbox')?.querySelector('#zen-toolbar-background') ? 'in-toolbox' : 'not-in-toolbox',
  transparentMode: document.documentElement.getAttribute('astra-transparent-effective-mode'),
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
    d = Path(tempfile.mkdtemp(prefix="astra-dom-"))
    (d / "user.js").write_text(
        "\n".join([
            'user_pref("marionette.enabled", true);',
            f'user_pref("marionette.port", {PORT});',
            'user_pref("zen.welcome-screen.seen", true);',
        ]) + "\n",
        encoding="utf-8",
    )
    subprocess.Popen(
        [str(EXE), "-marionette", "-remote-allow-system-access", "-no-remote",
         "-profile", str(d), f"-marionette-port={PORT}", "-foreground"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if not wait_port(PORT):
        raise SystemExit("timeout")
    m = M(PORT)
    m.start()
    m.ex("""
      Services.prefs.setBoolPref('zen.view.use-single-toolbar', false);
      Services.prefs.setBoolPref('zen.view.sidebar-expanded', true);
      Services.prefs.setBoolPref('zen.view.compact.hide-toolbar', true);
      Services.prefs.setIntPref('zen.view.window.scheme', 1);
      gZenVerticalTabsManager._updateEvent();
      gZenCompactModeManager.preference = true;
      return true;
    """)
    time.sleep(1.5)
    m.ex("""
      const uri = Services.io.newURI('https://en.wikipedia.org/wiki/Main_Page');
      gBrowser.loadURI(uri, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      return true;
    """)
    time.sleep(4)
    data = m.ex(JS)
    OUT.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(json.dumps(data, indent=2))
    m.req("WebDriver:DeleteSession")
    kill()
    shutil.rmtree(d, ignore_errors=True)


if __name__ == "__main__":
    prepare_probe_workspace(Path(__file__).resolve().parents[1], label="dump_overlay_dom")
    main()
