import { spawn } from "node:child_process";
import { buildIntegrationTestEnv } from "./test-env.mjs";

let nextPort = 3210;
const START_TIMEOUT_MS = 20000;
const HEALTH_CHECK_INTERVAL_MS = 250;

function buildTestEnv(port, overrides = {}) {
  return buildIntegrationTestEnv({
    PORT: String(port),
    ...overrides
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function isServerHealthy(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/ready`);
    return response.ok;
  } catch (_error) {
    return false;
  }
}

async function waitForServerReady({ child, baseUrl, timeoutMs, stderrBuffer, stdoutBuffer }) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      break;
    }

    if (await isServerHealthy(baseUrl)) {
      return;
    }

    await delay(HEALTH_CHECK_INTERVAL_MS);
  }

  child.kill("SIGTERM");
  throw new Error(
    [
      "Serverstart Timeout",
      stderrBuffer.length ? `stderr: ${stderrBuffer.join("")}` : "",
      stdoutBuffer.length ? `stdout: ${stdoutBuffer.join("")}` : ""
    ].filter(Boolean).join("\n")
  );
}

export function startServer(port, envOverrides = {}) {
  const child = spawn("node", ["index.js"], {
    cwd: process.cwd(),
    env: buildTestEnv(port, envOverrides),
    stdio: ["ignore", "pipe", "pipe"]
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const stderrBuffer = [];
  const stdoutBuffer = [];

  return new Promise((resolve, reject) => {
    child.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(
          [
            `Serverprozess unerwartet beendet (${code ?? "signal"}).`,
            stderrBuffer.length ? `stderr: ${stderrBuffer.join("")}` : "",
            stdoutBuffer.length ? `stdout: ${stdoutBuffer.join("")}` : ""
          ].filter(Boolean).join("\n")
        ));
      }
    });

    child.stdout.on("data", (data) => {
      stdoutBuffer.push(String(data));
    });

    child.stderr.on("data", (data) => {
      stderrBuffer.push(String(data));
    });

    waitForServerReady({ child, baseUrl, timeoutMs: START_TIMEOUT_MS, stderrBuffer, stdoutBuffer })
      .then(() => resolve(child))
      .catch(reject);
  });
}

export async function withIsolatedServer(run, envOverrides = {}) {
  const port = nextPort;
  nextPort += 1;
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = await startServer(port, envOverrides);

  try {
    await run(baseUrl);
  } finally {
    if (server.exitCode === null && !server.killed) {
      await new Promise((resolve) => {
        server.once("exit", resolve);
        server.kill("SIGTERM");
      });
    }
  }
}

export function extractCookie(response) {
  return response.headers.get("set-cookie")?.split(";")[0] || "";
}

export async function postJson(url, body, cookie = "") {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: JSON.stringify(body)
  });
}
