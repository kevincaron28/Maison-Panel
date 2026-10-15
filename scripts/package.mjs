import { cp, mkdir, readdir, rm, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
if (path.dirname(output) !== root || path.basename(output) !== "dist")
  throw new Error("Unsafe output path");
await mkdir(output, { recursive: true });
// Keep the directory itself: Windows dev-server watchers may hold its handle open.
for (const name of await readdir(output)) {
  const target = path.resolve(output, name);
  if (path.dirname(target) !== output) throw new Error("Unsafe cleanup path");
  await rm(target, { recursive: true, force: true, maxRetries: 3 });
}
// Only public runtime assets; never repository history, docs, tests or development dependencies.
for (const file of ["index.html", "markets.html", "fishing.html", "settings.html", "deck.html", "privacy.html", "config.js", "_headers"])
  await cp(path.join(root, file), path.join(output, file));
for (const dir of ["css", "js", "vendor", "fonts"]) {
  await mkdir(path.join(output, dir));
  for (const file of await readdir(path.join(root, dir))) {
    if (/\.(js|css|woff2|txt)$/.test(file))
      await cp(path.join(root, dir, file), path.join(output, dir, file));
  }
}
console.log("Packaged public assets in dist/");

const assets=["/","/index.html","/markets.html","/fishing.html","/settings.html","/deck.html","/privacy.html","/config.js"];
for(const dir of ["css","js","vendor","fonts"])for(const file of await readdir(path.join(output,dir)))if(/\.(js|css|woff2)$/.test(file)&&file!=="release.js")assets.push(`/${dir}/${file}`);
const template=await readFile(path.join(root,"scripts/sw-template.js"),"utf8");
const hash=createHash("sha256");for(const asset of assets.filter(p=>p!=="/"))hash.update(await readFile(path.join(output,asset.slice(1))));
hash.update(template);hash.update(await readFile(path.join(root,"worker/index.js")));
const version="2026.10.13-"+hash.digest("hex").slice(0,12);
await writeFile(path.join(output,"js/release.js"),`export const RELEASE = ${JSON.stringify(version)};\n`);
assets.push("/js/release.js");
await writeFile(path.join(output,"sw.js"),template.replace("__CACHE_NAME__",JSON.stringify("maison-"+version)).replace("__ASSETS__",JSON.stringify(assets)));
console.log(`Release ${version}: ${assets.length} offline assets`);
