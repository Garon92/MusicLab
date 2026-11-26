/* Every stylesheet and script in docs/index.html carries ?v=<first ten hex digits of its SHA-256>, so a published change
   is never served from a cache. `npm run stamp` rewrites the stamps; required as a module it reports the stale ones. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "../docs"), index = path.join(root, "index.html");
const stamp = file => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex").slice(0, 10);
const pattern = /((?:href|src)="\.\/)([^"?]+\.(?:css|js))(?:\?v=([0-9a-f]*))?(")/g;

function stale() {
  const out = [];
  for (const [, , file, have] of fs.readFileSync(index, "utf8").matchAll(pattern)) if (have !== stamp(file)) out.push(file);
  return out;
}
function write() {
  const before = fs.readFileSync(index, "utf8");
  const after = before.replace(pattern, (_, head, file, __, tail) => head + file + "?v=" + stamp(file) + tail);
  if (after !== before) fs.writeFileSync(index, after);
  return after !== before;
}
module.exports = { stale, write };
if (require.main === module) console.log(write() ? "index.html stamped" : "stamps are current");
