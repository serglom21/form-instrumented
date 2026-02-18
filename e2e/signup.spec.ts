import { test, expect } from "@playwright/test";
import {
  collectSentryEnvelopes,
  fillSignupForm,
  parseEnvelope,
  type SentryEnvelope,
} from "./helpers";

/* ------------------------------------------------------------------ */
/* Helpers to inspect captured Sentry data                             */
/* ------------------------------------------------------------------ */

function allEnvelopeBodies(envelopes: SentryEnvelope[]) {
  return envelopes.map((e) => e.body).join("\n");
}

function getTransactionItems(envelopes: SentryEnvelope[]) {
  const txns: Array<Record<string, unknown>> = [];
  for (const env of envelopes) {
    const { items } = parseEnvelope(env.body);
    for (const item of items) {
      if (
        (item.header as Record<string, unknown>).type === "transaction" ||
        (item.payload as Record<string, unknown>).type === "transaction"
      ) {
        txns.push(item.payload as Record<string, unknown>);
      }
    }
  }
  return txns;
}

/** Locate the server-error alert banner (not the Next.js route announcer). */
function serverAlert(page: import("@playwright/test").Page) {
  return page.locator('[role="alert"]').filter({ hasNotText: "" }).first();
}

/* ================================================================== */
/* 1. HAPPY PATH — Successful signup                                   */
/* ================================================================== */

test.describe("Signup — Happy Path", () => {
  test("completes signup and redirects to success page", async ({
    page,
  }) => {
    const envelopes = await collectSentryEnvelopes(page);

    await page.route("**/api/signup", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, userId: "user_test123" }),
      });
    });

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Create your account" })
    ).toBeVisible();

    await fillSignupForm(page, {
      name: "Jane Doe",
      email: "jane@example.com",
      password: "secureP@ss1",
      confirmPassword: "secureP@ss1",
    });

    await page.getByLabel("Confirm password").press("Tab");
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page).toHaveURL("/signup/success");
    await expect(page.getByText("Account created!")).toBeVisible();

    await page.waitForTimeout(3000);

    const raw = allEnvelopeBodies(envelopes);
    expect(raw).toContain("signup.validate");
    expect(raw).toContain("signup.api_call");
    expect(raw).toContain("signup.lifecycle");
    expect(raw).toContain("signup.success");
  });

  test("Sentry breadcrumbs include form interaction lifecycle", async ({
    page,
  }) => {
    const envelopes = await collectSentryEnvelopes(page);

    await page.route("**/api/signup", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, userId: "user_abc" }),
      });
    });

    await page.goto("/");

    await page.getByLabel("Full name").click();
    await page.getByLabel("Full name").fill("Test User");
    await page.getByLabel("Full name").press("Tab");

    await page.getByLabel("Email address").fill("test@example.com");
    await page.getByLabel("Email address").press("Tab");

    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByLabel("Password", { exact: true }).press("Tab");

    await page.getByLabel("Confirm password").fill("password123");
    await page.getByLabel("Confirm password").press("Tab");

    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page).toHaveURL("/signup/success");
    await page.waitForTimeout(3000);

    const raw = allEnvelopeBodies(envelopes);

    expect(raw).toContain("signup.field.focus");
    expect(raw).toContain("signup.field.blur");
    expect(raw).toContain("signup.submit_attempt");
  });
});

/* ================================================================== */
/* 2. VALIDATION ERRORS                                                */
/* ================================================================== */

