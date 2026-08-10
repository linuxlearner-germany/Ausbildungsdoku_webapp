import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_LOGIN_BACKGROUND,
  LOGIN_BACKGROUND_REGISTRY,
  getLoginBackgroundUrl,
  isLoginBackground,
  normalizeLoginBackground
} from "../src/lib/login-background.mjs";

test("Login-Hintergrund-Registry enthaelt nur vorhandene projektinterne Assets", () => {
  const keys = LOGIN_BACKGROUND_REGISTRY.map((background) => background.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(DEFAULT_LOGIN_BACKGROUND, "standard");
  assert.equal(isLoginBackground("wiweb"), true);
  assert.equal(isLoginBackground("/root/secret.png"), false);
  assert.equal(normalizeLoginBackground("veraltet"), "standard");

  for (const background of LOGIN_BACKGROUND_REGISTRY) {
    const paths = [background.path, ...(background.sources || []).map((source) => source.path)];
    for (const assetPath of paths) {
      assert.match(assetPath, /^\/Pictures\/Backgrounds\//);
      assert.equal(fs.existsSync(path.join(process.cwd(), assetPath)), true, assetPath);
    }
  }
});

test("Modernes Login-Bild mit Logo verwendet passende Desktop-Aufloesungen", () => {
  assert.match(getLoginBackgroundUrl("modern-logo", 1920), /desktop-full-hd-modern-logo-rechts\.png$/);
  assert.match(getLoginBackgroundUrl("modern-logo", 2560), /desktop-2560-modern-logo-rechts\.png$/);
  assert.match(getLoginBackgroundUrl("modern-logo", 3840), /desktop-4k-modern-logo-rechts\.png$/);
});

test("Login und Admin-Dashboard verwenden dieselbe globale Auswahl", () => {
  const login = fs.readFileSync(path.join(process.cwd(), "src/pages/LoginPage.jsx"), "utf8");
  const dashboard = fs.readFileSync(path.join(process.cwd(), "src/pages/DashboardPage.jsx"), "utf8");
  const app = fs.readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8");

  assert.match(login, /getLoginBackgroundUrl\(background, viewportWidth\)/);
  assert.doesNotMatch(login, /login-bg\.png/);
  assert.match(dashboard, /Globalen Login-Hintergrund auswählen/);
  assert.match(dashboard, /LOGIN_BACKGROUND_REGISTRY\.map/);
  assert.match(dashboard, /aria-pressed=\{isSelected\}/);
  assert.match(app, /background=\{loginBackground\}/);
});
