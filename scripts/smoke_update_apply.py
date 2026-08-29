#!/usr/bin/env python3
"""Existing-install AUS apply→restart smoke test.

Requires a packaged Astra tree at the PREVIOUS buildID (not a fresh installer
run). Serves or fetches update.xml, downloads the complete MAR, applies, restarts,
and asserts Services.appinfo.appBuildID changed to --expect-buildid.

This is the only proof that updates work. Fresh-install tests do not count.
"""

from __future__ import annotations

from probe_disk_guard import prepare_probe_workspace
import argparse
import base64
import hashlib
import http.server
import json
import shutil
import socket
import subprocess
import threading
import time
from pathlib import Path


class Marionette:
    def __init__(self, port: int):
        self.port = port
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=30)
        self._id = 0
        self._read()

    def _read(self, timeout: float = 300):
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

    def req(self, name, params=None, timeout=300):
        self._id += 1
        payload = json.dumps([0, self._id, name, params or {}]).encode("utf-8")
        self.sock.sendall(f"{len(payload)}:".encode("ascii") + payload)
        resp = self._read(timeout=timeout)
        if resp[2]:
            raise RuntimeError(f"{name}: {resp[2]}")
        return resp[3]

    def start(self):
        self.req("WebDriver:NewSession", {"capabilities": {}}, timeout=180)
        self.req("WebDriver:SetTimeouts", {"script": 600000})
        self.req("Marionette:SetContext", {"value": "chrome"})

    def ex(self, script, timeout=300):
        return self.req(
            "WebDriver:ExecuteScript",
            {"script": script, "args": [], "sandbox": "chrome", "newSandbox": True},
            timeout=timeout,
        )["value"]


IDENTITY = """
return {
  name: Services.appinfo.name,
  version: Services.appinfo.version,
  buildID: Services.appinfo.appBuildID,
  platformVersion: Services.appinfo.platformVersion,
};
"""

