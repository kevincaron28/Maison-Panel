import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const root = process.cwd();
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      let file = path.resolve(root, "." + pathname);
      if (!file.startsWith(root + path.sep) && file !== root)
        throw new Error("outside root");
      if (
        pathname
          .split("/")
          .some((part) => part.startsWith(".") || part === "node_modules")
      )
        throw new Error("private path");
      if ((await stat(file)).isDirectory())
        file = path.join(file, "index.html");
      const data = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "text/plain",
        "Cache-Control": "no-store",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(8080, "127.0.0.1", () =>
    console.log("Maison preview: http://127.0.0.1:8080"),
  );
