import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Showcase — Live stores built on Koraa",
  description:
    "Browse real Cameroonian businesses running on Koraa. See how merchants use storefronts, mobile money checkout, and custom domains to sell online.",
  openGraph: {
    title: "Showcase — Live stores built on Koraa",
    description:
      "Browse real Cameroonian businesses running on Koraa.",
  },
};

export default function ShowcaseLayout({ children }: { children: ReactNode }) {
  return children;
}
