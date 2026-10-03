#!/usr/bin/env node
// Build paste-ready blocks for the Opus web chat: each file is wrapped with
// its repo path and line count so the model knows exactly what it received.
// Usage: node scripts/make-paste.mjs <file> [more files...] | clip
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
if (!args.length) {
  console.error(
    "usage: node scripts/make-paste.mjs <file> [more.files...]   (pipe into `clip` to copy)",
  );
  process.exit(1);
}
const blocks = args.map((path) => {
  const content = readFileSync(path, "utf8");
  const lines = content.split("\n").length;
  return `=== FILE: ${path} (${lines} lines) ===\n${content}\n=== END FILE: ${path} ===`;
});
console.log(blocks.join("\n\n"));