test.describe("Signup — Validation Errors", () => {
  test("shows errors when submitting empty form", async ({ page }) => {
    const envelopes = await collectSentryEnvelopes(page);

    await page.goto("/");
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText("Name is required.")).toBeVisible();
    await expect(page.getByText("Email is required.")).toBeVisible();
    await expect(page.getByText("Password is required.")).toBeVisible();
    await expect(
      page.getByText("Please confirm your password.")
    ).toBeVisible();

    await expect(page).toHaveURL("/");

    // Sentry validation breadcrumb is attached to the current pageload
    // transaction. Wait for it to finish flushing.
    await page.waitForTimeout(3000);

    const raw = allEnvelopeBodies(envelopes);
    expect(raw).toContain("signup.validation");
  });

  test("shows specific validation error for invalid email", async ({
    page,
  }) => {
    await page.goto("/");

    await fillSignupForm(page, {
      name: "Test",
      email: "not-an-email",
      password: "password123",
      confirmPassword: "password123",
    });

    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(
      page.getByText("Please enter a valid email address.")
    ).toBeVisible();
  });

  test("shows error when passwords don't match", async ({ page }) => {
    await page.goto("/");

    await fillSignupForm(page, {
      name: "Test",
      email: "test@example.com",
      password: "password123",
      confirmPassword: "differentPassword",
    });

    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText("Passwords do not match.")).toBeVisible();
  });

  test("shows error for short password", async ({ page }) => {
    await page.goto("/");

    await fillSignupForm(page, {
      name: "Test",
      email: "test@example.com",
      password: "short",
      confirmPassword: "short",
    });

    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(
      page.getByText("Password must be at least 8 characters.")
    ).toBeVisible();
  });

  test("clears error when user corrects a field", async ({ page }) => {
    const envelopes = await collectSentryEnvelopes(page);

    await page.route("**/api/signup", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, userId: "user_corrected" }),
      });
    });

    await page.goto("/");

    // Submit empty to trigger errors
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByText("Name is required.")).toBeVisible();

    // Correct all fields and resubmit so a new transaction flushes breadcrumbs
    await page.getByLabel("Full name").fill("Jane");
    await expect(page.getByText("Name is required.")).not.toBeVisible();

    await page.getByLabel("Email address").fill("jane@example.com");
    await page
      .getByLabel("Password", { exact: true })
      .fill("password123");
    await page.getByLabel("Confirm password").fill("password123");

    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL("/signup/success");

    await page.waitForTimeout(3000);

    const raw = allEnvelopeBodies(envelopes);
    expect(raw).toContain("signup.field.error_corrected");
  });
});

/* ================================================================== */
/* 3. API ERROR HANDLING                                               */
/* ================================================================== */

