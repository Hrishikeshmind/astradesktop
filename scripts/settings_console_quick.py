#!/usr/bin/env python3
"""Quick settings-console probe after zen-settings fix."""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from pathlib import Path

from marionette_driver.marionette import Marionette

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / ".tmp-beta-polish" / "astra-live-verify" / "astra.exe"
OUT = ROOT / ".tmp-beta-polish" / "console-audit"
PORT = 2913

PROBE = r"""
const done = arguments[arguments.length - 1];
(async () => {
  const hits = [];
  const parse = msg => {
    try {
      const err = msg.QueryInterface(Ci.nsIScriptError);
      hits.push({
        level: err.flags & Ci.nsIScriptError.errorFlag ? "error" : "warn",
        message: err.errorMessage || err.message,
        source: err.sourceName,
        line: err.lineNumber,
      });
    } catch {
      try { hits.push({ level: "log", message: msg.message }); } catch {}
    }
  };
  for (const m of Services.console.getMessageArray()) parse(m);
  const listener = { observe: parse };
  Services.console.registerListener(listener);
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  const prefsWin = Services.ww.openWindow(
    win, "chrome://browser/content/preferences/preferences.xhtml", "_blank", "chrome,dialog=no,all", null
  );
  await new Promise(r => setTimeout(r, 2500));
  prefsWin.document.getElementById("category-general")?.click();
  await new Promise(r => setTimeout(r, 500));
  Services.console.unregisterListener(listener);
  const interesting = hits.filter(h =>
    /intl\.multilingual|zenWorkspace|homepage|zoomValues/i.test(h.message || "")
  );
  done({ interesting, total: hits.length });
})().catch(e => done({ error: String(e) }));
"""


def main() -> None:
    profile = OUT / "profile-settings-quick"
    shutil.rmtree(profile, ignore_errors=True)
    profile.mkdir(parents=True)
    (profile / "user.js").write_text(
        f'user_pref("marionette.enabled", true);\nuser_pref("marionette.port", {PORT});\n'
        'user_pref("zen.welcome-screen.seen", true);\n',
        encoding="utf-8",
    )
    proc = subprocess.Popen(
        [str(EXE), "-no-remote", "-profile", str(profile), "-marionette", "-remote-allow-system-access"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    client = None
    for _ in range(60):
        try:
            client = Marionette("127.0.0.1", port=PORT)
            client.start_session()
            break
        except Exception:
            time.sleep(1)
    if not client:
        proc.kill()
        raise SystemExit("no marionette")
    time.sleep(2)
    client.set_context(client.CONTEXT_CHROME)
    result = client.execute_async_script(PROBE, script_timeout=60000)
    (OUT / "settings_quick.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    client.delete_session()
    proc.terminate()


if __name__ == "__main__":
    main()
