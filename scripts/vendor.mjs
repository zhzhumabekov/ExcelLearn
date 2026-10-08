// pnpm vendor — копирует htmx и Alpine из node_modules в static/vendor/ (файлы хранятся в git:
// сайт отдаёт их сам, без CDN). Запускать после обновления версий в package.json.
import { copyFileSync, readFileSync } from "node:fs";

const files = [
  ["node_modules/htmx.org/dist/htmx.min.js", "static/vendor/htmx.min.js", "htmx.org"],
  ["node_modules/alpinejs/dist/cdn.min.js", "static/vendor/alpine.min.js", "alpinejs"],
];

for (const [from, to, pkg] of files) {
  copyFileSync(from, to);
  const { version } = JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, "utf8"));
  console.log(`${to} ← ${pkg}@${version}`);
}
