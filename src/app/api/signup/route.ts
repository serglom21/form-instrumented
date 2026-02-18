import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { validateSignup, hasErrors } from "@/lib/validation";

class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export async function POST(request: Request) {
  return Sentry.startSpan(
    { name: "POST /api/signup", op: "http.server" },
    async (rootSpan) => {
      let body: Record<string, unknown>;

      // --- Parse body ---
      try {
        body = await Sentry.startSpan(
          { name: "signup.parse_body", op: "serialize.parse" },
          async () => request.json()
        );
      } catch {
        Sentry.captureMessage("Signup API received malformed JSON", {
          level: "warning",
        });
        rootSpan.setAttribute("signup.outcome", "bad_request");
        return NextResponse.json(
          { error: "Invalid request body." },
          { status: 400 }
        );
      }

      const { name, email, password } = body as {
        name?: string;
        email?: string;
        password?: string;
      };

      // --- Server-side validation ---
      const validationErrors = Sentry.startSpan(
        {
          name: "signup.server_validate",
          op: "validate",
          attributes: {
            "validate.has_name": !!name,
            "validate.has_email": !!email,
            "validate.has_password": !!password,
          },
        },
        () =>
          validateSignup({
            name: (name as string) || "",
            email: (email as string) || "",
            password: (password as string) || "",
            confirmPassword: (password as string) || "",
          })
      );

      if (hasErrors(validationErrors)) {
        const failedFields = Object.keys(validationErrors);

        Sentry.addBreadcrumb({
          category: "signup.server_validation",
          message: "Server-side validation failed",
          level: "warning",
          data: { fields: failedFields, errors: validationErrors },
        });

        Sentry.logger.warn("signup.server_validation_failure", {
          fields: failedFields.join(","),
        });

        rootSpan.setAttribute("signup.outcome", "validation_error");
        rootSpan.setAttribute(
          "signup.validation_errors",
          failedFields.join(",")
        );

        return NextResponse.json(
          { error: "Validation failed.", details: validationErrors },
          { status: 422 }
        );
      }

      // --- Persist user ---
      try {
        const userId = await Sentry.startSpan(
          {
            name: "signup.persist_user",
            op: "db",
            attributes: { "db.system": "simulated" },
          },
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 150));

            if (Math.random() < 0.1) {
              throw new ConflictError(
                "A user with this email already exists."
              );
            }

            return `user_${crypto.randomUUID().slice(0, 8)}`;
          }
        );

        // --- Send welcome email (simulated) ---
        await Sentry.startSpan(
          { name: "signup.send_welcome_email", op: "email.send" },
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        );

        Sentry.setUser({ id: userId, email: email as string });

        Sentry.addBreadcrumb({
          category: "signup.complete",
          message: `New user created: ${userId}`,
          level: "info",
        });

        Sentry.logger.info("signup.user_created", {
          userId,
        });

        rootSpan.setAttribute("signup.outcome", "success");
        rootSpan.setAttribute("signup.user_id", userId);

        return NextResponse.json({ ok: true, userId }, { status: 201 });
      } catch (err) {
        if (err instanceof ConflictError) {
          Sentry.addBreadcrumb({
            category: "signup.conflict",
            message: "Duplicate email detected",
            level: "warning",
          });

          Sentry.logger.warn("signup.duplicate_email", {
            email: email as string,
          });

          rootSpan.setAttribute("signup.outcome", "conflict");

          return NextResponse.json(
            { error: err.message },
            { status: 409 }
          );
        }

        Sentry.captureException(err, {
          tags: { flow: "signup", step: "persist_user" },
        });

        rootSpan.setAttribute("signup.outcome", "internal_error");

        return NextResponse.json(
          { error: "An unexpected error occurred." },
          { status: 500 }
        );
      }
    }
  );
}
