// Shared TypeScript types for the Koraa platform
// Used by both dashboard and storefront

export interface Store {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  logo: string | null;
  favicon: string | null;
  currency: string;
  email: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  facebook: string;
  /** Optional: sent by the public storefront endpoint, absent in a preview. */
  description?: string;
  social_image?: string | null;
  seo_title?: string;
  seo_description?: string;
}

/**
 * The shop-wide preferences from the Site Settings panels.
 *
 * `backend/apps/stores/site_settings.py` owns the catalogue, the defaults and
 * the coercion; this is only the subset the public storefront is served. It is
 * deliberately loose — every key is optional and every reader supplies its own
 * fallback — so a setting added to the backend cannot break a build here, and a
 * shop saved before a setting existed renders as though it had the default.
 *
 * The passcode is never in here: `site_settings.public()` swaps it for
 * `has_access_password`.
 */
export interface SiteSettings {
  availability?: "public" | "password" | "private";
  has_access_password?: boolean;
  availability_note?: string;

  default_language?: string;
  languages?: string[];
  show_language_picker?: boolean;

  timezone?: string;
  measurement?: "metric" | "imperial";
  date_format?: "dmy" | "mdy" | "ymd";
  first_day_of_week?: "mon" | "sun";

  cookie_banner?: "off" | "notice" | "consent";
  cookie_banner_text?: string;
  cookie_policy_url?: string;
  privacy_policy_url?: string;
  data_requests_email?: string;

  social_x?: string;
  social_tiktok?: string;
  social_youtube?: string;
  social_pinterest?: string;
  social_linkedin?: string;

  social_title?: string;
  social_description?: string;
  twitter_card?: string;

  pinterest_save?: "off" | "hover" | "always";
  pinterest_verify?: string;

  allow_koraa_promotion?: boolean;

  image_optimization?: "auto" | "off";
  image_quality?: number;
  image_lazy_load?: boolean;
  image_fit?: "cover" | "contain";
  image_zoom?: boolean;

  [key: string]: unknown;
}

export type FontFamily = "Inter" | "Outfit" | "Poppins" | "Lato" | "Raleway" | "Nunito";
export type ButtonStyle = "rounded" | "square" | "pill";
export type ProductCardStyle = "compact" | "standard" | "large";

/**
 * Page structure, as opposed to surface styling.
 *
 * Colours, fonts and card density leave the page the same shape, which is
 * why every category used to render the same hero, grid and about block in
 * a different hue. The layout decides the shape: full-bleed vs split hero,
 * grid vs price list, tiles vs tabs.
 */
export type StorefrontLayout =
  | "classic"
  | "editorial"
  | "boutique"
  | "menu"
  | "techgrid"
  | "showcase"
  | "service";

export interface StorefrontConfig {
  id?: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  font: FontFamily;
  /**
   * Headings. Optional because storefronts published before the field
   * existed have no value for it — the renderer falls back to `font`,
   * which is what those shops were already rendering with.
   */
  heading_font?: FontFamily;
  button_style: ButtonStyle;
  product_card_style: ProductCardStyle;
  /** Optional: storefronts published before layouts existed render as "classic". */
  layout?: StorefrontLayout;
  navigation: {
    links?: Array<{ label: string; url: string }>;
  };
  footer: {
    tagline?: string;
    links?: Array<{ label: string; url: string }>;
  };
  announcement_bar: {
    text?: string;
    enabled?: boolean;
    bg_color?: string;
    text_color?: string;
  };
  published_at?: string | null;
  updated_at?: string;
  // Convenience — populated from the store
  store_name?: string;
  store_slug?: string;
  store_logo?: string | null;
  store_favicon?: string | null;
}

export type SectionType =
  | "announcement_bar"
  | "navbar"
  | "hero"
  | "categories"
  | "featured_products"
  | "product_grid"
  | "catalog"
  | "promo_banner"
  | "about"
  | "testimonials"
  | "newsletter"
  | "contact_form"
  | "footer";

export interface StorefrontSection {
  id: string;
  type: SectionType;
  order: number;
  enabled: boolean;
  settings: Record<string, unknown>;
  updated_at?: string;
}

export interface StorefrontProduct {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  base_price: string;
  compare_at_price: string | null;
  is_featured: boolean;
  is_on_sale: boolean;
  in_stock: boolean;
  image: string | null;
  /**
   * What kind of thing this is, which decides the card's action: a physical
   * product goes in the basket, a digital one is bought and downloaded, a
   * service is enquired about. Optional because a storefront serialised before
   * digital products existed does not send it — those are all `simple`.
   */
  product_type?: "simple" | "variable" | "digital" | "service";
  /** How many files a digital product delivers. Zero means nothing to sell yet. */
  file_count?: number;
  /** Services only: whether the card offers an enquiry rather than a price alone. */
  accepts_enquiries?: boolean;
}

/**
 * One field on a merchant's enquiry form.
 *
 * The shape is the backend's (`ServiceForm.FIELD_TYPES`) and the storefront
 * renders whatever it is handed — a field type added there needs no change
 * here beyond the union below.
 */
export interface ServiceFormField {
  key: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "email"
    | "tel"
    | "number"
    | "date"
    | "select"
    | "radio"
    | "checkboxes"
    | "checkbox";
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: string[];
  /** Half-width fields sit two to a row on a wide screen. */
  width?: "full" | "half";
}

/**
 * The public half of a store's enquiry form.
 *
 * Notify addresses are never sent — they are the merchant's inbox. The payload
 * is `null` when the form is switched off, so the section renders nothing
 * rather than an empty box.
 */
export interface PublicServiceForm {
  title: string;
  description: string;
  submit_label: string;
  success_message: string;
  fields: ServiceFormField[];
}

export interface StorefrontData {
  store: Store;
  config: StorefrontConfig;
  sections: StorefrontSection[];
  products?: StorefrontProduct[];
  /** Absent on a storefront serialised before Site Settings existed. */
  settings?: SiteSettings;
  /** Null when the shop has never opened the form builder. */
  service_form?: PublicServiceForm | null;
}

// postMessage protocol
export interface PreviewUpdateMessage {
  type: "KORAA_PREVIEW_UPDATE";
  payload: {
    config: StorefrontConfig;
    sections: StorefrontSection[];
    store?: Partial<Store>;
  };
}
