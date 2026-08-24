// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Low Bandwidth Mode — applies only Gecko 153 levers verified against Astra:
 *   PASS  media.autoplay.default = 5 (block playback)
 *   PASS  permissions.default.image = 2 (optional; Firefox image permission)
 *   PASS  browser.display.use_document_fonts = 0 (skip @font-face downloads)
 *   PASS  Save-Data: on  via http-on-modify-request (site-cooperative)
 *   FAIL  media.preload.default (unset; DOM preload=none too late to stop fetch)
 *   FAIL  built-in Save-Data pref (does not exist in this build)
 *
 * Snapshots the previous user values so turning the mode off restores them.
 */

const kEnabled = "zen.performance.low-bandwidth-mode.enabled";
const kBlockAutoplay = "zen.performance.low-bandwidth-mode.block-autoplay";
const kBlockImages = "zen.performance.low-bandwidth-mode.block-images";
const kBlockFonts = "zen.performance.low-bandwidth-mode.block-fonts";
const kRestore = "zen.performance.low-bandwidth-mode.restore";

const kAutoplay = "media.autoplay.default";
const kImages = "permissions.default.image";
const kFonts = "browser.display.use_document_fonts";

const AUTOPLAY_BLOCK_ALL = 5;
const IMAGES_DENY = 2;
const FONTS_SYSTEM_ONLY = 0;

const OBSERVED = [kEnabled, kBlockAutoplay, kBlockImages, kBlockFonts];

export class ZenLowBandwidthMode {
  #prefObserver = null;
  #httpObserver = null;
  #applying = false;

  init() {
    if (!this.#prefObserver) {
      this.#prefObserver = () => this.apply();
      for (const pref of OBSERVED) {
        Services.prefs.addObserver(pref, this.#prefObserver);
      }
    }
    this.apply();
  }

  apply() {
    if (this.#applying) {
      return;
    }
    this.#applying = true;
    try {
      const enabled = Services.prefs.getBoolPref(kEnabled, false);
      if (!enabled) {
        this.#restoreAll();
        this.#setSaveData(false);
        return;
      }
      if (Services.prefs.getBoolPref(kBlockAutoplay, true)) {
        this.#applyInt(kAutoplay, AUTOPLAY_BLOCK_ALL);
      } else {
        this.#restoreOne(kAutoplay);
      }
      if (Services.prefs.getBoolPref(kBlockImages, false)) {
        this.#applyInt(kImages, IMAGES_DENY);
      } else {
        this.#restoreOne(kImages);
      }
      if (Services.prefs.getBoolPref(kBlockFonts, true)) {
        this.#applyInt(kFonts, FONTS_SYSTEM_ONLY);
      } else {
        this.#restoreOne(kFonts);
      }
      this.#setSaveData(true);
    } finally {
      this.#applying = false;
    }
  }

  #readBag() {
    try {
      const raw = Services.prefs.getStringPref(kRestore, "");
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  #writeBag(bag) {
    if (!bag || !Object.keys(bag).length) {
      Services.prefs.clearUserPref(kRestore);
      return;
    }
    Services.prefs.setStringPref(kRestore, JSON.stringify(bag));
  }

  #snapshotIfNeeded(pref) {
    const bag = this.#readBag();
    if (bag[pref]) {
      return;
    }
    bag[pref] = {
      hasUser: Services.prefs.prefHasUserValue(pref),
      value: Services.prefs.getIntPref(pref, 0),
    };
    this.#writeBag(bag);
  }

  #applyInt(pref, value) {
    this.#snapshotIfNeeded(pref);
    if (Services.prefs.getIntPref(pref, 0) !== value) {
      Services.prefs.setIntPref(pref, value);
    }
  }

  #restoreOne(pref) {
    const bag = this.#readBag();
    const snap = bag[pref];
    if (!snap) {
      return;
    }
    if (snap.hasUser) {
      Services.prefs.setIntPref(pref, snap.value);
    } else {
      Services.prefs.clearUserPref(pref);
    }
    delete bag[pref];
    this.#writeBag(bag);
  }

  #restoreAll() {
    for (const pref of [kAutoplay, kImages, kFonts]) {
      this.#restoreOne(pref);
    }
  }

  #setSaveData(on) {
    if (on && !this.#httpObserver) {
      this.#httpObserver = {
        observe(subject, topic) {
          if (topic !== "http-on-modify-request") {
            return;
          }
          try {
            const channel = subject.QueryInterface(Ci.nsIHttpChannel);
            const spec = channel.URI?.spec || "";
            if (
              !channel.URI?.schemeIs("https") &&
              !channel.URI?.schemeIs("http")
            ) {
              return;
            }
            if (spec.startsWith("https://firefox.settings.services.mozilla.com/")) {
              return;
            }
            channel.setRequestHeader("Save-Data", "on", false);
          } catch {
            // Channel may be immutable; ignore.
          }
        },
      };
      Services.obs.addObserver(this.#httpObserver, "http-on-modify-request");
      return;
    }
    if (!on && this.#httpObserver) {
      try {
        Services.obs.removeObserver(this.#httpObserver, "http-on-modify-request");
      } catch {
        // already removed
      }
      this.#httpObserver = null;
    }
  }
}

export const gZenLowBandwidthMode = new ZenLowBandwidthMode();
