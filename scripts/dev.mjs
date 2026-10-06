import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function pythonCommand() {
  const candidates = process.env.PYTHON ? [process.env.PYTHON] : ["python", "python3", "py"];
  for (const command of candidates) {
    const result = spawnSync(command, ["-c", "import fastapi, uvicorn, PIL, numpy"], { stdio: "ignore" });
    if (result.status === 0) return command;
  }
  return null;
}

const children = [];

function start(command, args, cwd, name) {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  child.on("exit", (code) => {
    if (code) console.error(`[${name}] exited with code ${code}`);
  });
  children.push(child);
}

start("node", ["src/server.js"], path.join(root, "backend"), "api");
const python = pythonCommand();
if (python) {
  console.log(`Starting the Python face service with ${python}`);
  start(python, ["-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8090"], path.join(root, "face-service"), "face");
} else {
  console.log("Python face packages are not installed. Starting the Node face service with the same contract.");
  start("node", ["server.mjs"], path.join(root, "face-service"), "face");
}
start("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"], path.join(root, "frontend"), "web");

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
