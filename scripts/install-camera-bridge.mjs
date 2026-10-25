// Installs or updates the private camera bridge on this PC, run from the repository:
//   node scripts/install-camera-bridge.mjs [--mac 44:01:bb:ec:b3:13] [--no-autostart] [--no-start]
// Copies the bridge modules and `ws` into %LOCALAPPDATA%\MaisonPanel\camera-bridge, keeps the
// private config.json (adds `mac` for automatic rediscovery), registers a hidden start at
// Windows sign-in (HKCU Run, no administrator rights) and starts the supervisor now.
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeMac } from "./camera-discovery.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(process.env.LOCALAPPDATA, "MaisonPanel", "camera-bridge");
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const configPath = path.join(target, "config.json");
if (!existsSync(configPath)) throw new Error(`No private config at ${configPath}; see docs/camera-integration.md`);

for (const file of ["camera-bridge.mjs", "camera-stream.mjs", "camera-ptz.mjs", "camera-discovery.mjs", "camera-supervisor.mjs"])
  cpSync(path.join(repo, "scripts", file), path.join(target, file));
cpSync(path.join(repo, "node_modules", "ws"), path.join(target, "node_modules", "ws"), { recursive: true });
console.log("Bridge modules copied");

const mac = option("--mac");
if (mac) {
  if (normalizeMac(mac).length !== 12) throw new Error("Invalid MAC address");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.mac = mac;
  writeFileSync(configPath + ".tmp", JSON.stringify(config, null, 2));
  renameSync(configPath + ".tmp", configPath);
  console.log("Camera MAC saved for automatic rediscovery");
}

// wscript runs node without a console window; the supervisor restarts the bridge if it stops.
const launcher = path.join(target, "start-hidden.vbs");
writeFileSync(launcher, `CreateObject("WScript.Shell").Run """${process.execPath}"" ""${path.join(target, "camera-supervisor.mjs")}"" ""${configPath}""", 0, False\r\n`);
if (!flag("--no-autostart")) {
  execFileSync("reg", ["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "Maison Camera Bridge",
    "/t", "REG_SZ", "/d", `wscript.exe "${launcher}"`, "/f"], { stdio: "ignore", windowsHide: true });
  console.log("Starts automatically at Windows sign-in (remove: reg delete HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v \"Maison Camera Bridge\" /f)");
}
if (!flag("--no-start")) {
  spawn("wscript.exe", [launcher], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  console.log(`Supervisor started; log: ${path.join(target, "bridge.log")}`);
}
