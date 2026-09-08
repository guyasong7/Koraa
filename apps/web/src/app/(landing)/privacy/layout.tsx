import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Privacy Policy | Koraa",
  description:
    "How Koraa collects, uses, and protects your personal data. Read our full privacy policy.",
};

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return children;
}
