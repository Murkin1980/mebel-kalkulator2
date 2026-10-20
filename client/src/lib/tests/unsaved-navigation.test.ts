import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createUnsavedNavigationGuard } from "../unsaved-navigation";

describe("unsaved tariff navigation protection", () => {
  it("allows clean navigation without a confirmation", () => {
    let confirmations = 0;
    const guard = createUnsavedNavigationGuard(() => {
      confirmations += 1;
      return false;
    });

    assert.equal(guard.canNavigate(), true);
    assert.equal(confirmations, 0);
  });

  it("keeps the route when the user declines to discard a dirty draft", () => {
    let confirmations = 0;
    const guard = createUnsavedNavigationGuard(() => {
      confirmations += 1;
      return false;
    });
    guard.register(() => guard.confirmLeave());

    assert.equal(guard.canNavigate(), false);
    assert.equal(confirmations, 1);
  });

  it("allows an explicit discard decision once and removes the blocker on cleanup", () => {
    let allowLeave = true;
    const guard = createUnsavedNavigationGuard(() => allowLeave);
    const blocker = () => guard.confirmLeave();
    guard.register(blocker);

    assert.equal(guard.canNavigate(), true);
    allowLeave = false;
    guard.register(null);
    assert.equal(guard.canNavigate(), true);
  });

  it("does not ask again after an operation has saved a safe copy", () => {
    let confirmations = 0;
    const guard = createUnsavedNavigationGuard(() => {
      confirmations += 1;
      return false;
    });
    guard.register(() => guard.confirmLeave());

    const moved = guard.runBypassed(() => guard.canNavigate());
    assert.equal(moved, true);
    assert.equal(confirmations, 0);
    assert.equal(guard.canNavigate(), false);
    assert.equal(confirmations, 1);
  });
});
