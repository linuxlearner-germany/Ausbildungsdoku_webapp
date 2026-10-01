import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getMenuItemsForRole } from "../src/navigation/menuConfig.mjs";

const read = (...segments) => fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");

function readPngDimensions(...segments) {
  const image = fs.readFileSync(path.join(process.cwd(), ...segments));
  assert.equal(image.toString("hex", 0, 8), "89504e470d0a1a0a");
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

test("zentrale WIWEB-Wortmarke bleibt proportional und in allen Auth-Markenumgebungen zentral eingebunden", () => {
  const logo = readPngDimensions("Pictures", "logo-short.png");
  const brandLogo = read("src", "components", "BrandLogo.jsx");
  const consumers = [
    read("src", "components", "SidebarNavigation.jsx"),
    read("src", "pages", "LoginPage.jsx"),
    read("src", "pages", "PasswordResetPage.jsx")
  ].join("\n");
  const css = read("src", "styles", "components.css");

  assert.deepEqual(logo, { width: 522, height: 129 });
  assert.ok(logo.width / logo.height > 4 && logo.width / logo.height < 4.1);
  assert.match(brandLogo, /Pictures\/logo-short\.png/);
  assert.match(brandLogo, /alt="WIWEB"/);
  assert.equal((consumers.match(/<BrandLogo/g) || []).length, 3);
  assert.match(css, /width:\s*auto/);
  assert.match(css, /object-fit:\s*contain/);
}
);

test("sichtbare Kernoberflächen nennen WIWEB Berichtsheft und keine Altbezeichnung", () => {
  const visibleSources = [
    read("public", "index.html"),
    read("scripts", "build-github-pages.mjs"),
    read("src", "components", "SidebarNavigation.jsx"),
    read("src", "pages", "LoginPage.jsx"),
    read("src", "pages", "PasswordResetPage.jsx"),
    read("README.md").split("\n").slice(0, 12).join("\n")
  ].join("\n");

  assert.match(visibleSources, /WIWEB Berichtsheft/);
  assert.doesNotMatch(visibleSources, /Digitales Berichtsheft|Ausbildungsdoku/);
});

test("Branding-Aenderungen lassen Rollenmenues und Freigabe-Endpunkte unveraendert", () => {
  const traineeKeys = getMenuItemsForRole("trainee").map(({ key }) => key);
  const trainerKeys = getMenuItemsForRole("trainer").map(({ key }) => key);
  const adminKeys = getMenuItemsForRole("admin").map(({ key }) => key);
  const routes = read("routes", "report-routes.js");

  assert.ok(traineeKeys.includes("reports"));
  assert.ok(traineeKeys.includes("exports"));
  assert.ok(trainerKeys.includes("approvals"));
  assert.equal(adminKeys.some((key) => key.startsWith("admin-")), true);
  assert.equal(adminKeys.includes("approvals"), false);
  assert.match(routes, /post\("\/trainer\/sign", requireRole\("trainer", "admin"\)/);
  assert.match(routes, /post\("\/trainer\/reject", requireRole\("trainer", "admin"\)/);
  assert.match(routes, /post\("\/report\/submit", requireRole\("trainee"\)/);
});
