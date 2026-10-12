import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
if (path.dirname(output) !== root || path.basename(output) !== "dist")
  throw new Error("Unsafe output path");
await rm(output, { recursive: true, force: true });
await mkdir(output);
// Only public runtime assets; never repository history, docs, tests or development dependencies.
for (const file of ["index.html", "markets.html", "fishing.html", "settings.html", "config.js", "_headers"])
  await cp(path.join(root, file), path.join(output, file));
for (const dir of ["css", "js", "vendor", "fonts"]) {
  await mkdir(path.join(output, dir));
  for (const file of await readdir(path.join(root, dir))) {
    if (/\.(js|css|woff2|txt)$/.test(file))
      await cp(path.join(root, dir, file), path.join(output, dir, file));
  }
}
console.log("Packaged public assets in dist/");
