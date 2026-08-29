#!/usr/bin/env python3
"""Deeper hover/size probe for Settings wrapper + extension toolbaritems."""

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
PORT = 2842
OUT = ROOT / ".tmp-content-scheme" / "hover-size-probe.json"

JS = r"""
function info(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    id: el.id, tag: el.localName,
    cls: (el.className?.baseVal || el.className || '').toString().slice(0,80),
    parent: el.parentElement?.id,
    x: Math.round(r.x), y: Math.round(r.y),
    w: Math.round(r.width), h: Math.round(r.height),
    pad: cs.padding, margin: cs.margin, br: cs.borderRadius, bg: cs.backgroundColor,
    innerPad: cs.getPropertyValue('--toolbarbutton-inner-padding').trim(),
    radius: cs.getPropertyValue('--toolbarbutton-border-radius').trim(),
    hoverBg: cs.getPropertyValue('--toolbarbutton-hover-background').trim().slice(0,80),
  };
}
const settingsBtn = document.getElementById('PanelUI-menu-button');
const settingsWrap = document.getElementById('PanelUI-button');
const reload = document.getElementById('reload-button');
const compactBtn = document.querySelector('#zen-toggle-compact-mode toolbarbutton');
const unified = document.getElementById('unified-extensions-button');
const extItems = [...document.querySelectorAll('toolbaritem[id$="-browser-action"]')].map(ti => {
  const btn = ti.querySelector('toolbarbutton');
  const icon = btn?.querySelector('.toolbarbutton-icon, .toolbarbutton-badge-stack');
  return { wrap: info(ti), btn: info(btn), icon: info(icon) };
});
const topKids = [...document.querySelectorAll('#zen-sidebar-top-buttons-customization-target > *')].map(el => ({
  id: el.id, tag: el.localName, w: Math.round(el.getBoundingClientRect().width),
  h: Math.round(el.getBoundingClientRect().height),
  overflowed: el.getAttribute('overflowedItem') === 'true',
}));
const navKids = [...document.querySelectorAll('#nav-bar-customization-target > *')].slice(0, 25).map(el => ({
  id: el.id, tag: el.localName, w: Math.round(el.getBoundingClientRect().width),
  h: Math.round(el.getBoundingClientRect().height),
}));
return {
  single: document.documentElement.getAttribute('zen-single-toolbar'),
  settingsBtn: info(settingsBtn),
  settingsIcon: info(settingsBtn?.querySelector('.toolbarbutton-icon, .toolbarbutton-badge-stack')),
  settingsWrap: info(settingsWrap),
  reload: info(reload),
  reloadIcon: info(reload?.querySelector('.toolbarbutton-icon, .toolbarbutton-badge-stack')),
  compactBtn: info(compactBtn),
  compactIcon: info(compactBtn?.querySelector('.toolbarbutton-icon, .toolbarbutton-badge-stack')),
  unified: info(unified),
  unifiedIcon: info(unified?.querySelector('.toolbarbutton-icon, .toolbarbutton-badge-stack')),
  extItems,
  topKids,
  navKids,
  toolbarStartEndPad: getComputedStyle(document.documentElement).getPropertyValue('--toolbar-start-end-padding').trim(),
};
"""


class M:
    def __init__(self, port: int):
        self.port = port
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=30)
        self._read(); self._id = 0

    def _read(self, timeout=120):
        self.sock.settimeout(timeout)
        buf = b""
        while b":" not in buf:
            chunk = self.sock.recv(1)
            if not chunk: raise RuntimeError("closed")
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
        if resp[2]: raise RuntimeError(f"{name}: {resp[2]}")
        return resp[3]

    def start(self):
        self.req("WebDriver:NewSession", {"capabilities": {}}, timeout=180)
        self.req("Marionette:SetContext", {"value": "chrome"})

    def ex(self, script, timeout=90):
        r = self.req("WebDriver:ExecuteScript", {"script": script, "args": [], "sandbox": "chrome", "newSandbox": True}, timeout=timeout)
        return r.get("value", r)


def kill():
    subprocess.run(["powershell", "-NoProfile", "-Command",
        "Get-Process astra,plugin-container,firefox -ErrorAction SilentlyContinue | Stop-Process -Force"], check=False)
    time.sleep(2)


def wait_port(port, seconds=90):
    for _ in range(seconds):
        try:
            s = socket.create_connection(("127.0.0.1", port), timeout=2); s.close(); return True
        except OSError:
            time.sleep(1)
    return False


def write_profile(prefs):
    d = Path(tempfile.mkdtemp(prefix="astra-hover2-"))
    lines = []
    for k, v in prefs.items():
        if isinstance(v, bool): lines.append(f'user_pref("{k}", {str(v).lower()});')
        elif isinstance(v, int): lines.append(f'user_pref("{k}", {v});')
        else: lines.append(f'user_pref("{k}", "{v}");')
    (d / "user.js").write_text("\n".join(lines)+"\n", encoding="utf-8")
    return d


def run(single, expanded, label):
    kill()
    prof = write_profile({
        "marionette.enabled": True, "marionette.port": PORT,
        "zen.welcome-screen.seen": True,
        "zen.view.use-single-toolbar": single,
        "zen.view.sidebar-expanded": expanded,
        "zen.view.window.scheme": 0,
        "zen.theme.hide-unified-extensions-button": False,
    })
    subprocess.Popen([str(EXE), "-marionette", "-remote-allow-system-access", "-no-remote",
                      "-profile", str(prof), f"-marionette-port={PORT}", "-foreground"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not wait_port(PORT): raise RuntimeError("timeout")
    m = M(PORT); m.start()
    m.ex(f"""
      Services.prefs.setBoolPref('zen.view.use-single-toolbar', {'true' if single else 'false'});
      Services.prefs.setBoolPref('zen.view.sidebar-expanded', {'true' if expanded else 'false'});
      Services.prefs.setBoolPref('zen.theme.hide-unified-extensions-button', false);
      gZenVerticalTabsManager._updateEvent();
      if (gZenUIManager?.settleToolbarOverflow) return gZenUIManager.settleToolbarOverflow();
      return true;
    """)
    time.sleep(1.5)
    data = m.ex(JS)
    data["label"] = label
    m.req("WebDriver:DeleteSession")
    shutil.rmtree(prof, ignore_errors=True)
    return data


def main():
    results = {
        "only_sidebar": run(True, True, "only_sidebar"),
        "sidebar_top": run(False, True, "sidebar_top"),
    }
    OUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    prepare_probe_workspace(Path(__file__).resolve().parents[1], label="probe_hover_sizes")
    main()
