import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Terms of Service | Koraa",
  description:
    "The terms and conditions that govern your use of Koraa, including storefront hosting, payments, and domain services.",
};

export default function TermsLayout({ children }: { children: ReactNode }) {
  return children;
}