test.describe("Signup — API Errors", () => {
  test("displays server error on 422 response", async ({ page }) => {
    const envelopes = await collectSentryEnvelopes(page);

    await page.route("**/api/signup", async (route) => {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Validation failed.",
          details: { email: "Already taken." },
        }),
      });
    });

    await page.goto("/");

    await fillSignupForm(page, {
      name: "Jane Doe",
      email: "taken@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText("Validation failed.")).toBeVisible();

    await page.waitForTimeout(3000);

    const raw = allEnvelopeBodies(envelopes);
    expect(raw).toContain("Signup API returned an error");
  });

  test("displays server error on 409 conflict", async ({ page }) => {
    await page.route("**/api/signup", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: "A user with this email already exists.",
        }),
      });
    });

    await page.goto("/");

    await fillSignupForm(page, {
      name: "Jane Doe",
      email: "duplicate@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(
      page.getByText("A user with this email already exists.")
    ).toBeVisible();
  });

  test("displays server error on 500 response", async ({ page }) => {
    await page.route("**/api/signup", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await page.goto("/");

    await fillSignupForm(page, {
      name: "Jane Doe",
      email: "jane@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText("Internal server error")).toBeVisible();
  });

  test("handles network failure gracefully", async ({ page }) => {
    const envelopes = await collectSentryEnvelopes(page);

    await page.route("**/api/signup", async (route) => {
      await route.abort("connectionrefused");
    });

    await page.goto("/");

    await fillSignupForm(page, {
      name: "Jane Doe",
      email: "jane@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(
      page.getByText("Network error. Please check your connection")
    ).toBeVisible();

    await page.waitForTimeout(3000);

    const raw = allEnvelopeBodies(envelopes);
    expect(raw).toContain("signup");
  });
});

/* ================================================================== */
/* 4. FORM METRICS GRANULARITY                                         */
/* ================================================================== */

test.describe("Signup — Form Metrics", () => {
  test("tracks per-field focus and blur timing", async ({ page }) => {
    const envelopes = await collectSentryEnvelopes(page);

    await page.route("**/api/signup", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, userId: "user_metrics1" }),
      });
    });

    await page.goto("/");

    await page.getByLabel("Full name").click();
    await page.getByLabel("Full name").fill("Slow Typer");
    await page.waitForTimeout(500);
    await page.getByLabel("Full name").press("Tab");

    await page.getByLabel("Email address").fill("slow@example.com");
    await page.getByLabel("Email address").press("Tab");

    await page
      .getByLabel("Password", { exact: true })
      .fill("password123");
    await page.getByLabel("Password", { exact: true }).press("Tab");

    await page.getByLabel("Confirm password").fill("password123");
    await page.getByLabel("Confirm password").press("Tab");

    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL("/signup/success");

    await page.waitForTimeout(3000);

    const raw = allEnvelopeBodies(envelopes);

    expect(raw).toContain("signup.field.dwell.name");
    expect(raw).toContain("signup.field.dwell.email");
    expect(raw).toContain("signup.field.dwell.password");
    expect(raw).toContain("signup.field.dwell.confirmPassword");

    expect(raw).toContain("signup.form_completed");
    expect(raw).toContain("signup.field_breakdown");
  });

  test("tracks paste events", async ({ page }) => {
    const envelopes = await collectSentryEnvelopes(page);

    await page.route("**/api/signup", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, userId: "user_paste" }),
      });
    });

    await page.goto("/");

    const emailInput = page.getByLabel("Email address");
    await emailInput.click();
    await emailInput.evaluate((el) => {
      const event = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer(),
      });
      el.dispatchEvent(event);
    });
    await emailInput.fill("pasted@example.com");

    await page.getByLabel("Full name").fill("Paste Tester");
    await page
      .getByLabel("Password", { exact: true })
      .fill("password123");
    await page.getByLabel("Confirm password").fill("password123");

    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL("/signup/success");

    await page.waitForTimeout(3000);

    const raw = allEnvelopeBodies(envelopes);
    expect(raw).toContain("signup.field.paste");
  });

  test("tracks multiple submission attempts", async ({ page }) => {
    const envelopes = await collectSentryEnvelopes(page);

    await page.route("**/api/signup", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, userId: "user_multi" }),
      });
    });

    await page.goto("/");

    // First attempt — empty form
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByText("Name is required.")).toBeVisible();

    // Second attempt — partial
    await page.getByLabel("Full name").fill("Jane");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByText("Email is required.")).toBeVisible();

    // Third attempt — everything correct
    await page.getByLabel("Email address").fill("jane@example.com");
    await page
      .getByLabel("Password", { exact: true })
      .fill("password123");
    await page.getByLabel("Confirm password").fill("password123");
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page).toHaveURL("/signup/success");
    await page.waitForTimeout(3000);

    const raw = allEnvelopeBodies(envelopes);

    expect(raw).toContain("signup.submit_attempt");
    expect(raw).toContain("signup.form_completed");
  });

  test("tracks field visit sequence", async ({ page }) => {
    const envelopes = await collectSentryEnvelopes(page);

    await page.route("**/api/signup", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, userId: "user_seq" }),
      });
    });

    await page.goto("/");

    // Visit fields in a non-standard order
    await page.getByLabel("Email address").click();
    await page.getByLabel("Email address").fill("test@example.com");

    await page.getByLabel("Full name").click();
    await page.getByLabel("Full name").fill("Test User");

    await page.getByLabel("Confirm password").click();
    await page.getByLabel("Confirm password").fill("password123");

    await page.getByLabel("Password", { exact: true }).click();
    await page
      .getByLabel("Password", { exact: true })
      .fill("password123");

    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL("/signup/success");

    await page.waitForTimeout(3000);

    const raw = allEnvelopeBodies(envelopes);

    expect(raw).toContain(
      "email -> name -> confirmPassword -> password"
    );
  });

  test("tracks error correction flow", async ({ page }) => {
    const envelopes = await collectSentryEnvelopes(page);

    await page.route("**/api/signup", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, userId: "user_correct" }),
      });
    });

    await page.goto("/");

    // Submit with invalid data to trigger errors
    await fillSignupForm(page, {
      name: "",
      email: "bad",
      password: "short",
      confirmPassword: "nope",
    });

    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText("Name is required.")).toBeVisible();
    await expect(
      page.getByText("Please enter a valid email address.")
    ).toBeVisible();

    // Fix all fields
    await page.getByLabel("Full name").fill("Jane Doe");
    await page.getByLabel("Email address").fill("jane@example.com");
    await page
      .getByLabel("Password", { exact: true })
      .fill("password123");
    await page.getByLabel("Confirm password").fill("password123");

    // Resubmit — this triggers a navigation transaction that carries the breadcrumbs
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL("/signup/success");

    await page.waitForTimeout(3000);

    const raw = allEnvelopeBodies(envelopes);
    expect(raw).toContain("signup.field.error_corrected");
  });
});

