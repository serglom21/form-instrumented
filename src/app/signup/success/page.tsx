"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

export default function SignupSuccessPage() {
  useEffect(() => {
    Sentry.addBreadcrumb({
      category: "signup.success_page",
      message: "User reached the signup success page",
      level: "info",
    });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Account created!
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Your account has been created successfully. You can now log in.
        </p>

        <Link
          href="/"
          className="mt-8 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Back to sign up
        </Link>
      </div>
    </main>
  );
}
