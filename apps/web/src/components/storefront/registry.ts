/**
 * Layout registry.
 *
 * `StorefrontConfig.layout` decides the *structure* of a storefront, as
 * opposed to the colours, fonts and card density that leave the page the same
 * shape. Each entry supplies the section components whose shape differs under
 * that layout plus the CSS they need; anything a layout does not override
 * falls through to the classic component, so a layout is only as large as its
 * actual departures.
 *
 * `classic` is intentionally empty — it *is* the classic renderer, so a
 * storefront published before layouts existed (and any value we do not
 * recognise) renders exactly as it did before.
 *
 * Keyed by `StorefrontLayout`, so adding a layout to the union without adding
 * it here is a compile error rather than a storefront that silently falls back.
 */
import type React from "react";
import type { SectionType, StorefrontLayout } from "../../types/storefront";
import type { FooterProps, NavbarProps, SectionProps } from "./shared";

import boutique from "./layouts/boutique";
import editorial from "./layouts/editorial";
import menu from "./layouts/menu";
import service from "./layouts/service";
import showcase from "./layouts/showcase";
import techgrid from "./layouts/techgrid";

export interface LayoutModule {
  /**
   * CSS for this layout, scoped to `.sf-l-<key>`. Injected only while the
   * layout is active, so the payload does not carry all seven.
   */
  styles?: string;
  /** Section overrides. Absent types fall through to the classic component. */
  sections?: Partial<Record<SectionType, React.FC<SectionProps>>>;
  /**
   * Chrome overrides. The navbar and footer are not in the merchant's
   * section list — every storefront has exactly one of each — so a layout
   * that needs different chrome replaces the component rather than
   * registering a section. Absent means the classic navbar/footer.
   */
  navbar?: React.FC<NavbarProps>;
  footer?: React.FC<FooterProps>;
  /** Root custom properties, for metrics that are structural rather than cosmetic. */
  vars?: Record<string, string>;
}

export const LAYOUTS: Record<StorefrontLayout, LayoutModule> = {
  classic: {},
  editorial,
  boutique,
  menu,
  techgrid,
  showcase,
  service,
};

/**
 * The layout key actually in force, falling back to classic for absent or
 * unrecognised values.
 *
 * Callers need this as well as the module: the root element is classed
 * `sf-l-<key>`, and stamping an unrecognised value there would advertise a
 * layout that is not the one being rendered.
 */
export function resolveLayoutKey(layout: string | undefined): StorefrontLayout {
  return layout && layout in LAYOUTS ? (layout as StorefrontLayout) : "classic";
}

/** The active layout module, falling back to classic for unknown values. */
export function resolveLayout(layout: string | undefined): LayoutModule {
  return LAYOUTS[resolveLayoutKey(layout)];
}

export { LAYOUT_CHOICES } from "./layoutMeta";
export type { LayoutChoice } from "./layoutMeta";
