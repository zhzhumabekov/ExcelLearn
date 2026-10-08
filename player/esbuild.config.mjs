import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: { player: "src/index.ts" },
  outdir: "../static/player",
  bundle: true,
  format: "iife",
  globalName: "ExcelLearnPlayer",
  target: "es2022",
  sourcemap: true,
  minify: !watch,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
