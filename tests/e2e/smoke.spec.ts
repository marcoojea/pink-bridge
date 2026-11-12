import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("la portada muestra el título y el estado de la API", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Pink Bridge" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(/API disponible \(versión 0\.1\.0\)\./);
});

test("el enlace de salto aparece con teclado", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  const skipLink = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
});

test("la portada no tiene incidencias axe en WCAG 2.2 AA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText(/API disponible/);

  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test("el proxy de la API devuelve error estructurado para rutas inexistentes", async ({
  request,
}) => {
  const response = await request.get("/api/no-existe");

  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({
    error: { code: "not_found", message: "Recurso no encontrado." },
  });
});
