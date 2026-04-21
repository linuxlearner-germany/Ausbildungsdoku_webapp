import { build } from "esbuild";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "github-pages");

await mkdir(outputDir, { recursive: true });

await build({
  entryPoints: [path.join(projectRoot, "src", "main.github-pages.jsx")],
  bundle: true,
  format: "esm",
  sourcemap: true,
  outfile: path.join(outputDir, "app.js"),
  loader: {
    ".png": "file",
    ".jpg": "file",
    ".jpeg": "file",
    ".svg": "file"
  }
});

const html = `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Berichtsheft Portal</title>
    <link rel="icon" type="image/png" href="./Pictures/WIWEB-waage-vektor_ohne_schrift.png" />
    <link rel="stylesheet" href="./app.css" />
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.__APP_STATIC_DEMO__ = true;
      window.__APP_BASE_PATH__ = "";
      window.__APP_API_BASE_URL__ = "";
    </script>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`;

await writeFile(path.join(outputDir, "index.html"), html);
await writeFile(path.join(outputDir, "404.html"), html);
await cp(path.join(projectRoot, "Pictures"), path.join(outputDir, "Pictures"), { recursive: true });
await cp(path.join(projectRoot, "public", "report-import-template.csv"), path.join(outputDir, "report-import-template.csv"));
await cp(path.join(projectRoot, "public", "benutzer_import_vorlage.csv"), path.join(outputDir, "benutzer_import_vorlage.csv"));
