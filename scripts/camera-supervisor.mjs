import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keeps the camera bridge running: restarts it after a crash or exit, with a growing pause
// (5 s up to 2 min) so a missing camera or network does not cause a tight restart loop.
const here = path.dirname(fileURLToPath(import.meta.url));
const config = process.argv[2] || path.join(here, "config.json");
const logPath = path.join(path.dirname(config), "bridge.log");
let delay = 5000;
const log = text => { try { appendFileSync(logPath, `${new Date().toISOString()} [supervisor] ${text}\n`); } catch { /* ignore */ } };

function run() {
  const started = Date.now();
  const child = spawn(process.execPath, [path.join(here, "camera-bridge.mjs"), config], { windowsHide: true, stdio: "ignore" });
  child.on("exit", code => {
    if (code === 0 && Date.now() - started < 5000) {
      log("Another bridge is already running; supervisor stops"); process.exit(0);
    }
    // A bridge that ran a while resets the pause; repeated quick exits back off.
    delay = Date.now() - started > 120000 ? 5000 : Math.min(delay * 2, 120000);
    log(`Bridge exited (code ${code}); restarting in ${Math.round(delay / 1000)} s`);
    setTimeout(run, delay);
  });
}
log("Supervisor starting");
run();
