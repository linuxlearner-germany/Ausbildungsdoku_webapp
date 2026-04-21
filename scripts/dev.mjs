import { spawn } from "node:child_process";

const children = [];

function start(name, command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false
  });

  child.on("exit", (code, signal) => {
    if (signal || code) {
      stopAll();
      process.exit(code || 1);
    }
  });

  children.push({ name, child });
}

function stopAll() {
  for (const { child } of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

start("client", "node", ["scripts/build.mjs", "--watch"]);
start("server", "node", ["--watch", "index.js"]);
