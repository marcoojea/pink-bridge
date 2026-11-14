#!/usr/bin/env node
// Convierte el vídeo del flujo (WebM, generado por Playwright) en docs/img/flujo.gif con ffmpeg.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const source = join(tmpdir(), "pink-bridge-docs-video", "flujo.webm");
const output = resolve("docs/img/flujo.gif");
const palette = join(tmpdir(), "pink-bridge-palette.png");

if (!existsSync(source)) {
  console.error(`No se encuentra el vídeo ${source}. Ejecuta antes las capturas.`);
  process.exit(1);
}

try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  console.error(
    "Hace falta ffmpeg para generar el GIF. Instálalo, por ejemplo con: brew install ffmpeg",
  );
  process.exit(1);
}

mkdirSync(resolve("docs/img"), { recursive: true });
const filter = "fps=8,scale=960:-1:flags=lanczos";
execFileSync("ffmpeg", [
  "-y",
  "-loglevel",
  "error",
  "-i",
  source,
  "-vf",
  `${filter},palettegen`,
  palette,
]);
execFileSync("ffmpeg", [
  "-y",
  "-loglevel",
  "error",
  "-i",
  source,
  "-i",
  palette,
  "-lavfi",
  `${filter}[x];[x][1:v]paletteuse`,
  output,
]);
console.log(`GIF generado en ${output}`);
