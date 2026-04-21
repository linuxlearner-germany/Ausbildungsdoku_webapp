const express = require("express");
const { asyncHandler } = require("../middleware/async-handler");

function createAuthRoutes({ authController, requireAuth }) {
  const router = express.Router();

  router.get("/session", asyncHandler(authController.getSession));
  router.post("/login", asyncHandler(authController.login));
  router.post("/logout", asyncHandler(authController.logout));
  router.post("/preferences/theme", requireAuth, asyncHandler(authController.updateThemePreference));
  router.post("/profile/password", requireAuth, asyncHandler(authController.changeOwnPassword));
  router.post("/profile/:userId/password", requireAuth, asyncHandler(authController.changeOwnPassword));

  return router;
}

module.exports = {
  createAuthRoutes
};
