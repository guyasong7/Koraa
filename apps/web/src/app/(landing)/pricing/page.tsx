import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Free to start, upgrade as you grow",
  description:
    "Koraa is free to start with one store and 50 products. Upgrade to Starter or Pro for more stores, unlimited products, custom domains, and priority support. Priced in CFA francs.",
  openGraph: {
    title: "Pricing — Free to start, upgrade as you grow | Koraa",
    description:
      "Koraa is free to start. Upgrade to Starter or Pro for more stores, unlimited products, and custom domains.",
  },
};

export default function PricingPage() {
  redirect("/#pricing");
}
