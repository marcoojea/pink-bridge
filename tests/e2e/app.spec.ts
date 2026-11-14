import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoAxeViolations(page: Page): Promise<void> {
  // Auditar en reposo: una animación de entrada en curso mezcla colores y falsea el contraste.
  await page.waitForFunction("document.getAnimations().every((a) => a.playState !== 'running')");
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function runDemo(page: Page): Promise<void> {
  await page.goto("/#/");
  await page.getByRole("button", { name: "Ver un ejemplo de página" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Resultados de la revisión" }),
  ).toBeVisible({
    timeout: 60_000,
  });
}

test("el formulario valida la dirección y enfoca el campo con un mensaje asociado", async ({
  page,
}) => {
  await page.goto("/#/");
  await page.getByRole("button", { name: "Revisar la página" }).click();

  const input = page.getByLabel("Dirección de la página");
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText("Escribe la dirección de la página que quieres revisar."),
  ).toBeVisible();

  await input.fill("ftp://ejemplo.com");
  await page.getByRole("button", { name: "Revisar la página" }).click();
  await expect(
    page.getByText(
      "Solo se pueden revisar páginas web. La dirección debe empezar por https:// o http://",
    ),
  ).toBeVisible();
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
  await page.getByLabel("Dirección de la página").fill("http://127.0.0.1/");
  await page.getByRole("button", { name: "Revisar la página" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "No se pudo terminar la revisión" }),
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("alert")).toHaveText("El destino no está permitido.");
  await expect(page.getByText(/no se ha podido comprobar/)).toBeVisible();
});

test("la demostración muestra progreso, resultados filtrables y detalle", async ({ page }) => {
  await page.goto("/#/");
  await page.getByRole("button", { name: "Ver un ejemplo de página" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Estamos revisando la página" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Resultados de la revisión" }),
  ).toBeVisible({
    timeout: 60_000,
  });

  await expect(page.getByText("Mostrando 5 problemas de 5 problemas.")).toBeVisible();

  await page.getByLabel("Gravedad").selectOption("critical");
  await expect(page.getByText("Mostrando 2 problemas de 5 problemas.")).toBeVisible();
  await page.getByLabel("Gravedad").selectOption("");

  await page.getByLabel("Tipo de problema").selectOption("needs_review");
  await expect(page.getByText("No hay problemas que coincidan con estos filtros.")).toBeVisible();
  await page.getByRole("button", { name: "Quitar filtros" }).click();

  await page.getByRole("button", { name: "Ver cómo arreglarlo: Imagen sin descripción" }).click();
  const detail = page.getByRole("region", { name: "Cómo arreglar: Imagen sin descripción" });
  await expect(detail).toBeFocused();
  await expect(detail.getByText("Norma WCAG relacionada")).toBeVisible();
  await expect(detail.getByText(/WCAG 1\.1\.1/)).toBeVisible();
});

test("los resultados avisan de que la revisión manual no está aprobada", async ({ page }) => {
  await runDemo(page);
  await expect(page.getByText(/Pink Bridge ayuda a encontrar problemas/)).toBeVisible();
  await expect(page.getByText(/certifica que la página cumpla WCAG/)).toBeVisible();
});

