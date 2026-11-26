import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Storefront Templates | Koraa",
  description: "Beautiful, customizable templates for your online store. Choose from free and premium designs.",
};

export default function TemplatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
