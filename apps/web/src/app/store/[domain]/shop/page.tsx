import { notFound } from "next/navigation";
import { getStorefrontByDomain } from "@/lib/api";
import { StorefrontProvider } from "@/components/StorefrontProvider";
import { ShopRenderer } from "@/components/storefront/ShopRenderer";
import { StoreGate } from "@/components/storefront/StoreGate";
import type { GatePayload } from "@/components/storefront/StoreGate";
import type { StorefrontData } from "@/types/storefront";

type Payload = (StorefrontData & { locked?: undefined }) | GatePayload;

function isLocked(payload: Payload): payload is GatePayload {
  return typeof (payload as GatePayload).locked === "string";
}

export default async function ShopPage(props: {
  params: Promise<{ domain: string }>;
}) {
  const params = await props.params;
  const { domain } = params;
  const storefront: Payload | null = await getStorefrontByDomain(domain);

  if (!storefront) {
    notFound();
  }

  if (isLocked(storefront)) {
    return <StoreGate payload={storefront} />;
  }

  return (
    <StorefrontProvider initialData={storefront} isPreview={false}>
      <ShopRenderer />
    </StorefrontProvider>
  );
}
