import { chromium, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ITERATIONS = parseInt(process.env.ITERATIONS || "20", 10);

const NAMES = [
  "Alice Johnson",
  "Bob Smith",
  "Carlos García",
  "Diana Lee",
  "Elena Petrova",
  "Frank Miller",
  "Grace Chen",
  "Hiro Tanaka",
  "Isla Murphy",
  "Jamal Williams",
  "Kira Novak",
  "Liam O'Brien",
  "Maya Patel",
  "Noah Kim",
  "Olivia Sánchez",
];

const DOMAINS = [
  "gmail.com",
  "outlook.com",
  "yahoo.com",
  "company.io",
  "example.org",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomEmail(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z]/g, "") + Math.floor(Math.random() * 9999);
  return `${slug}@${pick(DOMAINS)}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function typeSlowly(page: Page, selector: string, text: string) {
  const input = page.locator(selector);
  await input.click();
  for (const char of text) {
    await input.pressSequentially(char, { delay: 30 + Math.random() * 70 });
  }
}

/* ------------------------------------------------------------------
 * Scenarios — each generates different Sentry span/breadcrumb patterns
 * ------------------------------------------------------------------ */

/** 1. Happy path: fill everything correctly, submit once */
async function happyPath(page: Page) {
  const name = pick(NAMES);
  const email = randomEmail(name);
  const password = "Str0ng!Pass" + Math.floor(Math.random() * 999);

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('button:has-text("Sign up")', { timeout: 30000 });

  await typeSlowly(page, "#name", name);
  await page.locator("#name").press("Tab");
  await sleep(200 + Math.random() * 300);

  await typeSlowly(page, "#email", email);
  await page.locator("#email").press("Tab");
  await sleep(150 + Math.random() * 200);

  await typeSlowly(page, "#password", password);
  await page.locator("#password").press("Tab");
  await sleep(100 + Math.random() * 150);

  await typeSlowly(page, "#confirmPassword", password);
  await page.locator("#confirmPassword").press("Tab");
  await sleep(200);

  await page.click('button[type="submit"]');
  await page.waitForURL("**/signup/success", { timeout: 15000 }).catch(() => {});
  await sleep(1500);
}

/** 2. Submit empty form, then fix all fields and retry */
async function emptyThenFix(page: Page) {
  const name = pick(NAMES);
  const email = randomEmail(name);
  const password = "FixedP@ss" + Math.floor(Math.random() * 999);

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('button:has-text("Sign up")', { timeout: 30000 });

  // First attempt — empty
  await page.click('button[type="submit"]');
  await sleep(800);

  // Fix fields one by one
  await typeSlowly(page, "#name", name);
  await sleep(300);
  await typeSlowly(page, "#email", email);
  await sleep(300);
  await typeSlowly(page, "#password", password);
  await sleep(200);
  await typeSlowly(page, "#confirmPassword", password);
  await sleep(200);

  // Second attempt
  await page.click('button[type="submit"]');
  await page.waitForURL("**/signup/success", { timeout: 10000 }).catch(() => {});
  await sleep(1500);
}

/** 3. Mismatched passwords, then correct */
async function passwordMismatch(page: Page) {
  const name = pick(NAMES);
  const email = randomEmail(name);
  const password = "G00dPass!" + Math.floor(Math.random() * 999);

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('button:has-text("Sign up")', { timeout: 30000 });

  await typeSlowly(page, "#name", name);
  await page.locator("#name").press("Tab");
  await typeSlowly(page, "#email", email);
  await page.locator("#email").press("Tab");
  await typeSlowly(page, "#password", password);
  await page.locator("#password").press("Tab");
  await typeSlowly(page, "#confirmPassword", "wrongPassword123");
  await page.locator("#confirmPassword").press("Tab");
  await sleep(200);

  // Submit with mismatch
  await page.click('button[type="submit"]');
  await sleep(800);

  // Fix confirm password
  await page.locator("#confirmPassword").fill("");
  await typeSlowly(page, "#confirmPassword", password);
  await sleep(200);

  // Retry
  await page.click('button[type="submit"]');
  await page.waitForURL("**/signup/success", { timeout: 10000 }).catch(() => {});
  await sleep(1500);
}

/** 4. Invalid email, then correct */
async function invalidEmail(page: Page) {
  const name = pick(NAMES);
  const password = "Em@ilFix1" + Math.floor(Math.random() * 999);

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('button:has-text("Sign up")', { timeout: 30000 });

  await typeSlowly(page, "#name", name);
  await page.locator("#name").press("Tab");
  await typeSlowly(page, "#email", "not-an-email");
  await page.locator("#email").press("Tab");
  await typeSlowly(page, "#password", password);
  await page.locator("#password").press("Tab");
  await typeSlowly(page, "#confirmPassword", password);
  await sleep(200);

  await page.click('button[type="submit"]');
  await sleep(800);

  // Fix email
  await page.locator("#email").fill("");
  await typeSlowly(page, "#email", randomEmail(name));
  await sleep(200);

  await page.click('button[type="submit"]');
  await page.waitForURL("**/signup/success", { timeout: 10000 }).catch(() => {});
  await sleep(1500);
}

/** 5. Short password, then fix */
async function shortPassword(page: Page) {
  const name = pick(NAMES);
  const email = randomEmail(name);

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('button:has-text("Sign up")', { timeout: 30000 });

  await typeSlowly(page, "#name", name);
  await page.locator("#name").press("Tab");
  await typeSlowly(page, "#email", email);
  await page.locator("#email").press("Tab");
  await typeSlowly(page, "#password", "short");
  await page.locator("#password").press("Tab");
  await typeSlowly(page, "#confirmPassword", "short");
  await sleep(200);

  await page.click('button[type="submit"]');
  await sleep(800);

  const goodPass = "L0ngerP@ss" + Math.floor(Math.random() * 999);
  await page.locator("#password").fill("");
  await typeSlowly(page, "#password", goodPass);
  await page.locator("#confirmPassword").fill("");
  await typeSlowly(page, "#confirmPassword", goodPass);
  await sleep(200);

  await page.click('button[type="submit"]');
  await page.waitForURL("**/signup/success", { timeout: 10000 }).catch(() => {});
  await sleep(1500);
}

/** 6. Fill fields out of order (email first, then name, etc.) */
async function outOfOrder(page: Page) {
  const name = pick(NAMES);
  const email = randomEmail(name);
  const password = "OrdPass!" + Math.floor(Math.random() * 999);

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('button:has-text("Sign up")', { timeout: 30000 });

  // Start with email
  await typeSlowly(page, "#email", email);
  await page.locator("#email").press("Tab");
  await sleep(400);

  // Then confirm password
  await page.locator("#confirmPassword").click();
  await typeSlowly(page, "#confirmPassword", password);
  await page.locator("#confirmPassword").press("Tab");
  await sleep(300);

  // Then name
  await typeSlowly(page, "#name", name);
  await page.locator("#name").press("Tab");
  await sleep(300);

  // Then password
  await typeSlowly(page, "#password", password);
  await page.locator("#password").press("Tab");
  await sleep(200);

  await page.click('button[type="submit"]');
  await page.waitForURL("**/signup/success", { timeout: 10000 }).catch(() => {});
  await sleep(1500);
}

/** 7. Paste email instead of typing */
async function pasteEmail(page: Page) {
  const name = pick(NAMES);
  const email = randomEmail(name);
  const password = "P@stePass" + Math.floor(Math.random() * 999);

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('button:has-text("Sign up")', { timeout: 30000 });

  await typeSlowly(page, "#name", name);
  await page.locator("#name").press("Tab");

  // Simulate paste into email
  const emailInput = page.locator("#email");
  await emailInput.click();
  await emailInput.evaluate((el, val) => {
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer(),
    });
    el.dispatchEvent(event);
    (el as HTMLInputElement).value = val;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, email);
  await emailInput.fill(email);
  await emailInput.press("Tab");
  await sleep(200);

  await typeSlowly(page, "#password", password);
  await page.locator("#password").press("Tab");
  await typeSlowly(page, "#confirmPassword", password);
  await sleep(200);

  await page.click('button[type="submit"]');
  await page.waitForURL("**/signup/success", { timeout: 10000 }).catch(() => {});
  await sleep(1500);
}

/** 8. Multiple validation failures before success (3 attempts) */
async function multipleRetries(page: Page) {
  const name = pick(NAMES);
  const email = randomEmail(name);
  const password = "Retry@Pass" + Math.floor(Math.random() * 999);

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('button:has-text("Sign up")', { timeout: 30000 });

  // Attempt 1: empty
  await page.click('button[type="submit"]');
  await sleep(600);

  // Attempt 2: only name filled
  await typeSlowly(page, "#name", name);
  await page.click('button[type="submit"]');
  await sleep(600);

  // Attempt 3: fill rest
  await typeSlowly(page, "#email", email);
  await typeSlowly(page, "#password", password);
  await typeSlowly(page, "#confirmPassword", password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/signup/success", { timeout: 10000 }).catch(() => {});
  await sleep(1500);
}

/** 9. Slow/hesitant user — long dwell times between fields */
async function slowUser(page: Page) {
  const name = pick(NAMES);
  const email = randomEmail(name);
  const password = "SlowUser1!" + Math.floor(Math.random() * 999);

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('button:has-text("Sign up")', { timeout: 30000 });

  await page.locator("#name").click();
  await sleep(1500);
  await typeSlowly(page, "#name", name);
  await sleep(2000);
  await page.locator("#name").press("Tab");

  await sleep(1000);
  await typeSlowly(page, "#email", email);
  await sleep(1800);
  await page.locator("#email").press("Tab");

  await sleep(1200);
  await typeSlowly(page, "#password", password);
  await sleep(1500);
  await page.locator("#password").press("Tab");

  await sleep(800);
  await typeSlowly(page, "#confirmPassword", password);
  await sleep(500);

  await page.click('button[type="submit"]');
  await page.waitForURL("**/signup/success", { timeout: 10000 }).catch(() => {});
  await sleep(1500);
}

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */

const scenarios = [
  { name: "happy-path", fn: happyPath, weight: 4 },
  { name: "empty-then-fix", fn: emptyThenFix, weight: 2 },
  { name: "password-mismatch", fn: passwordMismatch, weight: 2 },
  { name: "invalid-email", fn: invalidEmail, weight: 2 },
  { name: "short-password", fn: shortPassword, weight: 1 },
  { name: "out-of-order", fn: outOfOrder, weight: 2 },
  { name: "paste-email", fn: pasteEmail, weight: 2 },
  { name: "multiple-retries", fn: multipleRetries, weight: 2 },
  { name: "slow-user", fn: slowUser, weight: 1 },
];

function pickWeighted() {
  const total = scenarios.reduce((s, sc) => s + sc.weight, 0);
  let r = Math.random() * total;
  for (const sc of scenarios) {
    r -= sc.weight;
    if (r <= 0) return sc;
  }
  return scenarios[0];
}

async function main() {
  console.log(`\n🚀 Generating ${ITERATIONS} test data sessions → Sentry\n`);
  console.log(`   Base URL : ${BASE_URL}`);
  console.log(`   Scenarios: ${scenarios.map((s) => s.name).join(", ")}\n`);

  const browser = await chromium.launch({ headless: true });

  for (let i = 1; i <= ITERATIONS; i++) {
    const scenario = pickWeighted();
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log(`  [${i}/${ITERATIONS}] Running "${scenario.name}" ...`);

    try {
      await scenario.fn(page);
      console.log(`  [${i}/${ITERATIONS}] ✅ "${scenario.name}" done`);
    } catch (err) {
      console.log(
        `  [${i}/${ITERATIONS}] ⚠️  "${scenario.name}" error: ${(err as Error).message}`
      );
    }

    // Give Sentry SDK time to flush envelopes before closing
    await sleep(2000);
    await context.close();
  }

  await browser.close();
  console.log(`\n✅ Done! ${ITERATIONS} sessions sent to Sentry.\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
