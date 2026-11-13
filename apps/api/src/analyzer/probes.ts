import type { Page } from "playwright";

export interface PageObservations {
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly badResponses: readonly { readonly url: string; readonly status: number }[];
  readonly mixedContent: readonly string[];
}

const MAX_OBSERVATIONS = 50;

/** Registra errores de consola, recursos con error HTTP y contenido mixto mientras carga la página. */
export function observe(page: Page, secure: boolean): { snapshot(): PageObservations } {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const badResponses: { url: string; status: number }[] = [];
  const mixedContent: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error" && consoleErrors.length < MAX_OBSERVATIONS) {
      consoleErrors.push(message.text().slice(0, 300));
    }
  });
  page.on("pageerror", (error) => {
    if (pageErrors.length < MAX_OBSERVATIONS) {
      pageErrors.push(error.message.slice(0, 300));
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && badResponses.length < MAX_OBSERVATIONS) {
      badResponses.push({ url: response.url(), status: response.status() });
    }
  });
  page.on("request", (request) => {
    if (secure && request.url().startsWith("http://") && mixedContent.length < MAX_OBSERVATIONS) {
      mixedContent.push(request.url());
    }
  });

  return {
    snapshot: () => ({
      consoleErrors: [...consoleErrors],
      pageErrors: [...pageErrors],
      badResponses: [...badResponses],
      mixedContent: [...mixedContent],
    }),
  };
}

/** Enlaces http(s) de la página, tal como los resuelve el navegador. */
export async function collectLinks(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(
    "Array.from(document.querySelectorAll('a[href]')).map((a) => a.href).slice(0, 300)",
  );
}

/** Mientras está activo, las peticiones no-GET se responden localmente y nunca salen a la red. */
export interface MutationGuard {
  active: boolean;
  intercepted: number;
}

export type EmptySubmitResult =
  "validation" | "feedback" | "accepted_empty" | "silent" | "not_submittable";

export interface FormProbe {
  readonly index: number;
  readonly fields: number;
  readonly requiredFields: number;
  readonly emptySubmit: EmptySubmitResult;
  readonly mutationsIntercepted: number;
}

interface FormInfo {
  readonly fields: number;
  readonly requiredFields: number;
  readonly typedFields: number;
}

const MAX_FORMS = 3;

const FORM_INFO = `(() => {
  const f = document.querySelectorAll('form')[__INDEX__];
  if (!f) return null;
  const fields = Array.from(f.querySelectorAll('input,textarea,select')).filter(
    (el) => !['hidden','submit','button','reset','image','file'].includes(el.type));
  return {
    fields: fields.length,
    requiredFields: fields.filter((el) => el.required).length,
    typedFields: fields.filter((el) => ['email','url','tel','number','date'].includes(el.type)).length,
  };
})()`;

const EMPTY_SUBMIT = `(async () => {
  const f = document.querySelectorAll('form')[__INDEX__];
  if (!f) return 'not_submittable';
  const expectsValidation = __EXPECTS__;
  if (!f.noValidate && !f.checkValidity()) { f.reportValidity(); return 'validation'; }
  try { f.requestSubmit(); } catch (e) { return 'not_submittable'; }
  await new Promise((r) => setTimeout(r, 400));
  const feedback = document.querySelector('[aria-invalid="true"], [role="alert"], .error, .field-error');
  if (feedback) return 'feedback';
  return expectsValidation ? 'silent' : 'accepted_empty';
})()`;

const FILL_AND_SUBMIT = `(() => {
  const f = document.querySelectorAll('form')[__INDEX__];
  if (!f) return false;
  const values = { text: 'Prueba QA', search: 'Prueba QA', email: 'qa@example.com', url: 'https://example.com/qa',
    tel: '600000000', number: '1', date: '2026-01-01', password: 'Clave-de-prueba-1' };
  for (const el of Array.from(f.querySelectorAll('input,textarea,select'))) {
    if (['hidden','submit','button','reset','image','file'].includes(el.type)) continue;
    if (el.tagName === 'SELECT') { const opt = Array.from(el.options).find((o) => o.value); if (opt) el.value = opt.value; }
    else if (el.type === 'checkbox' || el.type === 'radio') el.checked = true;
    else el.value = values[el.type] ?? 'Texto de prueba QA';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  try { f.requestSubmit(); } catch (e) { return false; }
  return true;
})()`;

async function openPage(page: Page, url: string, timeout: number): Promise<void> {
  await page.goto(url, { waitUntil: "load", timeout });
}

/**
 * Sondea hasta MAX_FORMS formularios de la página: envío vacío (¿hay validación o feedback?) y envío con datos
 * de prueba. Las mutaciones se interceptan con el guardia: nada llega al servidor del sitio.
 */
export async function probeForms(
  page: Page,
  pageUrl: string,
  guard: MutationGuard,
  navigationMs: number,
): Promise<FormProbe[]> {
  await openPage(page, pageUrl, navigationMs);
  const count = await page.evaluate<number>("document.querySelectorAll('form').length");
  const results: FormProbe[] = [];

  for (let index = 0; index < Math.min(count, MAX_FORMS); index += 1) {
    await openPage(page, pageUrl, navigationMs);
    const info = await page.evaluate<FormInfo | null>(
      FORM_INFO.replace("__INDEX__", String(index)),
    );
    if (info === null) {
      continue;
    }
    const expects = info.requiredFields > 0 || info.typedFields > 0;

    await openPage(page, pageUrl, navigationMs);
    const before = guard.intercepted;
    let emptySubmit: EmptySubmitResult;
    guard.active = true;
    try {
      emptySubmit = await page.evaluate<EmptySubmitResult>(
        EMPTY_SUBMIT.replace("__INDEX__", String(index)).replace("__EXPECTS__", String(expects)),
      );
    } catch {
      emptySubmit = "accepted_empty";
    } finally {
      guard.active = false;
    }

    await openPage(page, pageUrl, navigationMs);
    guard.active = true;
    try {
      await page.evaluate<boolean>(FILL_AND_SUBMIT.replace("__INDEX__", String(index)));
      await page.waitForTimeout(300);
    } catch {
      // Una navegación inesperada durante el envío de prueba no invalida el resto de sondas.
    } finally {
      guard.active = false;
    }

    results.push({
      index,
      fields: info.fields,
      requiredFields: info.requiredFields,
      emptySubmit,
      mutationsIntercepted: guard.intercepted - before,
    });
  }
  return results;
}
