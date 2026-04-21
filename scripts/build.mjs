import { build, context } from "esbuild";
import { mkdir, copyFile, watch } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
const stylesSource = path.join(projectRoot, "src", "styles.css");
const stylesTarget = path.join(publicDir, "app.css");

await mkdir(publicDir, { recursive: true });

const buildOptions = {
  entryPoints: [path.join(projectRoot, "src", "main.jsx")],
  bundle: true,
  format: "esm",
  sourcemap: true,
  outfile: path.join(publicDir, "app.js")
};

await copyFile(stylesSource, stylesTarget);

if (process.argv.includes("--watch")) {
  const buildContext = await context(buildOptions);
  await buildContext.watch();

  const cssWatcher = watch(stylesSource);
  for await (const _event of cssWatcher) {
    await copyFile(stylesSource, stylesTarget);
  }
} else {
  await build(buildOptions);
}
