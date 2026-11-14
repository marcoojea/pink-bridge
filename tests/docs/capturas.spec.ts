import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Carpeta de salida de las capturas que se versionan en el repositorio.
const IMG = resolve("docs/img");
const VIDEO_DIR = join(tmpdir(), "pink-bridge-docs-video");

test("genera capturas del flujo y un vídeo para el GIF", async ({ browser }) => {
  mkdirSync(IMG, { recursive: true });
  mkdirSync(VIDEO_DIR, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    colorScheme: "light",
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 860 } },
  });
  const page = await context.newPage();

  // 1. Inicio.
  await page.goto("/#/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Revisa si tu página web es accesible",
  );
  await page.screenshot({ path: join(IMG, "01-inicio.png") });

  // 2. Resultados con filtro.
  await page.getByRole("button", { name: "Ver un ejemplo de página" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Resultados de la revisión" }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Gravedad").selectOption("critical");
  await expect(page.getByRole("status").filter({ hasText: "Mostrando" })).toBeVisible();
  await page.screenshot({ path: join(IMG, "02-resultados-filtrados.png"), fullPage: true });

  // 3. Detalle de una incidencia.
  await page
    .getByRole("button", { name: /Ver cómo arreglarlo/ })
    .first()
    .click();
  const detail = page.locator("#detalle-incidencia");
  await expect(detail).toBeVisible();
  await detail.screenshot({ path: join(IMG, "03-detalle-incidencia.png") });

  // 4. Comparación de dos revisiones de la misma página.
  const analysisUrl = page.url();
  await page.goto("/#/historial");
  await expect(page.getByRole("heading", { level: 1, name: "Mis revisiones" })).toBeVisible();
  await page
    .getByRole("button", { name: /Repetir revisión de/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Resultados de la revisión" }),
  ).toBeVisible({ timeout: 60_000 });
  await page.goto("/#/historial");
  // El historial va del más reciente al más antiguo: la base es la antigua y la comparada, la reciente.
  await page.getByLabel("Primera revisión (la más antigua)").selectOption({ index: 2 });
  await page.getByLabel("Segunda revisión (la más reciente)").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Comparar", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Qué ha cambiado" })).toBeVisible();
  await page.screenshot({ path: join(IMG, "04-comparacion.png"), fullPage: true });

  // 5. Informe HTML: se pide a la API y se muestra en la página, sin descargarlo.
  const id = new URL(analysisUrl).hash.split("/").pop() ?? "";
  const report = await page.request.get(`/api/analyses/${id}/report?format=html`);
  expect(report.ok()).toBeTruthy();
  await page.setContent(await report.text());
  await page.screenshot({ path: join(IMG, "05-informe-html.png"), fullPage: true });

  // Vídeo del flujo para el GIF (scripts/make-gif.mjs).
  const video = page.video();
  await context.close();
  if (video !== null) {
    await video.saveAs(join(VIDEO_DIR, "flujo.webm"));
  }
});
