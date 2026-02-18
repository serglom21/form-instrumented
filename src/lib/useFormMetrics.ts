"use client";

import * as Sentry from "@sentry/nextjs";
import { useRef, useCallback, useMemo } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FieldMetrics {
  focusCount: number;
  blurCount: number;
  changeCount: number;
  pasteCount: number;
  totalFocusMs: number;
  firstFocusAt: number | null;
  lastBlurAt: number | null;
  lastFocusStart: number | null;
  hadErrorShown: boolean;
  correctionCount: number;
}

export interface FormMetricsSummary {
  formStartedAt: number | null;
  formEndedAt: number | null;
  totalDurationMs: number;
  fieldVisitSequence: string[];
  submissionAttempts: number;
  fields: Record<string, FieldMetrics>;
}

type FieldStore = Record<string, FieldMetrics>;

const FORM_NAME = "signup";

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useFormMetrics(fieldNames: string[]) {
  const formStartRef = useRef<number | null>(null);
  const visitSequenceRef = useRef<string[]>([]);
  const submissionAttemptsRef = useRef(0);
  const currentFieldRef = useRef<string | null>(null);

  const fieldsRef = useRef<FieldStore>(
    Object.fromEntries(fieldNames.map((n) => [n, emptyField()]))
  );

  /* ---------- helpers -------------------------------------------- */

  const ensureFormStarted = useCallback(() => {
    if (formStartRef.current === null) {
      formStartRef.current = Date.now();
      Sentry.addBreadcrumb({
        category: `${FORM_NAME}.lifecycle`,
        message: "Form interaction started",
        level: "info",
        data: { timestamp: formStartRef.current },
      });
      Sentry.logger.info(`${FORM_NAME}.form_started`);
    }
  }, []);

  /* ---------- focus ---------------------------------------------- */

  const trackFocus = useCallback(
    (fieldName: string) => {
      ensureFormStarted();
      const now = Date.now();
      const fm = fieldsRef.current[fieldName];
      if (!fm) return;

      fm.focusCount += 1;
      fm.lastFocusStart = now;
      if (fm.firstFocusAt === null) fm.firstFocusAt = now;

      currentFieldRef.current = fieldName;
      visitSequenceRef.current.push(fieldName);

      Sentry.addBreadcrumb({
        category: `${FORM_NAME}.field.focus`,
        message: `Focused on ${fieldName}`,
        level: "info",
        data: {
          field: fieldName,
          focusCount: fm.focusCount,
          visitIndex: visitSequenceRef.current.length,
        },
      });

      Sentry.startSpan(
        {
          name: `${FORM_NAME}.field.active.${fieldName}`,
          op: "ui.field.focus",
          attributes: {
            "form.field": fieldName,
            "form.focus_count": fm.focusCount,
          },
        },
        () => {
          /* span is immediately finished — we measure dwell via blur */
        }
      );
    },
    [ensureFormStarted]
  );

  /* ---------- blur ----------------------------------------------- */

  const trackBlur = useCallback((fieldName: string, currentValue: string) => {
    const now = Date.now();
    const fm = fieldsRef.current[fieldName];
    if (!fm) return;

    fm.blurCount += 1;
    fm.lastBlurAt = now;

    if (fm.lastFocusStart !== null) {
      const dwellMs = now - fm.lastFocusStart;
      fm.totalFocusMs += dwellMs;

      Sentry.startSpan(
        {
          name: `${FORM_NAME}.field.dwell.${fieldName}`,
          op: "ui.field.dwell",
          attributes: {
            "form.field": fieldName,
            "form.dwell_ms": dwellMs,
            "form.total_focus_ms": fm.totalFocusMs,
            "form.value_length": currentValue.length,
            "form.is_empty": currentValue.length === 0,
          },
        },
        () => {}
      );
    }

    fm.lastFocusStart = null;
    currentFieldRef.current = null;

    const isEmpty = currentValue.trim().length === 0;

    Sentry.addBreadcrumb({
      category: `${FORM_NAME}.field.blur`,
      message: `Left ${fieldName}${isEmpty ? " (empty)" : ""}`,
      level: isEmpty ? "warning" : "info",
      data: {
        field: fieldName,
        blurCount: fm.blurCount,
        totalFocusMs: fm.totalFocusMs,
        leftEmpty: isEmpty,
      },
    });

    if (isEmpty && fm.changeCount > 0) {
      Sentry.logger.warn(`${FORM_NAME}.field_cleared`, {
        field: fieldName,
        changeCount: fm.changeCount,
      });
    }
  }, []);

  /* ---------- change --------------------------------------------- */

  const trackChange = useCallback((fieldName: string, value: string) => {
    const fm = fieldsRef.current[fieldName];
    if (!fm) return;

    fm.changeCount += 1;

    if (fm.changeCount % 10 === 0 || fm.changeCount === 1) {
      Sentry.addBreadcrumb({
        category: `${FORM_NAME}.field.change`,
        message: `${fieldName} changed (keystroke #${fm.changeCount})`,
        level: "info",
        data: {
          field: fieldName,
          changeCount: fm.changeCount,
          valueLength: value.length,
        },
      });
    }
  }, []);

  /* ---------- paste ---------------------------------------------- */

  const trackPaste = useCallback((fieldName: string) => {
    const fm = fieldsRef.current[fieldName];
    if (!fm) return;

    fm.pasteCount += 1;

    Sentry.addBreadcrumb({
      category: `${FORM_NAME}.field.paste`,
      message: `Paste into ${fieldName}`,
      level: "info",
      data: { field: fieldName, pasteCount: fm.pasteCount },
    });

    Sentry.logger.info(`${FORM_NAME}.field_paste`, {
      field: fieldName,
      pasteCount: fm.pasteCount,
    });
  }, []);

  /* ---------- error correction ----------------------------------- */

  const trackErrorShown = useCallback((fieldName: string) => {
    const fm = fieldsRef.current[fieldName];
    if (!fm) return;
    fm.hadErrorShown = true;

    Sentry.addBreadcrumb({
      category: `${FORM_NAME}.field.error_shown`,
      message: `Validation error displayed on ${fieldName}`,
      level: "warning",
      data: { field: fieldName },
    });
  }, []);

  const trackErrorCorrected = useCallback((fieldName: string) => {
    const fm = fieldsRef.current[fieldName];
    if (!fm) return;
    if (fm.hadErrorShown) {
      fm.correctionCount += 1;
      fm.hadErrorShown = false;

      Sentry.addBreadcrumb({
        category: `${FORM_NAME}.field.error_corrected`,
        message: `User corrected error on ${fieldName}`,
        level: "info",
        data: { field: fieldName, correctionCount: fm.correctionCount },
      });

      Sentry.logger.info(`${FORM_NAME}.field_error_corrected`, {
        field: fieldName,
        correctionCount: fm.correctionCount,
      });
    }
  }, []);

  /* ---------- submission attempt --------------------------------- */

  const trackSubmissionAttempt = useCallback(() => {
    submissionAttemptsRef.current += 1;
    const attempt = submissionAttemptsRef.current;

    Sentry.addBreadcrumb({
      category: `${FORM_NAME}.submit_attempt`,
      message: `Submit attempt #${attempt}`,
      level: "info",
      data: { attempt },
    });

    Sentry.logger.info(`${FORM_NAME}.submit_attempt`, { attempt });
  }, []);

  /* ---------- build summary & emit ------------------------------- */

  const buildSummary = useCallback((): FormMetricsSummary => {
    const now = Date.now();
    return {
      formStartedAt: formStartRef.current,
      formEndedAt: now,
      totalDurationMs: formStartRef.current ? now - formStartRef.current : 0,
      fieldVisitSequence: [...visitSequenceRef.current],
      submissionAttempts: submissionAttemptsRef.current,
      fields: JSON.parse(JSON.stringify(fieldsRef.current)),
    };
  }, []);

  const emitFinalMetrics = useCallback(
    (outcome: "success" | "api_error" | "network_error") => {
      const summary = buildSummary();

      Sentry.startSpan(
        {
          name: `${FORM_NAME}.form_completed`,
          op: "ui.form.complete",
          attributes: {
            "form.outcome": outcome,
            "form.total_duration_ms": summary.totalDurationMs,
            "form.submission_attempts": summary.submissionAttempts,
            "form.unique_fields_visited": new Set(summary.fieldVisitSequence)
              .size,
            "form.total_field_visits": summary.fieldVisitSequence.length,
            "form.visit_sequence": summary.fieldVisitSequence.join(" -> "),
          },
        },
        () => {}
      );

      const perFieldAttrs: Record<string, number | string | boolean> = {};
      for (const [name, fm] of Object.entries(summary.fields)) {
        perFieldAttrs[`form.field.${name}.focus_count`] = fm.focusCount;
        perFieldAttrs[`form.field.${name}.change_count`] = fm.changeCount;
        perFieldAttrs[`form.field.${name}.paste_count`] = fm.pasteCount;
        perFieldAttrs[`form.field.${name}.total_focus_ms`] = fm.totalFocusMs;
        perFieldAttrs[`form.field.${name}.correction_count`] =
          fm.correctionCount;
      }

      Sentry.startSpan(
        {
          name: `${FORM_NAME}.field_breakdown`,
          op: "ui.form.field_breakdown",
          attributes: perFieldAttrs,
        },
        () => {}
      );

      Sentry.logger.info(`${FORM_NAME}.form_metrics`, {
        outcome,
        totalDurationMs: summary.totalDurationMs,
        submissionAttempts: summary.submissionAttempts,
        visitSequence: summary.fieldVisitSequence.join(" -> "),
        ...Object.fromEntries(
          Object.entries(summary.fields).flatMap(([name, fm]) => [
            [`${name}_focusCount`, fm.focusCount],
            [`${name}_changeCount`, fm.changeCount],
            [`${name}_pasteCount`, fm.pasteCount],
            [`${name}_totalFocusMs`, fm.totalFocusMs],
            [`${name}_correctionCount`, fm.correctionCount],
          ])
        ),
      });
    },
    [buildSummary]
  );

  /* ---------- reset (for re-use after success) ------------------- */

  const reset = useCallback(() => {
    formStartRef.current = null;
    visitSequenceRef.current = [];
    submissionAttemptsRef.current = 0;
    currentFieldRef.current = null;
    fieldsRef.current = Object.fromEntries(
      fieldNames.map((n) => [n, emptyField()])
    );
  }, [fieldNames]);

  /* ---------- public API ----------------------------------------- */

  return useMemo(
    () => ({
      trackFocus,
      trackBlur,
      trackChange,
      trackPaste,
      trackErrorShown,
      trackErrorCorrected,
      trackSubmissionAttempt,
      emitFinalMetrics,
      buildSummary,
      reset,
    }),
    [
      trackFocus,
      trackBlur,
      trackChange,
      trackPaste,
      trackErrorShown,
      trackErrorCorrected,
      trackSubmissionAttempt,
      emitFinalMetrics,
      buildSummary,
      reset,
    ]
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function emptyField(): FieldMetrics {
  return {
    focusCount: 0,
    blurCount: 0,
    changeCount: 0,
    pasteCount: 0,
    totalFocusMs: 0,
    firstFocusAt: null,
    lastBlurAt: null,
    lastFocusStart: null,
    hadErrorShown: false,
    correctionCount: 0,
  };
}
