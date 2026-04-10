import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");

await mkdir(publicDir, { recursive: true });

await build({
  entryPoints: [path.join(projectRoot, "src", "main.jsx")],
  bundle: true,
  format: "esm",
  sourcemap: true,
  outfile: path.join(publicDir, "app.js")
});

await copyFile(
  path.join(projectRoot, "src", "styles.css"),
  path.join(publicDir, "app.css")
);
