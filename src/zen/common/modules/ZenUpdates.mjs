// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import createSidebarNotification from "chrome://browser/content/zen-components/ZenSidebarNotification.mjs";

const ZEN_UPDATE_PREF = "astra.updates.last-version";
const ZEN_BUILD_ID_PREF = "astra.updates.last-build-id";
const ZEN_UPDATE_SHOW = "astra.updates.show-update-notification";
const ZEN_UPDATE_NOTIFICATION_TIMEOUT_MS = 15000;
const ASTRA_UPDATE_LOG_PREF = "astra.updates.log-to-file";

function logAstraUpdateStatus() {
  if (!Services.prefs.getBoolPref(ASTRA_UPDATE_LOG_PREF, true)) {
    return;
  }
  try {
    const record = {
      t: new Date().toISOString(),
      version: Services.appinfo.version,
      buildID: Services.appinfo.appBuildID,
    };
    try {
      const um = Cc[
        "@mozilla.org/updates/update-manager;1"
      ].getService(Ci.nsIUpdateManager);
      const active = um.activeUpdate;
      if (active) {
        record.active = {
          state: active.state,
          statusText: active.statusText,
          buildID: active.buildID,
          appVersion: active.appVersion,
        };
      }
    } catch (e) {
      record.updateManagerError = String(e);
    }
    const line = JSON.stringify(record) + "\n";
    IOUtils.writeUTF8(
      PathUtils.join(PathUtils.profileDir, "astra-update-status.log"),
      line,
      { append: true }
    ).catch(e => console.warn("astra update log failed", e));
  } catch (e) {
    console.warn("astra update log failed", e);
  }
}

export default function checkForZenUpdates() {
  logAstraUpdateStatus();
  const version = Services.appinfo.version;
  const lastVersion = Services.prefs.getStringPref(ZEN_UPDATE_PREF, "");
  // Persist current version first so subsequent launches compare correctly.
  Services.prefs.setStringPref(ZEN_UPDATE_PREF, version);
  // First run (empty last-version): seed only — do not show "Update Complete!".
  if (!lastVersion) {
    return;
  }
  if (
    version === lastVersion ||
    gZenUIManager.testingEnabled ||
    !Services.prefs.getBoolPref(ZEN_UPDATE_SHOW, true)
  ) {
    return;
  }
  const updateUrl = Services.prefs.getStringPref(
    "app.releaseNotesURL.prompt",
    ""
  );
  createSidebarNotification({
    headingL10nId: "zen-sidebar-notification-updated-heading",
    autoHideMs: ZEN_UPDATE_NOTIFICATION_TIMEOUT_MS,
    links: [
      {
        url: Services.urlFormatter.formatURL(
          updateUrl.replace("%VERSION%", version)
        ),
        l10nId: "zen-sidebar-notification-updated",
        special: true,
        icon: "chrome://browser/skin/zen-icons/sparkles.svg",
      },
      {
        url: "about:astra-features",
        l10nId: "zen-sidebar-notification-donate",
        icon: "chrome://browser/skin/zen-icons/heart-circle-fill.svg",
      },
      {
        action: () => {
          Services.obs.notifyObservers(window, "restart-in-safe-mode");
        },
        l10nId: "zen-sidebar-notification-restart-safe-mode",
        icon: "chrome://browser/skin/zen-icons/security-broken.svg",
      },
    ],
  });
}

export async function createWindowUpdateAnimation() {
  const appID = Services.appinfo.appBuildID;
  if (
    Services.prefs.getStringPref(ZEN_BUILD_ID_PREF, "") === appID ||
    gZenUIManager.testingEnabled
  ) {
    return;
  }
  Services.prefs.setStringPref(ZEN_BUILD_ID_PREF, appID);
  await gZenWorkspaces.promiseInitialized;
  const appWrapper = document.getElementById("zen-main-app-wrapper");
  const element = document.createElement("div");
  element.id = "zen-update-animation";
  const elementBorder = document.createElement("div");
  elementBorder.id = "zen-update-animation-border";
  requestIdleCallback(() => {
    if (gReduceMotion) {
      return;
    }
    appWrapper.appendChild(element);
    appWrapper.appendChild(elementBorder);
    Promise.all([
      gZenUIManager.motion.animate(
        "#zen-update-animation",
        {
          top: ["100%", "-50%"],
          opacity: [0.5, 1],
        },
        {
          duration: 0.35,
        }
      ),
      gZenUIManager.motion.animate(
        "#zen-update-animation-border",
        {
          "--background-top": ["150%", "-50%"],
        },
        {
          duration: 0.35,
          delay: 0.08,
        }
      ),
    ]).then(() => {
      element.remove();
      elementBorder.remove();
    });
  });
}
