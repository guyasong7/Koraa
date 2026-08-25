import { notFound } from "next/navigation";
import { getStorefrontPreview } from "@/lib/api";
import { StorefrontProvider } from "@/components/StorefrontProvider";
import { StorefrontRenderer } from "@/components/StorefrontRenderer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Storefront Preview",
  robots: "noindex, nofollow", // Never index preview pages
};

export default async function PreviewPage(props: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const token = searchParams.token as string;
  
  if (!token) {
    return (
      <div style={{ padding: 48, textAlign: "center", fontFamily: "sans-serif" }}>
        <h1>Unauthorized</h1>
        <p>Preview token missing. Please open the preview from the Koraa dashboard.</p>
      </div>
    );
  }

  const data = await getStorefrontPreview(params.storeId, token);

  if (!data) {
    return (
      <div style={{ padding: 48, textAlign: "center", fontFamily: "sans-serif" }}>
        <h1>Preview Unavailable</h1>
        <p>Could not load the storefront preview. Please ensure your store exists.</p>
      </div>
    );
  }

  return (
    // isPreview=true enables the postMessage listener for live updates
    <StorefrontProvider initialData={data} isPreview={true}>
      <StorefrontRenderer />
    </StorefrontProvider>
  );
}
