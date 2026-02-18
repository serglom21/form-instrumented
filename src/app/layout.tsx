import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sign Up — Form Tracker",
  description: "Signup form instrumented with Sentry for monitoring critical flows",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
