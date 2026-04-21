import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AppStatic } from "./AppStatic";
import "./styles/main.css";
import { initializeTheme } from "./lib/theme.mjs";

initializeTheme();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <AppStatic />
    </HashRouter>
  </React.StrictMode>
);
