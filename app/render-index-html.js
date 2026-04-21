const fs = require("fs");
const path = require("path");

function escapeScriptValue(value) {
  return JSON.stringify(String(value || ""));
}

function createIndexHtmlRenderer(config) {
  const templatePath = path.join(config.publicDir, "index.html");
  const template = fs.readFileSync(templatePath, "utf8");
  const basePath = config.app.basePath || "";
  const apiBaseUrl = config.app.apiBaseUrl || `${basePath}/api`;

  return function renderIndexHtml() {
    return template
      .replaceAll("%%APP_BASE_PATH%%", basePath)
      .replaceAll("%%APP_API_BASE_URL%%", apiBaseUrl)
      .replaceAll("%%APP_BASE_PATH_JSON%%", escapeScriptValue(basePath))
      .replaceAll("%%APP_API_BASE_URL_JSON%%", escapeScriptValue(apiBaseUrl));
  };
}

module.exports = {
  createIndexHtmlRenderer
};
