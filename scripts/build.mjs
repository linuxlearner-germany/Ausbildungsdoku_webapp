import { build, context } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
const isWatch = process.argv.includes("--watch");
await mkdir(publicDir, { recursive: true });

if (!isWatch) {
  await Promise.all([
    rm(path.join(publicDir, "app.js.map"), { force: true }),
    rm(path.join(publicDir, "app.css.map"), { force: true }),
    rm(path.join(publicDir, "chunks"), { recursive: true, force: true })
  ]);
}

const buildOptions = {
  entryPoints: [path.join(projectRoot, "src", "main.jsx")],
  bundle: true,
  format: "esm",
  splitting: true,
  target: "es2022",
  minify: !isWatch,
  sourcemap: isWatch,
  legalComments: "none",
  outdir: publicDir,
  entryNames: "app",
  chunkNames: "chunks/[name]-[hash]",
  assetNames: "assets/[name]-[hash]",
  external: ["/Pictures/*"],
  loader: {
    ".png": "file",
    ".jpg": "file",
    ".jpeg": "file",
    ".svg": "file"
  }
};

if (isWatch) {
  const buildContext = await context(buildOptions);
  await buildContext.watch();
} else {
  await build(buildOptions);
}
