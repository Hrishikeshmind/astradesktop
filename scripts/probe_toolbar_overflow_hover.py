#!/usr/bin/env python3
"""Probe: Compact Mode overflow placement + Settings/uBlock hover metrics."""

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
PORT = 2841
OUT = ROOT / ".tmp-content-scheme" / "toolbar-overflow-hover-probe.json"

PROBE_JS = r"""
function rect(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    id: el.id || el.className?.toString?.()?.slice(0, 60),
    tag: el.localName,
    parentId: el.parentElement?.id,
    x: Math.round(r.x), y: Math.round(r.y),
    w: Math.round(r.width), h: Math.round(r.height),
    display: cs.display, visibility: cs.visibility,
    overflowed: el.getAttribute('overflowedItem') === 'true',
    overflowsAttr: el.getAttribute('overflows'),
    borderRadius: cs.borderRadius,
    padding: cs.padding,
    bg: cs.backgroundColor,
  };
}
function hoverMetrics(sel) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!el) return { sel, present: false };
  const icon = el.querySelector('.toolbarbutton-icon, .toolbarbutton-badge-stack') || el;
  const elCs = getComputedStyle(el);
  const iconCs = getComputedStyle(icon);
  const er = el.getBoundingClientRect();
  const ir = icon.getBoundingClientRect();
  return {
    sel: typeof sel === 'string' ? sel : (el.id || el.className),
    present: true,
    el: { w: Math.round(er.width), h: Math.round(er.height), pad: elCs.padding, br: elCs.borderRadius, bg: elCs.backgroundColor },
    icon: { w: Math.round(ir.width), h: Math.round(ir.height), pad: iconCs.padding, br: iconCs.borderRadius, bg: iconCs.backgroundColor,
      innerPadVar: iconCs.getPropertyValue('--toolbarbutton-inner-padding'),
      radiusVar: iconCs.getPropertyValue('--toolbarbutton-border-radius') },
    btnInnerPad: elCs.getPropertyValue('--toolbarbutton-inner-padding'),
    btnRadius: elCs.getPropertyValue('--toolbarbutton-border-radius'),
    parent: el.parentElement?.id,
    overflowed: el.getAttribute('overflowedItem') === 'true' || el.closest('#widget-overflow-list') != null,
  };
}

const compact = document.getElementById('zen-toggle-compact-mode');
const compactBtn = compact?.querySelector('toolbarbutton') || compact;
const overflowList = document.getElementById('widget-overflow-list');
const inOverflow = !!(compact && (compact.parentElement?.id === 'widget-overflow-list' || compact.getAttribute('overflowedItem') === 'true'));
const inSidebar = !!(compact && compact.closest('#zen-sidebar-top-buttons'));
const reload = document.getElementById('reload-button') || document.querySelector('#stop-reload-button toolbarbutton, #reload-button');
const settings = document.getElementById('PanelUI-menu-button') || document.querySelector('#PanelUI-button toolbarbutton, #PanelUI-menu-button');
const ublock = document.querySelector('toolbarbutton.webextension-browser-action[data-extensionid*="ublock" i], toolbarbutton.webextension-browser-action[label*="uBlock" i], toolbarbutton.webextension-browser-action');
const ublockWrap = ublock?.closest('toolbaritem') || ublock?.parentElement;

return {
  layout: {
    single: document.documentElement.getAttribute('zen-single-toolbar'),
    compact: document.documentElement.getAttribute('zen-compact-mode'),
    expanded: document.documentElement.getAttribute('zen-sidebar-expanded'),
  },
  compactPlacement: {
    present: !!compact,
    inOverflow,
    inSidebar,
    parent: compact?.parentElement?.id,
    overflows: compact?.getAttribute('overflows'),
    overflowedItem: compact?.getAttribute('overflowedItem'),
    rect: rect(compact),
    btnRect: rect(compactBtn),
    visibleDirectly: !!(compact && inSidebar && !inOverflow && compact.getBoundingClientRect().width > 2),
  },
  overflowKids: overflowList ? [...overflowList.children].map(c => c.id || c.className?.toString?.()?.slice(0,40)).slice(0, 20) : [],
  hover: {
    reload: hoverMetrics(reload),
    settings: hoverMetrics(settings),
    compact: hoverMetrics(compactBtn),
    ublock: hoverMetrics(ublock),
    ublockWrap: ublockWrap ? {
      id: ublockWrap.id,
      tag: ublockWrap.localName,
      w: Math.round(ublockWrap.getBoundingClientRect().width),
      h: Math.round(ublockWrap.getBoundingClientRect().height),
      pad: getComputedStyle(ublockWrap).padding,
      br: getComputedStyle(ublockWrap).borderRadius,
      bg: getComputedStyle(ublockWrap).backgroundColor,
    } : null,
  },
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


def wait_port(port: int, seconds=90) -> bool:
    for _ in range(seconds):
        try:
            s = socket.create_connection(("127.0.0.1", port), timeout=2)
            s.close()
            return True
        except OSError:
            time.sleep(1)
    return False


def write_profile(prefs: dict) -> Path:
    d = Path(tempfile.mkdtemp(prefix="astra-probe-"))
    lines = []
    for k, v in prefs.items():
        if isinstance(v, bool):
            lines.append(f'user_pref("{k}", {str(v).lower()});')
        elif isinstance(v, int):
            lines.append(f'user_pref("{k}", {v});')
        else:
            lines.append(f'user_pref("{k}", "{v}");')
    (d / "user.js").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return d


def launch(profile: Path, port: int):
    subprocess.Popen(
        [str(EXE), "-marionette", "-remote-allow-system-access", "-no-remote",
         "-profile", str(profile), f"-marionette-port={port}", "-foreground"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def run_layout(single: bool, expanded: bool, scheme: int, label: str) -> dict:
    kill()
    prof = write_profile({
        "marionette.enabled": True,
        "marionette.port": PORT,
        "zen.welcome-screen.seen": True,
        "zen.view.use-single-toolbar": single,
        "zen.view.sidebar-expanded": expanded,
        "zen.view.window.scheme": scheme,
    })
    launch(prof, PORT)
    if not wait_port(PORT):
        raise RuntimeError("port timeout")
    m = M(PORT)
    m.start()
    m.ex(f"""
      Services.prefs.setBoolPref('zen.view.use-single-toolbar', {'true' if single else 'false'});
      Services.prefs.setBoolPref('zen.view.sidebar-expanded', {'true' if expanded else 'false'});
      Services.prefs.setIntPref('zen.view.window.scheme', {scheme});
      gZenVerticalTabsManager._updateEvent();
      return true;
    """)
    time.sleep(1.2)
    # Force overflow recheck
    m.ex("""
      if (gZenUIManager?.settleToolbarOverflow) {
        return gZenUIManager.settleToolbarOverflow();
      }
      window.dispatchEvent(new Event('resize'));
      return true;
    """)
    time.sleep(0.8)
    data = m.ex(PROBE_JS)
    # Also simulate hover styles via forced :hover isn't possible; read CSS vars + sizes at rest
    # Force :hover-equivalent by reading what would paint on icon
    hoverForced = m.ex(r"""
    function measureHover(sel) {
      const el = document.querySelector(sel);
      if (!el) return null;
      const icon = el.querySelector('.toolbarbutton-icon, .toolbarbutton-badge-stack') || el;
      // Temporarily set hover background as Firefox would
      const before = {
        elBg: getComputedStyle(el).backgroundColor,
        iconBg: getComputedStyle(icon).backgroundColor,
        elBr: getComputedStyle(el).borderRadius,
        iconBr: getComputedStyle(icon).borderRadius,
        elW: Math.round(el.getBoundingClientRect().width),
        elH: Math.round(el.getBoundingClientRect().height),
        iconW: Math.round(icon.getBoundingClientRect().width),
        iconH: Math.round(icon.getBoundingClientRect().height),
        innerPad: getComputedStyle(el).getPropertyValue('--toolbarbutton-inner-padding').trim(),
        radius: getComputedStyle(el).getPropertyValue('--toolbarbutton-border-radius').trim(),
      };
      el.setAttribute('data-probe-hover', 'true');
      // Apply synthetic hover class via style
      el.style.setProperty('background-color', 'transparent');
      const hoverBg = getComputedStyle(el).getPropertyValue('--toolbarbutton-hover-background').trim();
      icon.style.setProperty('background-color', hoverBg || 'rgba(128,128,128,0.2)');
      const after = {
        elBg: getComputedStyle(el).backgroundColor,
        iconBg: getComputedStyle(icon).backgroundColor,
        elBr: getComputedStyle(el).borderRadius,
        iconBr: getComputedStyle(icon).borderRadius,
        elW: Math.round(el.getBoundingClientRect().width),
        elH: Math.round(el.getBoundingClientRect().height),
        iconW: Math.round(icon.getBoundingClientRect().width),
        iconH: Math.round(icon.getBoundingClientRect().height),
        hoverBg,
      };
      icon.style.removeProperty('background-color');
      el.style.removeProperty('background-color');
      el.removeAttribute('data-probe-hover');
      return { before, after, id: el.id, className: el.className?.toString?.()?.slice(0,80) };
    }
    return {
      reload: measureHover('#reload-button, #stop-reload-button > toolbarbutton'),
      settings: measureHover('#PanelUI-menu-button'),
      compact: measureHover('#zen-toggle-compact-mode toolbarbutton, #zen-toggle-compact-mode'),
      ublock: measureHover('toolbarbutton.webextension-browser-action'),
      unified: measureHover('#unified-extensions-button'),
    };
    """)
    data["hoverForced"] = hoverForced
    data["label"] = label
    m.req("WebDriver:DeleteSession")
    shutil.rmtree(prof, ignore_errors=True)
    return data


def main():
    if not EXE.exists():
        raise SystemExit(f"missing {EXE}")
    # Ensure omni patched
    results = {
        "only_sidebar_light": run_layout(True, True, 1, "only_sidebar_light"),
        "only_sidebar_dark": run_layout(True, True, 0, "only_sidebar_dark"),
        "sidebar_top_light": run_layout(False, True, 1, "sidebar_top_light"),
    }
    OUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))
    print("wrote", OUT)


if __name__ == "__main__":
    prepare_probe_workspace(Path(__file__).resolve().parents[1], label="probe_toolbar_overflow_hover")
    main()
