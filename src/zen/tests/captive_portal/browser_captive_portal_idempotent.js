/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PORTAL_NOTIFICATION_VALUE = "captive-portal-detected";

function portalNodes(win = window) {
  return [
    ...win.document.querySelectorAll(
      `notification-message[value="${PORTAL_NOTIFICATION_VALUE}"]`
    ),
  ];
}

async function waitForNotificationPromise(win = window) {
  const promise = win.CaptivePortalWatcher._notificationPromise;
  if (promise) {
    await promise;
  }
}

async function fireLogin(times = 1, win = window) {
  for (let i = 0; i < times; i++) {
    Services.obs.notifyObservers(null, "captive-portal-login");
  }
  await TestUtils.waitForCondition(
    () =>
      win.CaptivePortalWatcher._cps.state ==
      win.CaptivePortalWatcher._cps.LOCKED_PORTAL,
    "Captive portal service is LOCKED_PORTAL"
  );
  await waitForNotificationPromise(win);
}

async function freePortal(success = true) {
  Services.obs.notifyObservers(
    null,
    success ? "captive-portal-login-success" : "captive-portal-login-abort"
  );
  await TestUtils.waitForCondition(
    () => portalNodes().length === 0,
    "Portal notification removed after portal gone"
  );
}

add_task(async function test_repeated_login_topic_does_not_stack() {
  await fireLogin(8);
  Assert.equal(
    portalNodes().length,
    1,
    "Repeated captive-portal-login topics must not stack bars"
  );
  Assert.ok(
    gNotificationBox.getNotificationWithValue(PORTAL_NOTIFICATION_VALUE),
    "getNotificationWithValue finds the single bar"
  );
});

add_task(async function test_close_survives_repeat_login_topic() {
  await fireLogin(1);
  Assert.equal(portalNodes().length, 1, "Bar is showing before dismiss");

  portalNodes()[0].dismiss();
  await TestUtils.waitForCondition(
    () => portalNodes().length === 0,
    "Dismiss removes the captive-portal bar"
  );
  Assert.ok(
    CaptivePortalWatcher._userDismissed,
    "Watcher remembers the user dismissed the bar"
  );

  await fireLogin(5);
  Assert.equal(
    portalNodes().length,
    0,
    "Dismissed bar must not reappear on later captive-portal-login topics"
  );
});

add_task(async function test_new_portal_after_abort_shows_again() {
  CaptivePortalWatcher._userDismissed = true;
  Services.obs.notifyObservers(null, "captive-portal-login-abort");
  await TestUtils.waitForCondition(
    () => !CaptivePortalWatcher._userDismissed,
    "Abort clears the user-dismissed flag"
  );

  await fireLogin(1);
  Assert.equal(
    portalNodes().length,
    1,
    "A genuine new captive portal after abort still shows a bar"
  );

  await freePortal(true);
  Assert.equal(portalNodes().length, 0, "Success removes the new bar");
});

add_task(async function test_unlock_without_login_success_clears_bar() {
  await fireLogin(1);
  Assert.equal(portalNodes().length, 1, "Bar is showing after login topic");

  const realCps = CaptivePortalWatcher._cps;
  CaptivePortalWatcher._cps = {
    state: realCps.UNLOCKED_PORTAL,
    LOCKED_PORTAL: realCps.LOCKED_PORTAL,
    UNLOCKED_PORTAL: realCps.UNLOCKED_PORTAL,
    NOT_CAPTIVE: realCps.NOT_CAPTIVE,
    UNKNOWN: realCps.UNKNOWN,
  };
  try {
    Services.obs.notifyObservers(
      null,
      "network:captive-portal-connectivity",
      "captive"
    );
    await TestUtils.waitForCondition(
      () => portalNodes().length === 0,
      "Bar is removed when CPS reports unlocked without login-success"
    );
  } finally {
    CaptivePortalWatcher._cps = realCps;
  }

  await fireLogin(3);
  Assert.equal(
    portalNodes().length,
    1,
    "Idempotent show still holds after unlock teardown"
  );

  await freePortal(true);
  Assert.equal(portalNodes().length, 0, "Success still removes the bar");
});

add_task(async function test_check_complete_clears_when_not_locked() {
  await fireLogin(1);
  Assert.equal(portalNodes().length, 1, "Bar is showing");

  const realCps = CaptivePortalWatcher._cps;
  CaptivePortalWatcher._cps = {
    state: realCps.NOT_CAPTIVE,
    LOCKED_PORTAL: realCps.LOCKED_PORTAL,
    UNLOCKED_PORTAL: realCps.UNLOCKED_PORTAL,
    NOT_CAPTIVE: realCps.NOT_CAPTIVE,
    UNKNOWN: realCps.UNKNOWN,
  };
  try {
    Services.obs.notifyObservers(null, "captive-portal-check-complete");
    await TestUtils.waitForCondition(
      () => portalNodes().length === 0,
      "Bar is removed on check-complete when state is NOT_CAPTIVE"
    );
  } finally {
    CaptivePortalWatcher._cps = realCps;
  }

  await freePortal(true);
  Assert.equal(portalNodes().length, 0, "Success/abort still clears leftover state");
});
