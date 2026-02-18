"use client";

import * as Sentry from "@sentry/nextjs";
import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  validateSignup,
  hasErrors,
  type SignupFields,
  type FieldErrors,
} from "@/lib/validation";
import { useFormMetrics } from "@/lib/useFormMetrics";

const FIELD_NAMES: (keyof SignupFields)[] = [
  "name",
  "email",
  "password",
  "confirmPassword",
];

const EMPTY_FORM: SignupFields = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export default function SignupPage() {
  const router = useRouter();
  const [fields, setFields] = useState<SignupFields>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const prevErrorsRef = useRef<FieldErrors>({});

  const metrics = useFormMetrics(FIELD_NAMES);

  // Detect when a validation error gets cleared (user corrected the field)
  useEffect(() => {
    const prev = prevErrorsRef.current;
    for (const field of FIELD_NAMES) {
      if (prev[field] && !errors[field]) {
        metrics.trackErrorCorrected(field);
      }
      if (!prev[field] && errors[field]) {
        metrics.trackErrorShown(field);
      }
    }
    prevErrorsRef.current = errors;
  }, [errors, metrics]);

  /* ---------- event handlers ------------------------------------- */

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      metrics.trackFocus(e.target.name);
    },
    [metrics]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      metrics.trackBlur(e.target.name, e.target.value);
    },
    [metrics]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setFields((prev) => ({ ...prev, [name]: value }));
      metrics.trackChange(name, value);

      // Clear field error as user corrects it
      setErrors((prev) => {
        if (prev[name as keyof FieldErrors]) {
          const next = { ...prev };
          delete next[name as keyof FieldErrors];
          return next;
        }
        return prev;
      });
    },
    [metrics]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const name = (e.target as HTMLInputElement).name;
      metrics.trackPaste(name);
    },
    [metrics]
  );

  /* ---------- submit --------------------------------------------- */

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setServerError(null);
      metrics.trackSubmissionAttempt();

      // --- 1. Client-side validation (tracked as a span) ---
      const validationErrors = Sentry.startSpan(
        {
          name: "signup.validate",
          op: "ui.validate",
          attributes: {
            "form.fields_filled": FIELD_NAMES.filter(
              (f) => fields[f].trim().length > 0
            ).length,
            "form.total_fields": FIELD_NAMES.length,
          },
        },
        () => validateSignup(fields)
      );

      if (hasErrors(validationErrors)) {
        setErrors(validationErrors);

        const errorFields = Object.keys(validationErrors);

        Sentry.addBreadcrumb({
          category: "signup.validation",
          message: `Validation failed on fields: ${errorFields.join(", ")}`,
          level: "warning",
          data: {
            errorFields,
            errorMessages: validationErrors,
          },
        });

        Sentry.logger.warn("signup.validation_failure", {
          fields: errorFields.sort().join(","),
          errorCount: errorFields.length,
        });

        return;
      }

      // --- 2. Submit to API ---
      setSubmitting(true);

      Sentry.addBreadcrumb({
        category: "signup.submit",
        message: "Submitting signup form to API",
        level: "info",
      });

      try {
        const response = await Sentry.startSpan(
          { name: "signup.api_call", op: "http.client" },
          async (span) => {
            const res = await fetch("/api/signup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: fields.name,
                email: fields.email,
                password: fields.password,
              }),
            });
            span.setAttribute("http.status_code", res.status);
            return res;
          }
        );

        const body = await response.json();

        if (!response.ok) {
          const msg =
            body?.error || "Something went wrong. Please try again.";
          setServerError(msg);

          Sentry.captureMessage("Signup API returned an error", {
            level: "error",
            tags: { status: String(response.status) },
            extra: { responseBody: body },
          });

          Sentry.logger.error("signup.api_error", {
            status: response.status,
            error: msg,
          });

          metrics.emitFinalMetrics("api_error");
          return;
        }

        // --- 3. Success ---
        Sentry.addBreadcrumb({
          category: "signup.success",
          message: "Signup completed successfully",
          level: "info",
          data: { userId: body.userId },
        });

        Sentry.logger.info("signup.success", {
          userId: body.userId,
        });

        metrics.emitFinalMetrics("success");

        router.push("/signup/success");
      } catch (err) {
        Sentry.captureException(err, {
          tags: { flow: "signup" },
          extra: { step: "api_call" },
        });

        setServerError(
          "Network error. Please check your connection and try again."
        );

        metrics.emitFinalMetrics("network_error");
      } finally {
        setSubmitting(false);
      }
    },
    [fields, router, metrics]
  );

  /* ---------- render --------------------------------------------- */

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Start your journey with us today
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/60"
        >
          {serverError && (
            <div
              role="alert"
              className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {serverError}
            </div>
          )}

          <Field
            label="Full name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Jane Doe"
            value={fields.name}
            error={errors.name}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onPaste={handlePaste}
          />

          <Field
            label="Email address"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="jane@example.com"
            value={fields.email}
            error={errors.email}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onPaste={handlePaste}
          />

          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={fields.password}
            error={errors.password}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onPaste={handlePaste}
          />

          <Field
            label="Confirm password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat your password"
            value={fields.confirmPassword}
            error={errors.confirmPassword}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onPaste={handlePaste}
          />

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full cursor-pointer rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating account..." : "Sign up"}
          </button>
        </form>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Reusable form field                                                 */
/* ------------------------------------------------------------------ */

interface FieldProps {
  label: string;
  name: string;
  type: string;
  autoComplete: string;
  placeholder: string;
  value: string;
  error?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
}

function Field({
  label,
  name,
  type,
  autoComplete,
  placeholder,
  value,
  error,
  onChange,
  onFocus,
  onBlur,
  onPaste,
}: FieldProps) {
  return (
    <div className="mb-5">
      <label
        htmlFor={name}
        className="mb-1.5 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        onPaste={onPaste}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        className={`block w-full rounded-lg border px-3.5 py-2 text-sm shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          error
            ? "border-red-400 text-red-900 focus:ring-red-500"
            : "border-slate-300 text-slate-900"
        }`}
      />
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
