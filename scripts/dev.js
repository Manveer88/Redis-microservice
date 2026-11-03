const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const servicesDir = path.join(root, "services");
const watch = process.argv.includes("--watch");
const only = process.argv.find((arg) => arg.startsWith("--only="));
const selected = only ? only.slice(7).split(",") : null;

const COLORS = [31, 32, 33, 34, 35, 36, 91, 92, 93, 94, 95, 96];

const services = fs
  .readdirSync(servicesDir)
  .filter((name) => name !== "shared")
  .filter((name) => fs.existsSync(path.join(servicesDir, name, "src", "index.js")))
  .filter((name) => !selected || selected.includes(name));

const width = Math.max(...services.map((name) => name.length));
const children = [];

const prefixStream = (stream, label, color, target) => {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      target.write(`\x1b[${color}m${label.padEnd(width)}\x1b[0m | ${line}\n`);
    }
  });
};

services.forEach((name, index) => {
  const color = COLORS[index % COLORS.length];
  const args = [...(watch ? ["--watch"] : []), path.join("src", "index.js")];
  const child = spawn(process.execPath, args, {
    cwd: path.join(servicesDir, name),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  prefixStream(child.stdout, name, color, process.stdout);
  prefixStream(child.stderr, name, color, process.stderr);
  child.on("exit", (code, signal) => {
    process.stderr.write(`\x1b[${color}m${name.padEnd(width)}\x1b[0m | exited (${signal || code})\n`);
  });
  children.push(child);
});

const stopAll = (signal) => {
  for (const child of children) {
    if (child.exitCode === null) child.kill(signal);
  }
  setTimeout(() => process.exit(0), 3000).unref();
};

process.on("SIGINT", () => stopAll("SIGINT"));
process.on("SIGTERM", () => stopAll("SIGTERM"));