APPLY_CYCLE = r"""
Services.prefs.setBoolPref('app.update.enabled', true);
Services.prefs.setBoolPref('app.update.auto', false);
Services.prefs.setBoolPref('app.update.staging.enabled', true);
Services.prefs.setBoolPref('app.update.log', true);
Services.prefs.setBoolPref('app.update.disabledForTesting', false);
// Official branding bakes app.update.url; override-alone was ignored on 153.
// Pin both prefs to the local AUS before the checker runs.
const LOCAL_AUS = '__LOCAL_AUS__';
Services.prefs.setCharPref('app.update.url', LOCAL_AUS);
Services.prefs.setCharPref('app.update.url.override', LOCAL_AUS);

let aus = Cc['@mozilla.org/updates/update-service;1'].getService(Ci.nsIApplicationUpdateService);
const checker = Cc['@mozilla.org/updates/update-checker;1'].getService(Ci.nsIUpdateChecker);

function waitPromise(p, ms) {
  let done = undefined;
  let err = undefined;
  p.then(v => { done = v; }, e => { err = String(e); });
  const start = Date.now();
  Services.tm.spinEventLoopUntil('astra-update-wait', () => {
    return done !== undefined || err !== undefined || (Date.now() - start > ms);
  });
  if (err) throw new Error(err);
  if (done === undefined) throw new Error('timeout waiting promise after ' + ms + 'ms');
  return done;
}

let updateURL;
try {
  const maybe = checker.getUpdateURL(Ci.nsIUpdateChecker.FOREGROUND_CHECK);
  updateURL = (maybe && typeof maybe.then === 'function') ? waitPromise(maybe, 30000) : maybe;
} catch (e) {
  updateURL = 'err:' + e;
}
if (String(updateURL).indexOf('127.0.0.1') < 0) {
  let policies = {};
  try { policies = Services.policies.getActivePolicies(); } catch (e) {}
  return {
    phase: 'check',
    updateURL,
    appinfoUpdateURL: String(Services.appinfo.updateURL || ''),
    prefUrl: Services.prefs.getCharPref('app.update.url', ''),
    prefOverride: Services.prefs.getCharPref('app.update.url.override', ''),
    policyAppUpdateURL: policies.AppUpdateURL ? String(policies.AppUpdateURL) : null,
    error: 'checker is not using local AUS; refusing to download a live MAR',
  };
}

let checkResult;
const check = checker.checkForUpdates(Ci.nsIUpdateChecker.FOREGROUND_CHECK);
if (check && check.result && typeof check.result.then === 'function') {
  checkResult = waitPromise(check.result, 120000);
} else if (check && typeof check.then === 'function') {
  checkResult = waitPromise(check, 120000);
} else {
  checkResult = check;
}

const updates = checkResult.updates || [];
const mapped = [];
for (const u of updates) {
  const patches = [];
  for (let i = 0; i < u.patchCount; i++) {
    const p = u.getPatchAt(i);
    patches.push({ type: p.type, URL: p.URL, size: String(p.size) });
  }
  mapped.push({
    appVersion: u.appVersion,
    buildID: u.buildID,
    displayVersion: u.displayVersion,
    patches,
  });
}
if (!updates.length) {
  return { phase: 'check', updateURL, updates: mapped, error: 'no updates offered' };
}

const update = updates[0];
let downloadState = null;
try {
  const dl = aus.downloadUpdate(update, false);
  if (dl && typeof dl.then === 'function') {
    downloadState = waitPromise(dl, 600000);
  }
  const start = Date.now();
  Services.tm.spinEventLoopUntil('astra-dl-wait', () => {
    const st = String(update.state);
    if (
      st === 'pending' ||
      st === 'pending-service' ||
      st === 'pending-elevate' ||
      st === 'succeeded' ||
      st === 'failed' ||
      st === 'download-failed' ||
      st === 'pending-wait'
    ) {
      downloadState = st;
      return true;
    }
    return Date.now() - start > 600000;
  });
} catch (e) {
  return {
    phase: 'download',
    updateURL,
    updates: mapped,
    error: String(e),
    state: String(update.state),
    statusText: update.statusText || null,
  };
}

return {
  phase: 'after-download',
  updateURL,
  updates: mapped,
  downloadState: String(downloadState),
  updateState: String(update.state),
  statusText: update.statusText || null,
};
"""


def wait_port(port: int, timeout: float = 120) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return
        except OSError:
            time.sleep(0.4)
    raise RuntimeError(f"marionette port {port} timeout")


