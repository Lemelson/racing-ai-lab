import test from "node:test";
import assert from "node:assert/strict";

import {
  createReloadCoordinator,
  injectReloadClient,
} from "../src/core/dev-reload.js";

test("reload coordinator notifies every connected local tab after a source change", () => {
  let notifyChange;
  let watcherClosed = false;
  const firstEvents = [];
  const secondEvents = [];
  const coordinator = createReloadCoordinator({
    watch(onChange) {
      notifyChange = onChange;
      return {
        close() {
          watcherClosed = true;
        },
      };
    },
  });

  coordinator.addClient({ write: (event) => firstEvents.push(event) });
  coordinator.addClient({ write: (event) => secondEvents.push(event) });
  notifyChange();

  assert.match(firstEvents.join(""), /event: reload/);
  assert.match(secondEvents.join(""), /event: reload/);

  coordinator.close();
  assert.equal(watcherClosed, true);
});

test("served HTML reconnects to reload events without touching localStorage", () => {
  const html = injectReloadClient("<!doctype html><body>Racing</body>");

  assert.match(html, /new EventSource\("\/__dev_events"\)/);
  assert.match(html, /location\.reload\(\)/);
  assert.match(html, /location\.hash === "#editor"/);
  assert.match(html, /hashchange/);
  assert.doesNotMatch(html, /localStorage|sessionStorage/);
});
