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
