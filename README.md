# Form Tracker

A Next.js signup form with deep [Sentry](https://sentry.io) instrumentation — every field interaction, validation attempt, and API call is tracked.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000 (requires Node >= 20)
npm run test:e2e     # run the 22 Playwright E2E tests
```

## What's instrumented

### Per-field form metrics (`useFormMetrics` hook)

| Signal | Sentry type | Detail |
|---|---|---|
| First interaction | Breadcrumb `signup.lifecycle` | Timestamp of first focus on any field |
| Field focus | Breadcrumb `signup.field.focus` + span `ui.field.focus` | Per-field focus count, visit index |
| Field blur / dwell | Breadcrumb `signup.field.blur` + span `ui.field.dwell` | Dwell time in ms, total focus time, empty-on-leave detection |
| Keystrokes | Breadcrumb `signup.field.change` | Logged at keystroke #1 and every 10th thereafter |
| Paste detection | Breadcrumb `signup.field.paste` + log `signup.field_paste` | Per-field paste count |
| Validation error shown | Breadcrumb `signup.field.error_shown` | Which field displayed an error |
| Error correction | Breadcrumb `signup.field.error_corrected` + log | When user fixes a previously-errored field |
| Field cleared | Log `signup.field_cleared` | User empties a field after typing |
| Submission attempt | Breadcrumb `signup.submit_attempt` + log | Counter of how many times submit was pressed |
| Final summary | Span `ui.form.complete` + `ui.form.field_breakdown` | Total duration, visit sequence, per-field metrics |
| Visit sequence | Span attribute `form.visit_sequence` | e.g. `email -> name -> password -> confirmPassword` |

### Page & API level

| Signal | Sentry type | Detail |
|---|---|---|
| Client validation | Span `ui.validate` | Duration + fields-filled count |
| API call | Span `http.client` | Fetch to `/api/signup` with status code |
| API error | `captureMessage` + log `signup.api_error` | Status + response body |
| Network error | `captureException` | Catch block in fetch |
| Server validation | Span `validate` | Defense-in-depth re-validation |
| DB persist | Span `db` | Simulated user creation |
| Welcome email | Span `email.send` | Simulated email send |
| Duplicate email | Log `signup.duplicate_email` | 409 Conflict path |
| Success | Breadcrumb + log `signup.success` | User ID returned |
| React errors | `global-error.tsx` | `captureException` in error boundary |
| Server errors | `onRequestError` | Middleware / server component errors |
| Route transitions | `onRouterTransitionStart` | Client-side navigation timing |
| Session Replay | `replayIntegration` | Full session recordings |

## E2E test coverage (22 tests)

| Suite | Tests |
|---|---|
| **Happy Path** | Successful signup + redirect; Sentry breadcrumb lifecycle |
| **Validation Errors** | Empty form; invalid email; password mismatch; short password; error correction clears UI |
| **API Errors** | 422 / 409 / 500 responses; network failure |
| **Form Metrics** | Per-field dwell timing; paste tracking; multiple submit attempts; field visit sequence; error correction flow |
| **UI Behaviour** | Loading button state; aria-invalid states; success page back-link |
| **Sentry Integration** | Tunnel route used; DSN present in envelopes; `form-tracker` app tag |

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | `.env.local` | Sentry DSN |
| `SENTRY_AUTH_TOKEN` | CI env | Source map upload |
| `SENTRY_ORG` | CI env / `next.config.ts` | Sentry org slug |
| `SENTRY_PROJECT` | CI env / `next.config.ts` | Sentry project slug |