test("el histórico conserva los análisis y repetir uno crea otro nuevo", async ({ page }) => {
  await runDemo(page);
  const firstUrl = page.url();

  await page.goto("/#/historial");
  await expect(page.getByRole("heading", { level: 1, name: "Mis revisiones" })).toBeFocused();
  await expect(
    page.getByRole("link", { name: "https://demo.pinkbridge.test/" }).first(),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Repetir revisión de https://demo.pinkbridge.test/" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Resultados de la revisión" }),
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
  await expect(page.getByRole("heading", { level: 1, name: "Mis revisiones" })).toBeVisible();
  await expectNoAxeViolations(page);

  await runDemo(page);
  await expectNoAxeViolations(page);
});

test("una ruta desconocida muestra una página de no encontrada accesible", async ({ page }) => {
  await page.goto("/#/no-existe");
  await expect(
    page.getByRole("heading", { level: 1, name: "No encontramos esta página" }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test("revisar una incidencia guarda la nota y dos ejecuciones se comparan desde el histórico", async ({
  page,
}) => {
  await runDemo(page);
  await expect(page.getByRole("link", { name: "Datos completos (JSON)" })).toHaveAttribute(
    "download",
    "",
  );

  await page.getByRole("button", { name: "Ver cómo arreglarlo: Imagen sin descripción" }).click();
  const detail = page.getByRole("region", { name: "Cómo arreglar: Imagen sin descripción" });
  await detail.getByLabel("¿En qué punto estás?").selectOption("reviewed");
  await detail.getByLabel("Nota (opcional)").fill("Revisada en QA");
  await detail.getByRole("button", { name: "Guardar mi seguimiento" }).click();
  await expect(detail.getByRole("status")).toHaveText("Tu seguimiento está guardado.");
  await expect(detail.getByText("Tu revisión: Revisado")).toBeVisible();

  await runDemo(page);
  await page.goto("/#/historial");
  const baseSelect = page.getByLabel("Primera revisión (la más antigua)");
  await baseSelect.selectOption({ index: 1 });
  const baseValue = await baseSelect.inputValue();

  // El destino debe ser un análisis distinto de la base: se elige por valor, no por posición.
  const targetSelect = page.getByLabel("Segunda revisión (la más reciente)");
  const optionLocators = await targetSelect.locator("option").all();
  const values = await Promise.all(optionLocators.map((option) => option.getAttribute("value")));
  const targetValue = values.find(
    (value): value is string => value !== null && value !== "" && value !== baseValue,
  );
  expect(targetValue).toBeDefined();
  await targetSelect.selectOption(targetValue ?? "");
  await page.getByRole("button", { name: "Comparar", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Qué ha cambiado" })).toBeVisible();
  await expect(page.getByText("Mismo problema, misma parte de la página").first()).toBeVisible();
  await expectNoAxeViolations(page);
});

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate<number>(
    "document.documentElement.scrollWidth - document.documentElement.clientWidth",
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("sin desplazamiento horizontal a 320 px en portada y resultados", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/#/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await runDemo(page);
  await expectNoHorizontalScroll(page);
});

test("el formulario de revisión se recorre completo con teclado", async ({ page }) => {
  await runDemo(page);
  await page.getByRole("button", { name: "Ver cómo arreglarlo: Imagen sin descripción" }).focus();
  await page.keyboard.press("Enter");

  const detail = page.getByRole("region", { name: "Cómo arreglar: Imagen sin descripción" });
  await expect(detail).toBeFocused();
  await detail.getByLabel("¿En qué punto estás?").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expect(detail.getByLabel("Nota (opcional)")).toBeFocused();
  await page.keyboard.type("Revisado con teclado");
  await page.keyboard.press("Tab");
  await expect(detail.getByRole("button", { name: "Guardar mi seguimiento" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(detail.getByRole("status")).toHaveText("Tu seguimiento está guardado.");
});

test("el recorrido de sitio muestra el resumen con páginas auditadas", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/#/");
  await page.getByRole("button", { name: "Ver un ejemplo de sitio" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Resultados de la revisión" }),
  ).toBeVisible({
    timeout: 220_000,
  });
  await expect(page.getByText("Problemas automáticos", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Instrucciones para un asistente de programación (Markdown)" }),
  ).toBeVisible();
});

test("copiar las instrucciones para el asistente confirma la copia", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await runDemo(page);
  await page.getByRole("button", { name: "Copiar instrucciones para el asistente" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Instrucciones copiadas" }),
  ).toBeVisible();
});

test("los filtros de problemas se conservan al recargar la página", async ({ page }) => {
  await runDemo(page);
  await page.getByLabel("Gravedad").selectOption("critical");
  await expect(page).toHaveURL(/gravedad=critical/);
  await page.reload();
  await expect(page.getByLabel("Gravedad")).toHaveValue("critical");
});
