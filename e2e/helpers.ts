import { Page } from "@playwright/test";

/**
 * Intercepts all outgoing requests to the Sentry envelope endpoint
 * and collects the raw envelope bodies for later assertion.
 */
export interface SentryEnvelope {
  url: string;
  body: string;
}

export async function collectSentryEnvelopes(page: Page) {
  const envelopes: SentryEnvelope[] = [];

  await page.route(
    (url) =>
      url.pathname === "/monitoring" ||
      url.hostname.includes("sentry.io"),
    async (route) => {
      const request = route.request();
      const body = request.postData() ?? "";
      envelopes.push({ url: request.url(), body });
      await route.fulfill({ status: 200, body: "{}" });
    }
  );

  return envelopes;
}

/**
 * Parse a Sentry envelope body into its header + item entries.
 * Each envelope is newline-delimited JSON:
 *   line 0 = envelope header
 *   line 1 = item header
 *   line 2 = item payload
 *   (repeat for additional items)
 */
export function parseEnvelope(raw: string) {
  const lines = raw.split("\n").filter(Boolean);
  const items: Array<{ header: Record<string, unknown>; payload: Record<string, unknown> }> = [];

  let envelopeHeader: Record<string, unknown> = {};
  try {
    envelopeHeader = JSON.parse(lines[0]);
  } catch {
    /* ignore */
  }

  for (let i = 1; i < lines.length; i += 2) {
    try {
      const header = JSON.parse(lines[i]);
      const payload = i + 1 < lines.length ? JSON.parse(lines[i + 1]) : {};
      items.push({ header, payload });
    } catch {
      /* skip malformed items */
    }
  }

  return { envelopeHeader, items };
}

/**
 * Extract all transaction/span names from captured envelopes.
 */
export function extractSpanNames(envelopes: SentryEnvelope[]): string[] {
  const names: string[] = [];
  for (const env of envelopes) {
    const { items } = parseEnvelope(env.body);
    for (const item of items) {
      const p = item.payload as Record<string, unknown>;
      if (p.transaction) names.push(p.transaction as string);
      if (p.type === "transaction" && p.spans) {
        for (const span of p.spans as Array<Record<string, unknown>>) {
          if (span.description) names.push(span.description as string);
        }
      }
    }
  }
  return names;
}

/**
 * Extract breadcrumb categories from captured envelopes.
 */
export function extractBreadcrumbCategories(
  envelopes: SentryEnvelope[]
): string[] {
  const categories: string[] = [];
  for (const env of envelopes) {
    const { items } = parseEnvelope(env.body);
    for (const item of items) {
      const p = item.payload as Record<string, unknown>;
      const breadcrumbs =
        (p.breadcrumbs as { values?: Array<{ category?: string }> })
          ?.values ?? [];
      for (const bc of breadcrumbs) {
        if (bc.category) categories.push(bc.category);
      }
    }
  }
  return categories;
}

/**
 * Fill the signup form with the given values.
 */
export async function fillSignupForm(
  page: Page,
  data: {
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }
) {
  if (data.name !== undefined) {
    await page.getByLabel("Full name").click();
    await page.getByLabel("Full name").fill(data.name);
  }
  if (data.email !== undefined) {
    await page.getByLabel("Email address").click();
    await page.getByLabel("Email address").fill(data.email);
  }
  if (data.password !== undefined) {
    await page.getByLabel("Password", { exact: true }).click();
    await page.getByLabel("Password", { exact: true }).fill(data.password);
  }
  if (data.confirmPassword !== undefined) {
    await page.getByLabel("Confirm password").click();
    await page.getByLabel("Confirm password").fill(data.confirmPassword);
  }
}
