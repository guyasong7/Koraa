import { notFound } from "next/navigation";
import CheckoutClient from "./CheckoutClient";

export default async function CheckoutPage(props: {
  params: Promise<{ domain: string }>;
}) {
  const params = await props.params;
  const { domain } = params;

  if (!domain) {
    notFound();
  }

  return <CheckoutClient domain={domain} />;
}
