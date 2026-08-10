import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles/main.css";
import { initializeTheme } from "./lib/theme.mjs";
import { getAppBasePath } from "./lib/runtime";

initializeTheme();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={getAppBasePath() || undefined}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
