#!/usr/bin/env python3
"""Phase 2B App Hub icon resolution pipeline — local quick-verify.

1) Patch astra-run omni.ja with current App Hub sources
2) Temp profile: visit meet / linkedin / digilocker / chatgpt once (seed Places)
3) Open App Hub, wait for icon enrichment
4) Report which resolution step each of the 4 apps hit (from console + DOM)
"""

from __future__ import annotations

from probe_disk_guard import prepare_probe_workspace
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from marionette_driver.by import By
from marionette_driver.marionette import Marionette
from marionette_driver.wait import Wait

ROOT = Path(r"c:\ZenFork\astradesktop")
ASTRA = ROOT / ".tmp-tb-diag" / "astra-run" / "astra.exe"
OUT_DIR = ROOT / ".tmp-apphub-verify"
PORT = 2829

TARGET_APPS = [
    ("google-meet", "https://meet.google.com/"),
    ("linkedin", "https://www.linkedin.com/"),
    ("digilocker", "https://www.digilocker.gov.in/"),
    ("chatgpt", "https://chatgpt.com/"),
]


def patch_omni() -> None:
    script = ROOT / "scripts" / "patch_omni_apphub_dnd.py"
    subprocess.check_call([sys.executable, str(script)], cwd=str(ROOT))


def launch(profile: Path) -> subprocess.Popen:
    profile.mkdir(parents=True, exist_ok=True)
    (profile / "user.js").write_text(
        "\n".join(
            [
                'user_pref("marionette.enabled", true);',
                f'user_pref("marionette.port", {PORT});',
                'user_pref("browser.shell.checkDefaultBrowser", false);',
                'user_pref("browser.startup.homepage_override.mstone", "ignore");',
                'user_pref("startup.homepage_welcome_url", "about:blank");',
                'user_pref("startup.homepage_welcome_url.additional", "");',
                'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
                'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
                'user_pref("app.update.enabled", false);',
                'user_pref("browser.tabs.warnOnClose", false);',
                'user_pref("astra.apphub.enabled", true);',
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    log = OUT_DIR / "phase2b_browser.log"
    log_f = open(log, "w", encoding="utf-8", errors="replace")
    return subprocess.Popen(
        [
            str(ASTRA),
            "-no-remote",
            "-profile",
            str(profile),
            "-marionette",
            "-remote-allow-system-access",
            "-foreground",
        ],
        cwd=str(ASTRA.parent),
        stdout=log_f,
        stderr=subprocess.STDOUT,
    )


def connect(timeout: float = 120.0) -> Marionette:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            client = Marionette("127.0.0.1", port=PORT)
            client.start_session()
            return client
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(1.0)
    raise RuntimeError(f"marionette connect failed: {last}")


def visit_and_wait(m: Marionette, url: str, settle: float = 4.0) -> None:
    print("visit", url)
    m.navigate(url)
    time.sleep(settle)
    # Nudge Places favicon capture.
    try:
        m.execute_script(
            """
            const { PlacesUtils } = ChromeUtils.importESModule(
              "resource://gre/modules/PlacesUtils.sys.mjs"
            );
            // Touch history entry; favicon often arrives shortly after load.
            return true;
            """
        )
    except Exception:
        pass
    time.sleep(1.5)


def open_app_hub(m: Marionette) -> None:
    m.set_context(m.CONTEXT_CHROME)
    opened = m.execute_script(
        """
        const win = Services.wm.getMostRecentWindow("navigator:browser");
        if (!win) return "no-window";
        win.focus();
        const hub = win.gAstraAppHub || win.gZenAppHubController || null;
        if (hub?.open) {
          hub.open();
          return "hub.open";
        }
        const btn = win.document.getElementById("zen-app-launcher-button")
          || win.document.getElementById("astra-app-hub-button");
        if (btn) {
          btn.click();
          return "button-click";
        }
        // Fallback: synthesize panel open via bootstrap.
        try {
          win.gZenUIManager?.openAppHub?.();
          return "ui-manager";
        } catch (e) {
          return String(e);
        }
        """
    )
    print("open_app_hub:", opened)
    time.sleep(2.0)


def collect_results(m: Marionette) -> dict:
    m.set_context(m.CONTEXT_CHROME)
    return m.execute_async_script(
        """
        const resolve = arguments[0];
        const ids = ["google-meet", "linkedin", "digilocker", "chatgpt"];
        (async () => {
          const win = Services.wm.getMostRecentWindow("navigator:browser");
          const { resolveAppIcon, resolveAppFaviconWithSource, isStrongPackagedMark, getPackagedIconURL } =
            ChromeUtils.importESModule(
              "chrome://browser/content/zen-components/AstraAppHubIcons.mjs"
            );
          const { ASTRA_APP_HUB_CATALOG } = ChromeUtils.importESModule(
            "chrome://browser/content/zen-components/AstraAppHubCatalog.mjs"
          );
          const { gAstraAppHubState } = ChromeUtils.importESModule(
            "chrome://browser/content/zen-components/AstraAppHubState.mjs"
          );
          await gAstraAppHubState.load();

          const out = { apps: {}, catalogHasChatgpt: false, suggested: [] };
          out.catalogHasChatgpt = ASTRA_APP_HUB_CATALOG.apps.some(a => a.id === "chatgpt");

          for (const id of ids) {
            const app = ASTRA_APP_HUB_CATALOG.apps.find(a => a.id === id);
            if (!app) {
              out.apps[id] = { error: "missing-from-catalog" };
              continue;
            }
            const cache = gAstraAppHubState.data.resolvedIconCache?.[id];
            const merged = {
              ...app,
              builtin: true,
              cachedFaviconData: cache?.data || "",
              cachedFaviconFetchedAt: cache?.fetchedAt || 0,
              iconUpdatedAt: cache?.fetchedAt || 0,
            };
            const sync = resolveAppIcon(merged);
            let live = null;
            try {
              live = await resolveAppFaviconWithSource(app.url, {
                privateBrowsing: false,
                allowRemote: true,
              });
            } catch (e) {
              live = { error: String(e) };
            }
            // DOM tile evidence
            let dom = null;
            try {
              const panel = win.document.getElementById("PanelUI-zen-app-launcher")
                || win.document.querySelector("#PanelUI-zen-app-launcher, .astra-app-hub-panel");
              const btn = panel?.querySelector?.(`.astra-app-hub-item[data-app-id="${id}"]`);
              const img = btn?.querySelector?.(".astra-app-hub-item-icon");
              const stack = btn?.querySelector?.(".astra-app-hub-item-icon-stack");
              dom = {
                present: Boolean(btn),
                hasImg: Boolean(img),
                imgSrcKind: img?.src
                  ? (img.src.startsWith("data:")
                      ? "data"
                      : img.src.startsWith("chrome:")
                        ? "chrome"
                        : img.src.slice(0, 24))
                  : null,
                iconLoaded: stack?.getAttribute("data-icon-loaded") || null,
                name: btn?.getAttribute("aria-label") || null,
              };
            } catch (e) {
              dom = { error: String(e) };
            }
            out.apps[id] = {
              strongMark: isStrongPackagedMark(app.iconKey || app.id),
              hasPackaged: Boolean(getPackagedIconURL(app.iconKey || app.id)),
              syncIconSource: sync.iconSource,
              syncNeedsResolution: sync.needsIconResolution,
              cachedInState: Boolean(cache?.data),
              liveSource: live?.source || (live?.error ? `error:${live.error}` : null),
              liveHasData: Boolean(live?.dataURI),
              liveDataPrefix: live?.dataURI ? live.dataURI.slice(0, 32) : null,
              dom,
            };
          }

          // Suggested row snapshot
          try {
            const panel = win.document.getElementById("PanelUI-zen-app-launcher");
            const suggested = panel?.querySelectorAll?.(
              "[data-section='__suggested__'] .astra-app-hub-item, .astra-app-hub-suggested .astra-app-hub-item"
            );
            if (suggested?.length) {
              out.suggested = [...suggested].slice(0, 8).map(el => ({
                id: el.getAttribute("data-app-id"),
                name: el.getAttribute("aria-label"),
                hasImg: Boolean(el.querySelector(".astra-app-hub-item-icon")),
                srcKind: (() => {
                  const s = el.querySelector(".astra-app-hub-item-icon")?.src || "";
                  if (s.startsWith("data:")) return "data";
                  if (s.startsWith("chrome:")) return "chrome";
                  return s ? s.slice(0, 24) : "monogram";
                })(),
              }));
            }
          } catch (e) {
            out.suggestedError = String(e);
          }

          // Pin defaults snapshot
          try {
            const panel = win.document.getElementById("PanelUI-zen-app-launcher");
            const pinned = panel?.querySelectorAll?.(
              ".astra-app-hub-item[data-favorite='true'], [data-section='__favorites__'] .astra-app-hub-item, [data-section='__pinned__'] .astra-app-hub-item"
            );
            out.pinned = [...(pinned || [])].slice(0, 16).map(el => ({
              id: el.getAttribute("data-app-id"),
              name: el.getAttribute("aria-label"),
              hasImg: Boolean(el.querySelector(".astra-app-hub-item-icon")),
              srcKind: (() => {
                const s = el.querySelector(".astra-app-hub-item-icon")?.src || "";
                if (s.startsWith("data:")) return "data";
                if (s.startsWith("chrome:")) return "chrome";
                return s ? s.slice(0, 24) : "monogram";
              })(),
            }));
          } catch (e) {
            out.pinnedError = String(e);
          }

          resolve(out);
        })().catch(err => resolve({ fatal: String(err) }));
        """
    )


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not ASTRA.exists():
        print("missing astra-run", ASTRA, file=sys.stderr)
        return 2

    print("=== patch omni ===")
    patch_omni()

    profile = Path(tempfile.mkdtemp(prefix="astra-apphub-2b-"))
    print("profile", profile)
    proc = launch(profile)
    results = {"profile": str(profile), "apps": {}}
    try:
        m = connect()
        m.set_context(m.CONTEXT_CONTENT)
        for _id, url in TARGET_APPS:
            visit_and_wait(m, url)
        open_app_hub(m)
        # Allow enrichment (Places + possible remote) to finish.
        time.sleep(12.0)
        # Re-open to pick up painted/cached state after enrichment.
        open_app_hub(m)
        time.sleep(3.0)
        payload = collect_results(m)
        results.update(payload if isinstance(payload, dict) else {"raw": payload})
        out_path = OUT_DIR / "phase2b_icon_resolve.json"
        out_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
        print("wrote", out_path)
        print(json.dumps(results.get("apps", results), indent=2))
        try:
            m.delete_session()
        except Exception:
            pass
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=10)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
    return 0


if __name__ == "__main__":
    prepare_probe_workspace(Path(__file__).resolve().parents[1], label="marionette_apphub_phase2b_icons")
    raise SystemExit(main())