/* ================================================================== */
/* 5. UI BEHAVIOUR                                                     */
/* ================================================================== */

test.describe("Signup — UI Behaviour", () => {
  test("submit button shows loading state", async ({ page }) => {
    await page.route("**/api/signup", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, userId: "user_loading" }),
      });
    });

    await page.goto("/");

    await fillSignupForm(page, {
      name: "Jane Doe",
      email: "jane@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(
      page.getByRole("button", { name: "Creating account..." })
    ).toBeVisible();

    await expect(page).toHaveURL("/signup/success");
  });

  test("form fields have correct aria-invalid states", async ({ page }) => {
    await page.goto("/");

    const nameInput = page.getByLabel("Full name");
    await expect(nameInput).toHaveAttribute("aria-invalid", "false");

    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(nameInput).toHaveAttribute("aria-invalid", "true");
  });

  test("success page has link back to signup", async ({ page }) => {
    await page.route("**/api/signup", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, userId: "user_back" }),
      });
    });

    await page.goto("/");

    await fillSignupForm(page, {
      name: "Jane",
      email: "jane@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL("/signup/success");

    await page.getByRole("link", { name: "Back to sign up" }).click();
    await expect(page).toHaveURL("/");
  });
});

/* ================================================================== */
/* 6. SENTRY INTEGRATION VERIFICATION                                  */
/* ================================================================== */

test.describe("Signup — Sentry Integration", () => {
  test("Sentry envelope is sent to the tunnel route", async ({ page }) => {
    const envelopes = await collectSentryEnvelopes(page);

    await page.route("**/api/signup", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, userId: "user_tunnel" }),
      });
    });

    await page.goto("/");

    await fillSignupForm(page, {
      name: "Tunnel Test",
      email: "tunnel@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL("/signup/success");

    await page.waitForTimeout(3000);

    expect(envelopes.length).toBeGreaterThan(0);

    const tunnelHits = envelopes.filter((e) =>
      e.url.includes("/monitoring")
    );
    expect(tunnelHits.length).toBeGreaterThan(0);
  });

  test("Sentry envelopes contain the correct DSN", async ({ page }) => {
    const envelopes = await collectSentryEnvelopes(page);

    await page.goto("/");
    await page.getByRole("button", { name: "Sign up" }).click();

    await page.waitForTimeout(3000);

    const raw = allEnvelopeBodies(envelopes);
    expect(raw).toContain("o4508236363464704.ingest.us.sentry.io");
  });

  test("captured events include the app tag", async ({ page }) => {
    const envelopes = await collectSentryEnvelopes(page);

    await page.goto("/");
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.waitForTimeout(3000);

    const raw = allEnvelopeBodies(envelopes);
    expect(raw).toContain("form-tracker");
  });
});
