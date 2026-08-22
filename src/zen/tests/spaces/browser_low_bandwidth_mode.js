/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const ZEN_PREFS = [
  "zen.performance.low-bandwidth-mode.enabled",
  "zen.performance.low-bandwidth-mode.block-autoplay",
  "zen.performance.low-bandwidth-mode.block-images",
  "zen.performance.low-bandwidth-mode.block-fonts",
  "zen.performance.low-bandwidth-mode.restore",
];

const TARGET_PREFS = [
  "media.autoplay.default",
  "permissions.default.image",
  "browser.display.use_document_fonts",
];

add_setup(async function () {
  const { gZenLowBandwidthMode } = ChromeUtils.importESModule(
    "chrome://browser/content/ZenLowBandwidthMode.mjs"
  );
  gZenLowBandwidthMode.init();
});

add_task(async function test_low_bandwidth_mode_applies_and_restores() {
  registerCleanupFunction(() => {
    for (const pref of [...ZEN_PREFS, ...TARGET_PREFS]) {
      Services.prefs.clearUserPref(pref);
    }
  });

  Services.prefs.setIntPref("media.autoplay.default", 1);
  Services.prefs.setIntPref("permissions.default.image", 1);
  Services.prefs.setIntPref("browser.display.use_document_fonts", 1);

  Services.prefs.setBoolPref("zen.performance.low-bandwidth-mode.enabled", false);
  Services.prefs.setBoolPref("zen.performance.low-bandwidth-mode.block-autoplay", true);
  Services.prefs.setBoolPref("zen.performance.low-bandwidth-mode.block-images", true);
  Services.prefs.setBoolPref("zen.performance.low-bandwidth-mode.block-fonts", true);

  Services.prefs.setBoolPref("zen.performance.low-bandwidth-mode.enabled", true);

  await TestUtils.waitForCondition(
    () =>
      Services.prefs.getIntPref("media.autoplay.default", 1) === 5 &&
      Services.prefs.getIntPref("permissions.default.image", 1) === 2 &&
      Services.prefs.getIntPref("browser.display.use_document_fonts", 1) === 0,
    "Low bandwidth mode should apply verified data-saver prefs."
  );

  Services.prefs.setBoolPref("zen.performance.low-bandwidth-mode.enabled", false);

  await TestUtils.waitForCondition(
    () =>
      Services.prefs.getIntPref("media.autoplay.default", 1) === 1 &&
      Services.prefs.getIntPref("permissions.default.image", 1) === 1 &&
      Services.prefs.getIntPref("browser.display.use_document_fonts", 1) === 1,
    "Disabling low bandwidth mode should restore previous user pref values."
  );
});

add_task(async function test_low_bandwidth_skips_images_when_unchecked() {
  registerCleanupFunction(() => {
    for (const pref of [...ZEN_PREFS, ...TARGET_PREFS]) {
      Services.prefs.clearUserPref(pref);
    }
  });

  Services.prefs.setIntPref("permissions.default.image", 1);
  Services.prefs.setBoolPref("zen.performance.low-bandwidth-mode.block-images", false);
  Services.prefs.setBoolPref("zen.performance.low-bandwidth-mode.block-autoplay", true);
  Services.prefs.setBoolPref("zen.performance.low-bandwidth-mode.block-fonts", true);
  Services.prefs.setBoolPref("zen.performance.low-bandwidth-mode.enabled", true);

  await TestUtils.waitForCondition(
    () => Services.prefs.getIntPref("media.autoplay.default") === 5,
    "Autoplay block still applies."
  );
  Assert.equal(
    Services.prefs.getIntPref("permissions.default.image"),
    1,
    "Images stay allowed when the images checkbox is off."
  );

  Services.prefs.setBoolPref("zen.performance.low-bandwidth-mode.enabled", false);
});
