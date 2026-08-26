import AppProviders from "@/components/AppProviders";

/**
 * Mounts the data and notification providers for the storefront preview.
 *
 * A sibling of `[domain]` rather than a child, so it does not inherit that
 * layout — and it renders the same `StorefrontRenderer`, whose newsletter form
 * raises a toast. Without a `<Toaster>` above it the merchant previewing their
 * own shop would click subscribe and see nothing happen.
 *
 * Exists only to hang the providers here; see `components/Providers.tsx` for
 * why they are no longer in the root layout.
 */
export default function StorePreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppProviders>{children}</AppProviders>;
}
