import { build, context } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
await mkdir(publicDir, { recursive: true });

const buildOptions = {
  entryPoints: [path.join(projectRoot, "src", "main.jsx")],
  bundle: true,
  format: "esm",
  sourcemap: true,
  outfile: path.join(publicDir, "app.js"),
  loader: {
    ".png": "file",
    ".jpg": "file",
    ".jpeg": "file",
    ".svg": "file"
  }
};

if (process.argv.includes("--watch")) {
  const buildContext = await context(buildOptions);
  await buildContext.watch();
} else {
  await build(buildOptions);
}
