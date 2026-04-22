import { spawn } from "node:child_process";

let nextPort = 3210;

function buildTestEnv(port, overrides = {}) {
  return {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret",
    INITIAL_ADMIN_USERNAME: "admin",
    INITIAL_ADMIN_EMAIL: "admin@example.com",
    INITIAL_ADMIN_PASSWORD: "admin123",
    ENABLE_DEMO_DATA: "true",
    APPLY_MIGRATIONS_ON_START: "true",
    BOOTSTRAP_DATABASE_ON_START: "true",
    RESET_DATABASE_ON_START: "true",
    MSSQL_HOST: process.env.MSSQL_HOST || "localhost",
    MSSQL_PORT: process.env.MSSQL_PORT || "1433",
    MSSQL_DATABASE: process.env.MSSQL_DATABASE || "berichtsheft_test",
    MSSQL_USER: process.env.MSSQL_USER || "sa",
    MSSQL_PASSWORD: process.env.MSSQL_PASSWORD || "YourStrong(!)Password",
    MSSQL_TRUST_SERVER_CERTIFICATE: process.env.MSSQL_TRUST_SERVER_CERTIFICATE || "true",
    REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379",
    ...overrides
  };
}

export function startServer(port, envOverrides = {}) {
  const child = spawn("node", ["index.js"], {
    cwd: process.cwd(),
    env: buildTestEnv(port, envOverrides),
    stdio: ["ignore", "pipe", "pipe"]
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Serverstart Timeout"));
    }, 20000);

    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Serverprozess unerwartet beendet (${code ?? "signal"}).`));
      }
    });

    child.stdout.on("data", (data) => {
      if (String(data).includes(`http://127.0.0.1:${port}`)) {
        clearTimeout(timeout);
        resolve(child);
      }
    });

    child.stderr.on("data", (data) => {
      const message = String(data);
      if (message.trim()) {
        clearTimeout(timeout);
        reject(new Error(message));
      }
    });
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
