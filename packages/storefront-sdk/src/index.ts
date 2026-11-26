/**
 * Koraa Storefront SDK
 *
 * Official SDK for building custom storefront templates for Koraa.
 */

export interface Store {
  id: string;
  name: string;
  slug: string;
  description: string;
  logo?: string;
  primary_color: string;
  secondary_color: string;
  currency: string;
  domain: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  stock: number;
  category?: string;
  is_available: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface TemplateMeta {
  id: string;
  name: string;
  version: string;
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  description: string;
  thumbnail: string;
  categories: string[];
  tags: string[];
  price?: number;
  demo?: string;
  repository?: string;
}

export interface TemplateConfig {
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
  fonts?: {
    heading?: string;
    body?: string;
  };
  layout?: Record<string, any>;
}

export interface KoraaTemplate {
  meta: TemplateMeta;
  config?: TemplateConfig;
  Layout: React.ComponentType<LayoutProps>;
}

export interface LayoutProps {
  children: React.ReactNode;
  store: Store;
}

export interface TemplateContext {
  store: Store;
  products: Product[];
  cart: CartItem[];
  addToCart: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
}

/**
 * Define a Koraa storefront template.
 */
export function defineTemplate(template: KoraaTemplate): KoraaTemplate {
  // Validate template structure
  if (!template.meta) {
    throw new Error("Template must include meta information");
  }
  if (!template.meta.id || !template.meta.name || !template.meta.version) {
    throw new Error("Template meta must include id, name, and version");
  }
  if (!template.Layout) {
    throw new Error("Template must include a Layout component");
  }

  return template;
}

/**
 * Validate template package structure.
 */
export function validateTemplate(template: any): boolean {
  try {
    if (!template || typeof template !== "object") return false;
    if (!template.meta || typeof template.meta !== "object") return false;
    if (!template.meta.id || typeof template.meta.id !== "string") return false;
    if (!template.meta.name || typeof template.meta.name !== "string") return false;
    if (!template.meta.version || typeof template.meta.version !== "string") return false;
    if (!template.Layout || typeof template.Layout !== "function") return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize store data for template consumption.
 */
export function sanitizeStoreData(store: any): Store {
  return {
    id: String(store.id || ""),
    name: String(store.name || ""),
    slug: String(store.slug || ""),
    description: String(store.description || ""),
    logo: store.logo ? String(store.logo) : undefined,
    primary_color: String(store.primary_color || "#000000"),
    secondary_color: String(store.secondary_color || "#ffffff"),
    currency: String(store.currency || "XAF"),
    domain: String(store.domain || ""),
  };
}

/**
 * Sanitize products data for template consumption.
 */
export function sanitizeProducts(products: any[]): Product[] {
  if (!Array.isArray(products)) return [];

  return products.map(p => ({
    id: String(p.id || ""),
    name: String(p.name || ""),
    description: String(p.description || ""),
    price: Number(p.price) || 0,
    images: Array.isArray(p.images) ? p.images.map(String) : [],
    stock: Number(p.stock) || 0,
    category: p.category ? String(p.category) : undefined,
    is_available: Boolean(p.is_available),
  }));
}

// Types are already exported above
