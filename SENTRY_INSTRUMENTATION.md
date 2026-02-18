# Sentry Instrumentation Reference

This document is the canonical reference for every custom Sentry signal emitted by this application — spans, attributes, breadcrumbs, structured logs, captures, tags, and user context. Each entry links to its exact location in the source code.

---

## Table of Contents

- [Spans](#spans)
- [Span Attributes Set After Creation](#span-attributes-set-after-creation)
- [Breadcrumbs](#breadcrumbs)
- [Structured Logs (Sentry.logger)](#structured-logs-sentrylogger)
- [Captures](#captures)
- [Tags](#tags)
- [User Context](#user-context)
- [SDK Integrations & Hooks](#sdk-integrations--hooks)

---

## Spans

All spans use `Sentry.startSpan(...)`. The `name` and `op` fields are listed for each.

### `signup.validate`

**Op:** `ui.validate` | **Layer:** Client
**Source:** [`src/app/page.tsx#L104`](https://github.com/serglom21/form-instrumented/blob/main/src/app/page.tsx#L104)

Wraps the synchronous client-side validation call on form submit. Finishes immediately after `validateSignup` returns.

| Attribute | Type | Description |
|-----------|------|-------------|
| `form.fields_filled` | `number` | Count of fields with a non-empty trimmed value at submit time |
| `form.total_fields` | `number` | Total number of tracked fields (`4`) |

---

### `signup.api_call`

**Op:** `http.client` | **Layer:** Client
**Source:** [`src/app/page.tsx#L151`](https://github.com/serglom21/form-instrumented/blob/main/src/app/page.tsx#L151)

Wraps the `fetch` call to `POST /api/signup`. The span stays open until the response is received so that `http.status_code` can be set on it.

| Attribute | Type | Description |
|-----------|------|-------------|
| `http.status_code` | `number` | HTTP response status (set at [`L163`](https://github.com/serglom21/form-instrumented/blob/main/src/app/page.tsx#L163) after response arrives) |

---

### `POST /api/signup`

**Op:** `http.server` | **Layer:** Server
**Source:** [`src/app/api/signup/route.ts#L13`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L13)

Root span that wraps the entire API route handler. All other server spans are children of this one. `signup.outcome` is set on this span at every exit path.

| Attribute | Type | Values | Set at |
|-----------|------|--------|--------|
| `signup.outcome` | `string` | `"bad_request"`, `"validation_error"`, `"success"`, `"conflict"`, `"internal_error"` | [L28](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L28), [L75](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L75), [L128](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L128), [L144](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L144), [L156](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L156) |
| `signup.validation_errors` | `string` | Comma-separated list of failed field names | [L76–78](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L76) |
| `signup.user_id` | `string` | Generated user ID (e.g. `user_a1b2c3d4`) | [L129](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L129) |

---

### `signup.parse_body`

**Op:** `serialize.parse` | **Layer:** Server
**Source:** [`src/app/api/signup/route.ts#L20`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L20)

Wraps `request.json()`. If this span throws, a `captureMessage` is emitted and the root span is marked `bad_request`.

No custom attributes.

---

### `signup.server_validate`

**Op:** `validate` | **Layer:** Server
**Source:** [`src/app/api/signup/route.ts#L42`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L42)

Wraps the server-side re-validation of the request body fields. Presence of each field is recorded as a boolean attribute to catch clients that strip fields before sending.

| Attribute | Type | Description |
|-----------|------|-------------|
| `validate.has_name` | `boolean` | Whether `name` was present in the request body |
| `validate.has_email` | `boolean` | Whether `email` was present in the request body |
| `validate.has_password` | `boolean` | Whether `password` was present in the request body |

---

### `signup.persist_user`

**Op:** `db` | **Layer:** Server
**Source:** [`src/app/api/signup/route.ts#L89`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L89)

Simulates a database write (150 ms delay). Randomly throws a `ConflictError` (~10% of the time) to simulate a duplicate-email scenario.

| Attribute | Type | Description |
|-----------|------|-------------|
| `db.system` | `string` | Always `"simulated"` — placeholder for a real DB identifier |

---

### `signup.send_welcome_email`

**Op:** `email.send` | **Layer:** Server
**Source:** [`src/app/api/signup/route.ts#L109`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L109)

Simulates sending a welcome email (50 ms delay). Only reached on the success path.

No custom attributes.

---

### `signup.field.active.<fieldName>`

**Op:** `ui.field.focus` | **Layer:** Client
**Source:** [`src/lib/useFormMetrics.ts#L92`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L92)

Emitted on every `focus` event. The span name is dynamic — `<fieldName>` is one of `name`, `email`, `password`, `confirmPassword`. The span finishes immediately; dwell time is captured separately by `signup.field.dwell.*`.

| Attribute | Type | Description |
|-----------|------|-------------|
| `form.field` | `string` | The field that was focused |
| `form.focus_count` | `number` | How many times this field has been focused (including this event) |

---

### `signup.field.dwell.<fieldName>`

**Op:** `ui.field.dwell` | **Layer:** Client
**Source:** [`src/lib/useFormMetrics.ts#L123`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L123)

Emitted on every `blur` event, provided the field had a recorded focus start time. Captures how long the user spent in the field during this particular visit.

| Attribute | Type | Description |
|-----------|------|-------------|
| `form.field` | `string` | The field that was blurred |
| `form.dwell_ms` | `number` | Milliseconds spent in this field during this single focus visit |
| `form.total_focus_ms` | `number` | Cumulative milliseconds spent in this field across all visits |
| `form.value_length` | `number` | Character length of the field value at blur time |
| `form.is_empty` | `boolean` | Whether the field was empty when the user left it |

---

### `signup.form_completed`

**Op:** `ui.form.complete` | **Layer:** Client
**Source:** [`src/lib/useFormMetrics.ts#L277`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L277)

Emitted once when the form flow ends — regardless of outcome. Captures the top-level session summary.

| Attribute | Type | Description |
|-----------|------|-------------|
| `form.outcome` | `string` | `"success"`, `"api_error"`, or `"network_error"` |
| `form.total_duration_ms` | `number` | Milliseconds from first field interaction to form completion |
| `form.submission_attempts` | `number` | Total number of times the user hit Submit |
| `form.unique_fields_visited` | `number` | Count of distinct fields the user interacted with |
| `form.total_field_visits` | `number` | Total focus events across all fields (includes re-visits) |
| `form.visit_sequence` | `string` | Space-arrow-separated field visit order, e.g. `"name -> email -> password -> confirmPassword"` |

---

### `signup.field_breakdown`

**Op:** `ui.form.field_breakdown` | **Layer:** Client
**Source:** [`src/lib/useFormMetrics.ts#L304`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L304)

Emitted immediately after `signup.form_completed`. Carries per-field counters as a flat attribute map (one span, all four fields).

| Attribute pattern | Type | Description |
|-------------------|------|-------------|
| `form.field.<name>.focus_count` | `number` | Times the field was focused |
| `form.field.<name>.change_count` | `number` | Keystrokes recorded in the field |
| `form.field.<name>.paste_count` | `number` | Paste events into the field |
| `form.field.<name>.total_focus_ms` | `number` | Cumulative dwell time in ms |
| `form.field.<name>.correction_count` | `number` | Times the user fixed a validation error on this field |

`<name>` is one of `name`, `email`, `password`, `confirmPassword`.

---

## Span Attributes Set After Creation

These attributes are set on an already-open span (not in the initial `attributes` object), so they appear separately here for clarity.

| Attribute | Span | Value | Source |
|-----------|------|-------|--------|
| `http.status_code` | `signup.api_call` | HTTP status integer | [`page.tsx#L163`](https://github.com/serglom21/form-instrumented/blob/main/src/app/page.tsx#L163) |
| `signup.outcome` | `POST /api/signup` | See span table above | [`route.ts#L28`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L28) and others |
| `signup.validation_errors` | `POST /api/signup` | Comma-separated field names | [`route.ts#L76`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L76) |
| `signup.user_id` | `POST /api/signup` | Generated user ID string | [`route.ts#L129`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L129) |

---

## Breadcrumbs

Breadcrumbs are attached to the current Sentry scope and appear in the event detail trail.

### `signup.lifecycle` — Form interaction started

**Level:** `info`
**Source:** [`src/lib/useFormMetrics.ts#L55`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L55)

Fired once, the first time any field receives focus. Guards against re-firing via a null check on `formStartRef`.

| Data key | Description |
|----------|-------------|
| `timestamp` | `Date.now()` at the moment the form session began |

---

### `signup.field.focus` — Focused on `<field>`

**Level:** `info`
**Source:** [`src/lib/useFormMetrics.ts#L81`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L81)

Fired on every `focus` event on a tracked field.

| Data key | Description |
|----------|-------------|
| `field` | Field name |
| `focusCount` | This field's focus count including this event |
| `visitIndex` | Position in the global visit sequence (1-based length) |

---

### `signup.field.blur` — Left `<field>`

**Level:** `info` (or `warning` if field was empty on blur)
**Source:** [`src/lib/useFormMetrics.ts#L144`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L144)

Fired on every `blur` event. Message appends `" (empty)"` when the field value is blank.

| Data key | Description |
|----------|-------------|
| `field` | Field name |
| `blurCount` | Cumulative blur count for this field |
| `totalFocusMs` | Cumulative dwell time in ms after this blur |
| `leftEmpty` | `true` if the field was empty when the user left |

---

### `signup.field.change` — `<field>` changed (keystroke #N)

**Level:** `info`
**Source:** [`src/lib/useFormMetrics.ts#L173`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L173)

**Sampled** — only fired on the 1st keystroke and every 10th thereafter (`changeCount === 1 || changeCount % 10 === 0`) to avoid breadcrumb spam.

| Data key | Description |
|----------|-------------|
| `field` | Field name |
| `changeCount` | Total keystrokes in this field at time of breadcrumb |
| `valueLength` | Character length of the current field value |

---

### `signup.field.paste` — Paste into `<field>`

**Level:** `info`
**Source:** [`src/lib/useFormMetrics.ts#L194`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L194)

Fired on every `paste` event.

| Data key | Description |
|----------|-------------|
| `field` | Field name |
| `pasteCount` | Cumulative paste count for this field |

---

### `signup.field.error_shown` — Validation error displayed on `<field>`

**Level:** `warning`
**Source:** [`src/lib/useFormMetrics.ts#L214`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L214)

Fired when a field transitions from no-error to having an error (detected by diffing `errors` state in a `useEffect` in `page.tsx`).

| Data key | Description |
|----------|-------------|
| `field` | Field name |

---

### `signup.field.error_corrected` — User corrected error on `<field>`

**Level:** `info`
**Source:** [`src/lib/useFormMetrics.ts#L229`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L229)

Fired when a field's error clears after having been shown. Only emits if `hadErrorShown` is `true`.

| Data key | Description |
|----------|-------------|
| `field` | Field name |
| `correctionCount` | How many times this field's error has been corrected |

---

### `signup.submit_attempt` — Submit attempt #N

**Level:** `info`
**Source:** [`src/lib/useFormMetrics.ts#L249`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L249)

Fired at the very start of `handleSubmit`, before validation runs. Tracks repeated attempts (e.g. user hits Submit multiple times after failures).

| Data key | Description |
|----------|-------------|
| `attempt` | Attempt number (starts at 1) |

---

### `signup.validation` — Validation failed on fields: `<list>`

**Level:** `warning`
**Source:** [`src/app/page.tsx#L123`](https://github.com/serglom21/form-instrumented/blob/main/src/app/page.tsx#L123)

Fired when client-side validation fails and the form does not proceed to the API call.

| Data key | Description |
|----------|-------------|
| `errorFields` | Array of field names that failed validation |
| `errorMessages` | The full `FieldErrors` object with per-field error strings |

---

### `signup.submit` — Submitting signup form to API

**Level:** `info`
**Source:** [`src/app/page.tsx#L144`](https://github.com/serglom21/form-instrumented/blob/main/src/app/page.tsx#L144)

Fired immediately before the `fetch` call. Marks the boundary between client validation passing and the network request starting.

No data payload.

---

### `signup.success` — Signup completed successfully

**Level:** `info`
**Source:** [`src/app/page.tsx#L191`](https://github.com/serglom21/form-instrumented/blob/main/src/app/page.tsx#L191)

Fired when the API returns `2xx` and the client is about to redirect to the success page.

| Data key | Description |
|----------|-------------|
| `userId` | The user ID returned by the API |

---

### `signup.server_validation` — Server-side validation failed

**Level:** `warning`
**Source:** [`src/app/api/signup/route.ts#L64`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L64)

Fired on the server when `validateSignup` fails after `signup.server_validate` runs.

| Data key | Description |
|----------|-------------|
| `fields` | Array of field names that failed |
| `errors` | The full validation errors object |

---

### `signup.complete` — New user created: `<userId>`

**Level:** `info`
**Source:** [`src/app/api/signup/route.ts#L118`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L118)

Fired on the server after successful persistence and before the 201 response is sent.

No data payload (userId is in the message string and in `signup.user_id` span attribute).

---

### `signup.conflict` — Duplicate email detected

**Level:** `warning`
**Source:** [`src/app/api/signup/route.ts#L134`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L134)

Fired when `signup.persist_user` throws a `ConflictError` (simulated duplicate email, ~10% probability).

No data payload.

---

### `signup.success_page` — User reached the signup success page

**Level:** `info`
**Source:** [`src/app/signup/success/page.tsx#L9`](https://github.com/serglom21/form-instrumented/blob/main/src/app/signup/success/page.tsx#L9)

Fired in a `useEffect` on mount of the success page, confirming the client navigation completed.

No data payload.

---

## Structured Logs (Sentry.logger)

Requires `enableLogs: true` in `Sentry.init`. Logs appear in the Sentry Logs explorer under the project.

| Logger call | Level | Source | Key fields |
|-------------|-------|--------|------------|
| `signup.form_started` | `info` | [`useFormMetrics.ts#L61`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L61) | _(none)_ |
| `signup.field_cleared` | `warn` | [`useFormMetrics.ts#L157`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L157) | `field`, `changeCount` |
| `signup.field_paste` | `info` | [`useFormMetrics.ts#L201`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L201) | `field`, `pasteCount` |
| `signup.field_error_corrected` | `info` | [`useFormMetrics.ts#L236`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L236) | `field`, `correctionCount` |
| `signup.submit_attempt` | `info` | [`useFormMetrics.ts#L256`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L256) | `attempt` |
| `signup.form_metrics` | `info` | [`useFormMetrics.ts#L313`](https://github.com/serglom21/form-instrumented/blob/main/src/lib/useFormMetrics.ts#L313) | `outcome`, `totalDurationMs`, `submissionAttempts`, `visitSequence`, `<field>_focusCount`, `<field>_changeCount`, `<field>_pasteCount`, `<field>_totalFocusMs`, `<field>_correctionCount` (for each of the 4 fields) |
| `signup.validation_failure` | `warn` | [`page.tsx#L133`](https://github.com/serglom21/form-instrumented/blob/main/src/app/page.tsx#L133) | `fields` (sorted comma-separated), `errorCount` |
| `signup.api_error` | `error` | [`page.tsx#L181`](https://github.com/serglom21/form-instrumented/blob/main/src/app/page.tsx#L181) | `status`, `error` |
| `signup.success` | `info` | [`page.tsx#L198`](https://github.com/serglom21/form-instrumented/blob/main/src/app/page.tsx#L198) | `userId` |
| `signup.server_validation_failure` | `warn` | [`route.ts#L71`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L71) | `fields` (comma-separated) |
| `signup.user_created` | `info` | [`route.ts#L124`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L124) | `userId` |
| `signup.duplicate_email` | `warn` | [`route.ts#L140`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L140) | `email` |

---

## Captures

### captureMessage

| Message | Level | Source | Extra / Tags |
|---------|-------|--------|-------------|
| `"Signup API received malformed JSON"` | `warning` | [`route.ts#L25`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L25) | _(none)_ |
| `"Signup API returned an error"` | `error` | [`page.tsx#L175`](https://github.com/serglom21/form-instrumented/blob/main/src/app/page.tsx#L175) | tags: `status` (HTTP status string); extra: `responseBody` |

### captureException

| Context | Source | Tags | Extra |
|---------|--------|------|-------|
| Global error boundary (`global-error.tsx`) | [`global-error.tsx#L14`](https://github.com/serglom21/form-instrumented/blob/main/src/app/global-error.tsx#L14) | _(none)_ | _(none)_ |
| Network / unexpected error during `fetch` | [`page.tsx#L206`](https://github.com/serglom21/form-instrumented/blob/main/src/app/page.tsx#L206) | `flow: "signup"` | `step: "api_call"` |
| Unexpected error in `signup.persist_user` | [`route.ts#L152`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L152) | `flow: "signup"`, `step: "persist_user"` | _(none)_ |

---

## Tags

### Global tags (set via `initialScope`)

Applied to every event on the respective runtime. Configured in all three init files.

| Tag | Value | Source |
|-----|-------|--------|
| `app` | `"form-tracker"` | [`sentry.server.config.ts#L7`](https://github.com/serglom21/form-instrumented/blob/main/sentry.server.config.ts#L7), [`sentry.edge.config.ts#L7`](https://github.com/serglom21/form-instrumented/blob/main/sentry.edge.config.ts#L7), [`instrumentation-client.ts#L26`](https://github.com/serglom21/form-instrumented/blob/main/instrumentation-client.ts#L26) |

### Runtime tags (set per event via `captureMessage` / `captureException`)

| Tag | Values | Applied to | Source |
|-----|--------|-----------|--------|
| `status` | HTTP status as string (e.g. `"422"`) | `captureMessage` on API error | [`page.tsx#L177`](https://github.com/serglom21/form-instrumented/blob/main/src/app/page.tsx#L177) |
| `flow` | `"signup"` | `captureException` on client/server errors | [`page.tsx#L207`](https://github.com/serglom21/form-instrumented/blob/main/src/app/page.tsx#L207), [`route.ts#L153`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L153) |
| `step` | `"api_call"` or `"persist_user"` | `captureException` — pinpoints where in the flow the error occurred | [`page.tsx#L208`](https://github.com/serglom21/form-instrumented/blob/main/src/app/page.tsx#L208), [`route.ts#L153`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L153) |

---

## User Context

### `Sentry.setUser`

**Source:** [`src/app/api/signup/route.ts#L116`](https://github.com/serglom21/form-instrumented/blob/main/src/app/api/signup/route.ts#L116)

Called on the server immediately after a user is successfully persisted, before the 201 response is returned.

| Field | Description |
|-------|-------------|
| `id` | Generated user ID (e.g. `user_a1b2c3d4`) |
| `email` | The email address submitted in the signup form |

---

## SDK Integrations & Hooks

### Session Replay

**Source:** [`instrumentation-client.ts#L11`](https://github.com/serglom21/form-instrumented/blob/main/instrumentation-client.ts#L11)

| Config | Value |
|--------|-------|
| `maskAllText` | `false` |
| `maskAllInputs` | `true` — input field values are never recorded |
| `blockAllMedia` | `false` |
| `replaysSessionSampleRate` | `1.0` in development, `0.1` in production |
| `replaysOnErrorSampleRate` | `1.0` — always capture replay on error |

### Feedback Widget

**Source:** [`instrumentation-client.ts#L16`](https://github.com/serglom21/form-instrumented/blob/main/instrumentation-client.ts#L16)

| Config | Value |
|--------|-------|
| `colorScheme` | `"system"` |

### `onRequestError` hook

**Source:** [`instrumentation.ts#L13`](https://github.com/serglom21/form-instrumented/blob/main/instrumentation.ts#L13)

Delegates to `Sentry.captureRequestError`, automatically capturing unhandled server-side request errors from the Next.js runtime.

### `onRouterTransitionStart` hook

**Source:** [`instrumentation-client.ts#L31`](https://github.com/serglom21/form-instrumented/blob/main/instrumentation-client.ts#L31)

Delegates to `Sentry.captureRouterTransitionStart`, enabling automatic client-side navigation performance tracing.
