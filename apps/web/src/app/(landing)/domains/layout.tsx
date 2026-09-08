import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Domains — Register & connect your own domain | Koraa",
  description:
    "Search for a domain name, register it instantly, and point it at your Koraa storefront. Free WHOIS privacy, instant activation, and DNS you control.",
  openGraph: {
    title: "Domains — Register & connect your own domain | Koraa",
    description:
      "Search for a domain name, register it instantly, and point it at your Koraa storefront.",
  },
};

export default function DomainsLayout({ children }: { children: ReactNode }) {
  return children;
}
