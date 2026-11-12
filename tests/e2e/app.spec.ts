import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function runDemo(page: Page): Promise<void> {
  await page.goto("/#/");
  await page.getByRole("button", { name: "Probar con la página de demostración" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Resultados del análisis" }),
  ).toBeVisible({
    timeout: 60_000,
  });
}

test("el formulario valida la dirección y enfoca el campo con un mensaje asociado", async ({
  page,
}) => {
  await page.goto("/#/");
  await page.getByRole("button", { name: "Analizar" }).click();

  const input = page.getByLabel("Dirección web");
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Introduce una dirección web.")).toBeVisible();

  await input.fill("ftp://ejemplo.com");
  await page.getByRole("button", { name: "Analizar" }).click();
  await expect(page.getByText("Solo se admiten direcciones http o https.")).toBeVisible();
});

test("el enlace de salto aparece con el teclado y lleva al contenido", async ({ page }) => {
  await page.goto("/#/");
  await page.keyboard.press("Tab");

  const skipLink = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#contenido")).toBeFocused();
});

test("una URL que resuelve a loopback se bloquea y se informa como fallo, no como ausencia de incidencias", async ({
  page,
}) => {
  await page.goto("/#/");
  await page.getByLabel("Dirección web").fill("http://127.0.0.1/");
  await page.getByRole("button", { name: "Analizar" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "No se pudo completar el análisis" }),
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("alert")).toHaveText("El destino no está permitido.");
  await expect(page.getByText(/no se ha comprobado/)).toBeVisible();
});

test("la demostración muestra progreso, resultados filtrables y detalle", async ({ page }) => {
  await page.goto("/#/");
  await page.getByRole("button", { name: "Probar con la página de demostración" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Analizando la página" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Resultados del análisis" }),
  ).toBeVisible({
    timeout: 60_000,
  });

  await expect(page.getByText("Mostrando 5 de 5 incidencias.")).toBeVisible();

  await page.getByLabel("Gravedad").selectOption("critical");
  await expect(page.getByText("Mostrando 2 de 5 incidencias.")).toBeVisible();
  await page.getByLabel("Gravedad").selectOption("");

  await page.getByLabel("Tipo").selectOption("needs_review");
  await expect(page.getByText("No hay incidencias que coincidan con los filtros.")).toBeVisible();
  await page.getByRole("button", { name: "Quitar filtros" }).click();

  await page.getByRole("button", { name: "Ver detalle de image-alt" }).click();
  const detail = page.getByRole("region", { name: "Detalle: image-alt" });
  await expect(detail).toBeFocused();
  await expect(detail.getByText("Criterio de referencia")).toBeVisible();
  await expect(detail.getByText("WCAG 1.1.1")).toBeVisible();
});

test("los resultados avisan de que la revisión manual no está aprobada", async ({ page }) => {
  await runDemo(page);
  await expect(page.getByText(/no están aprobadas/)).toBeVisible();
  await expect(page.getByText(/no certifica la conformidad WCAG/)).toBeVisible();
});

test("el histórico conserva los análisis y repetir uno crea otro nuevo", async ({ page }) => {
  await runDemo(page);
  const firstUrl = page.url();

  await page.goto("/#/historial");
  await expect(
    page.getByRole("heading", { level: 1, name: "Histórico de análisis" }),
  ).toBeFocused();
  await expect(
    page.getByRole("link", { name: "https://demo.pinkbridge.test/" }).first(),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Repetir análisis de https://demo.pinkbridge.test/" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Resultados del análisis" }),
  ).toBeVisible({
    timeout: 60_000,
  });
  expect(page.url()).not.toBe(firstUrl);
});

test("la API devuelve errores estructurados a través del proxy de desarrollo", async ({
  request,
}) => {
  const response = await request.get("/api/no-existe");
  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({
    error: { code: "not_found", message: "Recurso no encontrado." },
  });
});

test("la portada, el histórico y un resultado no tienen incidencias axe en WCAG 2.2 AA", async ({
  page,
}) => {
  await page.goto("/#/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.goto("/#/historial");
  await expect(
    page.getByRole("heading", { level: 1, name: "Histórico de análisis" }),
  ).toBeVisible();
  await expectNoAxeViolations(page);

  await runDemo(page);
  await expectNoAxeViolations(page);
});

test("una ruta desconocida muestra una página de no encontrada accesible", async ({ page }) => {
  await page.goto("/#/no-existe");
  await expect(page.getByRole("heading", { level: 1, name: "Página no encontrada" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("revisar una incidencia guarda la nota y dos ejecuciones se comparan desde el histórico", async ({
  page,
}) => {
  await runDemo(page);
  await expect(page.getByRole("link", { name: "Descargar informe JSON" })).toHaveAttribute(
    "download",
    "",
  );

  await page.getByRole("button", { name: "Ver detalle de image-alt" }).click();
  const detail = page.getByRole("region", { name: "Detalle: image-alt" });
  await detail.getByLabel("Estado").selectOption("reviewed");
  await detail.getByLabel("Nota (opcional)").fill("Revisada en QA");
  await detail.getByRole("button", { name: "Guardar revisión" }).click();
  await expect(detail.getByRole("status")).toHaveText("Revisión guardada.");
  await expect(detail.getByText("Estado de revisión: Revisada")).toBeVisible();

  await runDemo(page);
  await page.goto("/#/historial");
  const baseSelect = page.getByLabel("Análisis base");
  await baseSelect.selectOption({ index: 1 });
  const baseValue = await baseSelect.inputValue();

  // El destino debe ser un análisis distinto de la base: se elige por valor, no por posición.
  const targetSelect = page.getByLabel("Análisis a comparar");
  const optionLocators = await targetSelect.locator("option").all();
  const values = await Promise.all(optionLocators.map((option) => option.getAttribute("value")));
  const targetValue = values.find(
    (value): value is string => value !== null && value !== "" && value !== baseValue,
  );
  expect(targetValue).toBeDefined();
  await targetSelect.selectOption(targetValue ?? "");
  await page.getByRole("button", { name: "Comparar", exact: true }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Comparación de análisis" }),
  ).toBeVisible();
  await expect(page.getByText("Coincidencia exacta").first()).toBeVisible();
  await expectNoAxeViolations(page);
});
