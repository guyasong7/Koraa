import AppProviders from "@/components/AppProviders";

/**
 * Mounts the data and notification providers for the storefronts.
 *
 * They are not in the root layout any more — see `components/Providers.tsx`.
 * A storefront needs them because `StorefrontRenderer`'s newsletter form and
 * the checkout both raise toasts, and neither works without a `<Toaster>`
 * above it.
 *
 * Still renders no element of its own: the storefront templates own the whole
 * page shell and a wrapper div would sit inside their layout maths.
 */
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
