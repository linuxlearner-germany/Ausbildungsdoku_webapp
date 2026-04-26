import test from "node:test";
import assert from "node:assert/strict";
import { canAccessMenuItem, getMenuItemsForRole } from "../src/navigation/menuConfig.mjs";

await test("Admin-Navigation blendet fachlich unpassende Bereiche aus", async () => {
  const items = getMenuItemsForRole("admin").map((item) => item.key);

  assert.equal(items.includes("grades"), false);
  assert.equal(items.includes("approvals"), false);
  assert.equal(items.includes("archive"), false);
  assert.equal(items.includes("admin-audit-log"), true);
  assert.equal(items.includes("admin-users"), true);
});

await test("Azubi- und Ausbilder-Navigation enthalten nur ihre Bereiche", async () => {
  const traineeItems = getMenuItemsForRole("trainee").map((item) => item.key);
  const trainerItems = getMenuItemsForRole("trainer").map((item) => item.key);

  assert.equal(traineeItems.includes("reports"), true);
  assert.equal(traineeItems.includes("exports"), true);
  assert.equal(traineeItems.includes("admin-audit-log"), false);

  assert.equal(trainerItems.includes("approvals"), true);
  assert.equal(trainerItems.includes("archive"), true);
  assert.equal(trainerItems.includes("grades"), false);
  assert.equal(trainerItems.includes("admin-audit-log"), false);
});

await test("Routenpruefung folgt derselben Konfiguration", async () => {
  assert.equal(canAccessMenuItem("admin", "admin-audit-log"), true);
  assert.equal(canAccessMenuItem("admin", "reports"), false);
  assert.equal(canAccessMenuItem("trainer", "approvals"), true);
  assert.equal(canAccessMenuItem("trainer", "admin-users"), false);
  assert.equal(canAccessMenuItem("trainee", "grades"), true);
});
