import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["apps/api", "packages", "providers", "workers", "scripts"];
const ignore = new Set(["node_modules", ".next", "dist", "coverage"]);
const files = [];
function walk(path) {
  for (const name of readdirSync(path)) {
    if (ignore.has(name)) continue;
    const full = join(path, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (full.endsWith(".js") && !full.includes("/test/")) files.push(full);
  }
}
for (const root of roots) walk(root);
for (const file of files) execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
console.log(`Syntax OK: ${files.length} JavaScript files`);
