/**
 * Layout names and descriptions, with no component imports.
 *
 * Kept separate from `registry.ts` on purpose: the dashboard's layout picker
 * needs the labels but must not pull six storefront layout modules into the
 * dashboard bundle to get them.
 *
 * Labels mirror `StorefrontConfig.Layout` in
 * `backend/apps/storefront/models.py` — keep the two in step.
 */
import type { StorefrontLayout } from "../../types/storefront";

export interface LayoutChoice {
  key: StorefrontLayout;
  label: string;
  description: string;
}

export const LAYOUT_CHOICES: LayoutChoice[] = [
  { key: "classic",   label: "Classic",   description: "Banner hero, product grid, about block." },
  { key: "editorial", label: "Editorial", description: "Full-bleed lookbook, large portrait tiles." },
  { key: "boutique",  label: "Boutique",  description: "Split hero with a filtered catalogue sidebar." },
  { key: "menu",      label: "Menu",      description: "Tabbed price list, with hours and a call-to-order bar." },
  { key: "techgrid",  label: "Technical", description: "Dense spec cards with filter rail." },
  { key: "showcase",  label: "Showcase",  description: "Typographic tiles for products with no photos." },
  { key: "service",   label: "Service",   description: "Centred hero and a list of offerings." },
];