def sha512_file(path: Path) -> str:
    h = hashlib.sha512()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_update_xml(dest: Path, version: str, platform_version: str, build_id: str, url: str, mar: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<updates>
  <update type="minor" displayVersion="{version}" appVersion="{version}" platformVersion="{platform_version}" buildID="{build_id}">
    <patch type="complete" URL="{url}" hashFunction="sha512" hashValue="{sha512_file(mar)}" size="{mar.stat().st_size}"/>
  </update>
</updates>
"""
    dest.write_text(xml, encoding="utf-8")


def pin_local_aus_policy(install_dir: Path, url: str) -> Path:
    """Firefox 153 CheckerService uses Services.appinfo.updateURL, then
    policies.AppUpdateURL. Prefs (app.update.url / .override) are ignored.
    Pin the enterprise policy so the real checker hits local AUS.
    """
    dest = install_dir / "distribution" / "policies.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    data: dict = {"policies": {}}
    if dest.is_file():
        try:
            data = json.loads(dest.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            data = {"policies": {}}
    policies = data.setdefault("policies", {})
    policies["AppUpdateURL"] = url
    dest.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return dest


def collect_update_logs(install_dir: Path) -> dict[str, str]:
    logs = {}
    for pattern in ("updates/**/update.log", "updates/last-update.log", "update.log"):
        for path in install_dir.glob(pattern):
            if path.is_file():
                logs[str(path)] = path.read_text(encoding="utf-8", errors="replace")[-8000:]
    return logs


def launch(exe: Path, profile: Path, port: int, override_url: str = "") -> subprocess.Popen:
    profile.mkdir(parents=True, exist_ok=True)
    lines = [
        'user_pref("marionette.enabled", true);',
        f'user_pref("marionette.port", {port});',
        'user_pref("browser.shell.checkDefaultBrowser", false);',
        'user_pref("browser.startup.homepage_override.mstone", "ignore");',
        'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
        'user_pref("toolkit.telemetry.enabled", false);',
        'user_pref("zen.welcome-screen.seen", true);',
        'user_pref("browser.startup.page", 0);',
        'user_pref("app.update.enabled", true);',
        'user_pref("app.update.auto", false);',
        'user_pref("app.update.disabledForTesting", false);',
        'user_pref("app.update.log", true);',
        'user_pref("app.update.staging.enabled", true);',
        'user_pref("astra.updates.log-to-file", true);',
    ]
    if override_url:
        lines.append(f'user_pref("app.update.url", "{override_url}");')
        lines.append(f'user_pref("app.update.url.override", "{override_url}");')
    (profile / "user.js").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return subprocess.Popen(
        [
            str(exe),
            "-marionette",
            "-remote-allow-system-access",
            "-no-remote",
            "-profile",
            str(profile),
            f"-marionette-port={port}",
            "-foreground",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def kill(proc: subprocess.Popen) -> None:
    proc.terminate()
    try:
        proc.wait(timeout=20)
    except subprocess.TimeoutExpired:
        proc.kill()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exe", required=True, type=Path)
    parser.add_argument("--expect-buildid", required=True)
    parser.add_argument("--expect-version", default="")
    parser.add_argument("--mar", type=Path, default=None)
    parser.add_argument("--version", default="1.19.9b")
    parser.add_argument("--platform-version", default="153.0.4")
    parser.add_argument("--work", type=Path, default=Path(".tmp-update-smoke"))
    parser.add_argument("--port", type=int, default=2888)
    parser.add_argument("--aus-port", type=int, default=8766)
    parser.add_argument("--live-xml", default="", help="If set, use this update.xml instead of local AUS")
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args()

    exe = args.exe.resolve()
    install_dir = exe.parent
    work = args.work.resolve()
    work.mkdir(parents=True, exist_ok=True)
    profile = work / "profile"
    if profile.exists():
        shutil.rmtree(profile, ignore_errors=True)
    report: dict = {
        "exe": str(exe),
        "expectBuildID": args.expect_buildid,
        "beforeDisk": (install_dir / "application.ini").read_text(encoding="utf-8", errors="replace")
        if (install_dir / "application.ini").exists()
        else None,
    }

    httpd = None
    if not args.live_xml:
        if not args.mar or not args.mar.is_file():
            raise SystemExit("--mar is required unless --live-xml is set")
        aus_root = work / "aus"
        if aus_root.exists():
            shutil.rmtree(aus_root)
        aus_root.mkdir(parents=True)
        shutil.copy2(args.mar, aus_root / "windows.mar")
        write_update_xml(
            aus_root / "browser" / "WINNT_x86_64-msvc-x64" / "release" / "update.xml",
            args.version,
            args.platform_version,
            args.expect_buildid,
            f"http://127.0.0.1:{args.aus_port}/windows.mar",
            args.mar,
        )
        write_update_xml(
            aus_root / "browser" / "WINNT_x86_64-msvc" / "release" / "update.xml",
            args.version,
            args.platform_version,
            args.expect_buildid,
            f"http://127.0.0.1:{args.aus_port}/windows.mar",
            args.mar,
        )

        handler_cls = type(
            "H",
            (http.server.SimpleHTTPRequestHandler,),
            {"directory": str(aus_root), "log_message": lambda self, fmt, *a: None},
        )

        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *a, **k):
                super().__init__(*a, directory=str(aus_root), **k)

            def log_message(self, fmt, *a):
                return

        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", args.aus_port), Handler)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        report["aus"] = f"http://127.0.0.1:{args.aus_port}/"

        # Point this install at local AUS for the smoke only.
        ini = install_dir / "application.ini"
        text = ini.read_text(encoding="utf-8")
        text = text.replace(
            "https://hrishikeshmind.github.io/astradesktop/updates/browser/%BUILD_TARGET%/%CHANNEL%/update.xml",
            f"http://127.0.0.1:{args.aus_port}/browser/%BUILD_TARGET%/%CHANNEL%/update.xml",
        )
        ini.write_text(text, encoding="utf-8")
        report["rewroteAppUpdateURL"] = True
        override_url = f"http://127.0.0.1:{args.aus_port}/browser/%BUILD_TARGET%/%CHANNEL%/update.xml"
        concrete = (
            f"http://127.0.0.1:{args.aus_port}/browser/WINNT_x86_64-msvc-x64/release/update.xml"
        )
        pin_local_aus_policy(install_dir, concrete)
        report["pinnedAppUpdateURLPolicy"] = concrete
    else:
        override_url = args.live_xml

    proc = launch(exe, profile, args.port, override_url=override_url)
    report["pid1"] = proc.pid
    try:
        wait_port(args.port)
        m = Marionette(args.port)
        m.start()
        time.sleep(2)
        report["before"] = m.ex(IDENTITY, timeout=60)
        if report["before"].get("buildID") == args.expect_buildid:
            report["error"] = "client already at expected buildID; this is not an existing-install upgrade"
            print(json.dumps(report, indent=2))
            return 1
        cycle_js = APPLY_CYCLE.replace(
            "__LOCAL_AUS__",
            f"http://127.0.0.1:{args.aus_port}/browser/WINNT_x86_64-msvc-x64/release/update.xml",
        )
        report["cycle"] = m.ex(cycle_js, timeout=700)
        try:
            m.ex(
                "try { Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit); } catch (e) { try { window.close(); } catch (e2) {} } return true;",
                timeout=30,
            )
        except Exception:
            pass
        try:
            proc.wait(timeout=60)
        except subprocess.TimeoutExpired:
            proc.kill()

        time.sleep(3)
        report["updateLogsAfterDownload"] = collect_update_logs(install_dir)
        # Staged Windows applies leave <install>/updated/ then swap on next start.
        deadline = time.time() + 180
        updated_ini = install_dir / "updated" / "application.ini"
        while time.time() < deadline:
            if updated_ini.is_file():
                report["stagedUpdatedIni"] = updated_ini.read_text(
                    encoding="utf-8", errors="replace"
                )
                break
            time.sleep(2)
        time.sleep(8)

        proc2 = launch(exe, profile, args.port, override_url=override_url)
        report["pid2"] = proc2.pid
        wait_port(args.port, timeout=180)
        time.sleep(8)
        m2 = Marionette(args.port)
        m2.start()
        time.sleep(2)
        report["after"] = m2.ex(IDENTITY, timeout=60)
        try:
            m2.ex(
                "try { Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit); } catch (e) { try { window.close(); } catch (e2) {} } return true;",
                timeout=30,
            )
        except Exception:
            pass
        kill(proc2)
    except Exception as exc:
        report["error"] = str(exc)
        kill(proc)
        report["updateLogs"] = collect_update_logs(install_dir)
        if args.report:
            args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2)[:8000])
        return 1
    finally:
        if httpd:
            httpd.shutdown()

    report["updateLogs"] = collect_update_logs(install_dir)
    after_ini = install_dir / "application.ini"
    report["afterDisk"] = after_ini.read_text(encoding="utf-8", errors="replace") if after_ini.exists() else None
    after = report.get("after") or {}
    ok = after.get("buildID") == args.expect_buildid
    if args.expect_version:
        ok = ok and after.get("version") == args.expect_version
    report["applied"] = ok
    if args.report:
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2)[:8000])
    return 0 if ok else 1


if __name__ == "__main__":
    prepare_probe_workspace(Path(__file__).resolve().parents[1], label="smoke_update_apply")
    raise SystemExit(main())
