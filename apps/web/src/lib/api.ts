import axios from "axios";
import type { ServiceFormField, StorefrontLayout } from "@/types/storefront";

import { API_BASE_URL } from "./apiUrl";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach access token and handle FormData Content-Type
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("koraa_access");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Let Axios auto-set multipart/form-data with boundary
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem("koraa_refresh");
      if (!refreshToken) {
        window.location.href = "/auth/login";
        return Promise.reject(error);
      }
      try {
        const { data } = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
          refresh: refreshToken,
        });
        localStorage.setItem("koraa_access", data.access);
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch {
        localStorage.removeItem("koraa_access");
        localStorage.removeItem("koraa_refresh");
        window.location.href = "/auth/login";
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: RegisterData) => api.post("/auth/register/", data),
  login: (data: LoginData) => api.post("/auth/login/", data),
  socialLogin: (data: { provider: string; id_token: string; full_name?: string; referral_code?: string }) => api.post("/auth/social/", data),
  logout: (refresh: string) => api.post("/auth/logout/", { refresh }),
  me: () => api.get("/auth/me/"),
  updateMe: (data: Partial<UserProfile> | FormData) => api.patch("/auth/me/", data),
  verifyEmail: (email: string, otp: string) =>
    api.post("/auth/verify-email/confirm/", { email, otp }),
  requestOTP: (email: string) =>
    api.post("/auth/verify-email/request/", { email }),
  requestPasswordReset: (email: string) =>
    api.post("/auth/password-reset/request/", { email }),
  confirmPasswordReset: (token: string, password: string, password_confirm: string) =>
    api.post("/auth/password-reset/confirm/", { token, password, password_confirm }),
  changePassword: (data: any) => api.post("/auth/change-password/", data),
  getReferrals: () => api.get("/auth/referrals/"),
};

// ─── Merchants ────────────────────────────────────────────────────────────

export const merchantApi = {
  onboard: (data: MerchantOnboardData) => api.post("/merchants/onboard/", data),
  getProfile: () => api.get("/merchants/me/"),
  updateProfile: (data: Partial<MerchantProfile> | FormData) => api.patch("/merchants/me/", data),
  getStats: () => api.get("/merchants/stats/"),
  uploadIdentity: (data: FormData) => api.patch("/merchants/identity/", data),
  getIdentity: () => api.get("/merchants/identity/"),
  payouts: {
    list: () => api.get("/merchants/payouts/"),
    add: (data: { provider: string; name: string; phone: string }) => api.post("/merchants/payouts/", data),
    update: (id: string, data: { provider?: string; name?: string; phone?: string }) => api.patch(`/merchants/payouts/${id}/`, data),
    remove: (id: string) => api.delete(`/merchants/payouts/${id}/`),
  }
};

export const teamApi = {
  list: () => api.get("/merchants/team/"),
  /** Share one store. The backend requires a store — access is per store, not per account. */
  invite: (email: string, role: string, storeId: string) =>
    api.post("/merchants/team/", { email, role, store_id: storeId }),
  remove: (id: string) => api.delete(`/merchants/team/${id}/`),
};

export const notificationsApi = {
  list: () => api.get("/notifications/"),
  markAllRead: () => api.post("/notifications/mark-all-read/"),
  markOneRead: (id: string) => api.patch(`/notifications/${id}/read/`),
  respond: (id: string, action: "accept" | "reject") =>
    api.post(`/notifications/${id}/respond/`, { action }),
};

// ─── Stores ───────────────────────────────────────────────────────────────

export const storeApi = {
  list: () => api.get("/stores/"),
  create: (data: StoreCreateData) => api.post("/stores/", data),
  get: (id: string) => api.get(`/stores/${id}/`),
  update: (id: string, data: Partial<StoreUpdateData>) => api.patch(`/stores/${id}/`, data),
  delete: (id: string) => api.delete(`/stores/${id}/`),
  publish: (id: string) => api.post(`/stores/${id}/publish/`),
  unpublish: (id: string) => api.post(`/stores/${id}/unpublish/`),
  checkSlug: (slug: string) => api.get(`/stores/check-slug/?slug=${slug}`),
  /** Run this store's SEO audit. Computed on request — nothing is stored. */
  seoAudit: (id: string) => api.get<SeoReport>(`/stores/${id}/seo/`),
  /**
   * Site settings: availability, languages, privacy, crawlers, images and the
   * rest. Returns the panel declarations as well as the values, so the settings
   * screen is rendered from the backend schema rather than a second copy of it
   * written in TypeScript.
   */
  siteSettings: (id: string) =>
    api.get<SiteSettingsResponse>(`/stores/${id}/site-settings/`),
  /** Partial by key — send only what changed. */
  updateSiteSettings: (id: string, settings: Record<string, unknown>) =>
    api.patch<SiteSettingsResponse>(`/stores/${id}/site-settings/`, { settings }),
  aiChat: (message: string, history: any[]) => api.post("/stores/ai-chat/", { message, history }),
};

// ─── Products ─────────────────────────────────────────────────────────────

export const productApi = {
  list: (storeId: string, params?: Record<string, string>) =>
    api.get(`/stores/${storeId}/products/`, { params }),
  create: (storeId: string, data: ProductCreateData) =>
    api.post(`/stores/${storeId}/products/`, data),
  get: (storeId: string, productId: string) =>
    api.get(`/stores/${storeId}/products/${productId}/`),
  update: (storeId: string, productId: string, data: Partial<ProductCreateData>) =>
    api.patch(`/stores/${storeId}/products/${productId}/`, data),
  delete: (storeId: string, productId: string) =>
    api.delete(`/stores/${storeId}/products/${productId}/`),
  uploadImage: (storeId: string, productId: string, file: File, removeBg = true) => {
    const fd = new FormData();
    fd.append("image", file);
    return api.post(
      `/stores/${storeId}/products/${productId}/images/upload/?remove_bg=${removeBg ? 1 : 0}`,
      fd,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  },
  deleteImage: (storeId: string, productId: string, imageId: string) =>
    api.delete(`/stores/${storeId}/products/${productId}/images/${imageId}/`),
  // ── Digital delivery ───────────────────────────────────────────────────
  //
  // The bytes are never handed back: `file` is write-only on the backend, so
  // these calls return a name, a size and an id, and a buyer reaches the file
  // through a download token instead. Uploading the first file to a `simple`
  // product promotes it to `digital` server-side — a product with files and no
  // delivery would take money and send nothing.
  listFiles: (storeId: string, productId: string) =>
    api.get<ProductFile[]>(`/stores/${storeId}/products/${productId}/files/`),
  uploadFile: (storeId: string, productId: string, file: File, label = "") => {
    const fd = new FormData();
    fd.append("file", file);
    if (label) fd.append("label", label);
    return api.post<ProductFile>(
      `/stores/${storeId}/products/${productId}/files/`,
      fd,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
  },
  updateFile: (
    storeId: string,
    productId: string,
    fileId: string,
    data: { label?: string; sort_order?: number },
  ) => api.patch<ProductFile>(`/stores/${storeId}/products/${productId}/files/${fileId}/`, data),
  deleteFile: (storeId: string, productId: string, fileId: string) =>
    api.delete(`/stores/${storeId}/products/${productId}/files/${fileId}/`),
  aiSuggest: (storeId: string, file: File) => {
    const fd = new FormData();
    fd.append("image", file);
    return api.post(
      `/stores/${storeId}/products/ai-suggest/`,
      fd,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  },
  /**
   * The catalogue as a CSV, in the column order `importCsv` accepts — so the
   * file that comes out is the file that can go back in. `template: true`
   * returns a one-row example instead, for a shop with nothing in it yet.
   */
  exportCsv: (storeId: string, template = false) =>
    api.get<Blob>(`/stores/${storeId}/products/export/`, {
      params: template ? { template: 1 } : undefined,
      responseType: "blob",
    }),
  /**
   * Import a CSV. Call it once with `commit: false` to see what would happen,
   * then again with `commit: true` to apply it — the backend writes nothing on
   * the first call.
   */
  importCsv: (storeId: string, file: File, commit: boolean) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("commit", commit ? "true" : "false");
    return api.post<ImportReport>(`/stores/${storeId}/products/import/`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

// ─── Orders ───────────────────────────────────────────────────────────────
//
// Not nested under a store, unlike products: the endpoint returns orders from
// every shop the merchant can reach, with `store` as a filter, because a
// merchant with three shops wants one order book rather than three.

export const orderApi = {
  list: (params?: OrderListParams) => api.get<Paginated<MerchantOrder>>("/orders/", { params }),
  get: (id: string) => api.get<MerchantOrder>(`/orders/${id}/`),
  /** Re-send the shopper their invoice. The paid callback already sent one. */
  resendInvoice: (id: string) => api.post<{ sent: boolean; to: string }>(`/orders/${id}/invoice/`),
  /**
   * The same list, as a CSV. `responseType: "blob"` matters — without it Axios
   * parses the body as text and a file saved from it is subtly wrong.
   */
  exportCsv: (params?: OrderListParams) =>
    api.get<Blob>("/orders/export/", { params, responseType: "blob" }),
  /**
   * Re-send the download links for a paid order's digital products.
   *
   * Needed more often than a re-sent invoice: a lost download email is a lost
   * purchase, because the buyer has no account to sign into and find it again.
   * It emails the existing links rather than minting new ones, so someone who
   * has used up their downloads is not quietly given more.
   */
  resendDownloads: (id: string) =>
    api.post<{ sent: boolean; to: string }>(`/orders/${id}/downloads/`),
};


// ─── Analytics ────────────────────────────────────────────────────────────
//
// Three endpoints for three tabs rather than one for all three, so switching
// back to a tab you have already opened is instant instead of recomputing every
// report. `store` omitted means every shop the account can reach.

export const analyticsApi = {
  traffic: (params?: AnalyticsParams) =>
    api.get<TrafficReport>("/analytics/traffic/", { params }),
  engagement: (params?: AnalyticsParams) =>
    api.get<EngagementReport>("/analytics/engagement/", { params }),
  sales: (params?: AnalyticsParams) => api.get<SalesReport>("/analytics/sales/", { params }),
};

export const storefrontApi = {
  getConfig: (storeId: string) => api.get(`/storefront/config/?store_id=${storeId}`),
  updateConfig: (storeId: string, data: Partial<StorefrontConfig>) => api.patch(`/storefront/config/?store_id=${storeId}`, data),
  getSections: (storeId: string) => api.get(`/storefront/sections/?store_id=${storeId}`),
  createSection: (storeId: string, data: Partial<StorefrontSection>) => api.post(`/storefront/sections/?store_id=${storeId}`, data),
  updateSection: (storeId: string, id: string, data: Partial<StorefrontSection>) => api.patch(`/storefront/sections/${id}/?store_id=${storeId}`, data),
  deleteSection: (storeId: string, id: string) => api.delete(`/storefront/sections/${id}/?store_id=${storeId}`),
  reorderSections: (storeId: string, sections: Array<{ id: string; order: number }>) =>
    api.post(`/storefront/sections/reorder/?store_id=${storeId}`, { sections }),
  publish: (storeId: string) => api.post(`/storefront/publish/?store_id=${storeId}`),
  uploadSectionImage: (storeId: string, sectionId: string, file: File) => {
    const fd = new FormData();
    fd.append("image", file);
    return api.post(`/storefront/sections/${sectionId}/upload-image/?store_id=${storeId}`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  uploadStoreAssets: (
    storeId: string,
    assets: { logo?: File; favicon?: File; social_image?: File },
  ) => {
    const fd = new FormData();
    if (assets.logo) fd.append("logo", assets.logo);
    if (assets.favicon) fd.append("favicon", assets.favicon);
    if (assets.social_image) fd.append("social_image", assets.social_image);
    return api.post<{ logo: string | null; favicon: string | null; social_image: string | null }>(
      `/storefront/store-assets/?store_id=${storeId}`,
      fd,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
  },
  // ── Enquiry form (service businesses) ──────────────────────────────────
  //
  // GET creates the row on first read, so the builder never has to do a POST
  // for the first save and a PATCH for every one after it. `field_types` rides
  // along on the response — the palette of field types comes from the backend
  // so adding one is a backend-only change.
  getServiceForm: (storeId: string) =>
    api.get<ServiceFormConfig>(`/storefront/service-form/?store_id=${storeId}`),
  updateServiceForm: (storeId: string, data: Partial<ServiceFormConfig>) =>
    api.patch<ServiceFormConfig>(`/storefront/service-form/?store_id=${storeId}`, data),
  listEnquiries: (storeId: string, params?: { page?: number }) =>
    api.get<Paginated<FormSubmission>>(`/storefront/enquiries/?store_id=${storeId}`, { params }),
  markEnquiryRead: (storeId: string, id: string, isRead: boolean) =>
    api.patch<FormSubmission>(`/storefront/enquiries/${id}/?store_id=${storeId}`, {
      is_read: isRead,
    }),
  deleteEnquiry: (storeId: string, id: string) =>
    api.delete(`/storefront/enquiries/${id}/?store_id=${storeId}`),
};

// ─── Blueprint (guided storefront setup) ──────────────────────────────────

export const blueprintApi = {
  /** Every option the wizard can offer, plus defaults for this merchant. */
  getCatalogue: (storeId: string) =>
    api.get<BlueprintCatalogue>(`/storefront/blueprint/?store_id=${storeId}`),
  apply: (storeId: string, answers: BlueprintAnswers) =>
    api.post(`/storefront/blueprint/apply/?store_id=${storeId}`, answers),
};

// ─── Public Storefront (no auth) ──────────────────────────────────────────

/**
 * Base URL for fetches that run in the Next.js server, not the browser.
 *
 * In production the browser must use the public API origin, but the server
 * sits on the same private network as the backend — going out through the
 * public hostname would hairpin through nginx and TLS for nothing, and fails
 * outright when the public DNS name is not resolvable from inside the network.
 * INTERNAL_API_URL (e.g. http://backend:8000/api/v1) is server-only: it is not
 * declared in next.config.ts's `env`, so it is never inlined into the client
 * bundle and stays a runtime lookup on the server.
 */
function serverApiBase(): string {
  return (
    process.env.INTERNAL_API_URL ||
    process.env.KORAA_PUBLIC_API_URL ||
    "http://localhost:8000/api/v1"
  );
}

/**
 * The origin the *browser* must prefix onto an API path.
 *
 * Needed where the backend hands back a path rather than a whole URL. The
 * download endpoints do, because the token in the path is the credential and
 * assembling that path a second time in TypeScript would be a second place to
 * get it wrong. A relative `KORAA_PUBLIC_API_URL` means the API is served from
 * the page's own origin, so an empty prefix is already right.
 *
 * Deliberately not `serverApiBase()`: this value ends up in an `href` a person
 * clicks, and `INTERNAL_API_URL` is only resolvable from inside the network.
 */
export function apiOrigin(): string {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return "";
  }
}

/**
 * The shop's robots.txt, as the backend writes it.
 *
 * Proxied rather than assembled here: the Crawlers panel's rules, the
 * published/private override and the merchant's own extra lines all live in
 * `apps/storefront/views._robots_txt`, and a second copy of that logic in
 * TypeScript would be a second thing to keep in step.
 *
 * `null` when the shop cannot be resolved, so the route can answer with a
 * blanket Disallow rather than an empty file that reads as "crawl everything".
 */
export async function getStorefrontRobots(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`${serverApiBase()}/public/storefront/${encodeURIComponent(slug)}/robots.txt`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

export async function getStorefrontByDomain(domain: string) {
  try {
    const API = serverApiBase();
    const res = await fetch(`${API}/public/storefront/by-domain/?domain=${encodeURIComponent(domain)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getStorefrontPreview(storeId: string, accessToken: string) {
  try {
    const API = serverApiBase();
    const res = await fetch(`${API}/public/storefront/preview/${storeId}/`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store", // Never cache preview
    });
    
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// Separate unauthenticated instance for public storefront APIs
// This avoids the JWT interceptor triggering redirects on public endpoints
const publicApi = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

export const publicStorefrontApi = {
  getStorefront: (domain: string) => publicApi.get(`/public/storefront/by-domain/?domain=${domain}`),
  checkout: (domain: string, data: CheckoutData) => publicApi.post(`/public/storefront/${domain}/orders/`, data),
  /**
   * Send an enquiry from a storefront's form.
   *
   * A 400 carries `{ errors: { field_key: "message" } }` keyed by the merchant's
   * own field names, so the form can show each message under the input it
   * belongs to instead of one banner at the top.
   */
  submitEnquiry: (slug: string, answers: Record<string, unknown>) =>
    publicApi.post<EnquiryResult>(`/public/storefront/${slug}/enquiries/`, { answers }),
  /**
   * What a download link resolves to. Unauthenticated: the token in the URL is
   * the credential, because a Koraa storefront has no shopper accounts.
   */
  getDownload: (token: string) =>
    publicApi.get<DownloadManifest>(`/public/download/${token}/`),
};

// ─── Types ────────────────────────────────────────────────────────────────

export interface RegisterData {
  email: string;
  full_name: string;
  phone?: string;
  password: string;
  password_confirm: string;
  referral_code?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  avatar: string | null;
  role: "merchant" | "shopper" | "staff" | "admin";
  is_verified: boolean;
  is_pro?: boolean;
  has_merchant?: boolean;
  merchant_tier?: string;
  merchant_is_verified?: boolean;
  date_joined: string;
  date_of_birth?: string | null;
  gender?: string;
  id_card_number?: string;
  city?: string;
}

export interface MerchantOnboardData {
  business_name: string;
  business_type: string;
  country: string;
  city?: string;
  phone?: string;
}

export interface MerchantProfile {
  id: string;
  business_name: string;
  business_type: string;
  description: string;
  logo: string | null;
  email: string;
  phone: string;
  country: string;
  tier: string;
  is_pro: boolean;
  store_count: number;
}

export interface StoreCreateData {
  name: string;
  tagline?: string;
  currency: string;
  country: string;
  language?: string;
  is_registered?: boolean;
}

export interface StoreUpdateData {
  name?: string;
  tagline?: string;
  description?: string;
  currency?: string;
  country?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  instagram?: string;
  facebook?: string;
  custom_domain?: string;
  seo_title?: string;
  seo_description?: string;
}

export interface Store {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  logo: string | null;
  favicon: string | null;
  status: "draft" | "preview" | "published" | "suspended";
  currency: string;
  storefront_url: string;
  created_at: string;
  /** False when this store was shared with you rather than created by you. */
  is_owner?: boolean;
  /** "owner", or the label the owner picked when inviting you. */
  access_role?: string;
  /** The owner's business name. Empty on your own stores. */
  shared_by?: string;
}

export interface ProductCreateData {
  name: string;
  description?: string;
  product_type: "simple" | "variable" | "digital" | "service";
  base_price: string;
  status?: "draft" | "active";
  category?: string;
  /** Digital only. 0 means unlimited. */
  download_limit?: number;
  /** Digital only. 0 means the link never expires. */
  download_window_days?: number;
  /** Services only: show an enquiry button rather than add-to-cart. */
  accepts_enquiries?: boolean;
}

/**
 * One file behind a digital product.
 *
 * There is no URL on it. The stored path lives under MEDIA_ROOT, which is
 * served publicly, so the backend keeps `file` write-only and buyers fetch the
 * bytes through a download token instead.
 */
export interface ProductFile {
  id: string;
  /** The label, or the uploaded file's own name when no label was given. */
  name: string;
  label: string;
  size_bytes: number;
  sort_order: number;
  created_at: string;
}

// ─── Enquiry form types ───────────────────────────────────────────────────
//
// Mirrors `backend/apps/storefront/models.ServiceForm`. The field-type palette
// is not restated here: it arrives on the response as `field_types`, so the
// builder renders whatever the backend offers.

/** One entry in the builder's palette, straight from `ServiceForm.FIELD_TYPES`. */
export interface ServiceFormFieldType {
  type: string;
  label: string;
  /** True for the types that need a list of choices (select, radio, checkboxes). */
  options?: boolean;
  multiline?: boolean;
}

export interface ServiceFormConfig {
  id: string;
  is_enabled: boolean;
  title: string;
  description: string;
  submit_label: string;
  success_message: string;
  fields: ServiceFormField[];
  /** Where leads are emailed. Empty falls back to the shop's own address. */
  notify_emails: string[];
  send_copy_to_sender: boolean;
  // Read-only.
  field_types?: ServiceFormFieldType[];
  submission_count?: number;
  updated_at?: string;
}

export interface FormSubmissionAnswer {
  key: string;
  label: string;
  value: string;
}

export interface FormSubmission {
  id: string;
  answers: FormSubmissionAnswer[];
  /** The longest answer, trimmed — enough to recognise a lead in a list. */
  summary: string;
  sender_name: string;
  sender_email: string;
  sender_phone: string;
  is_read: boolean;
  /** Null when the notification email could not be sent. */
  emailed_at: string | null;
  created_at: string;
}

export interface EnquiryResult {
  received: boolean;
  /** The merchant's own success message, so the confirmation is in their voice. */
  message: string;
  /** False when the lead was stored but the email did not go out. */
  emailed: boolean;
}

// ─── Digital download types ───────────────────────────────────────────────

export interface DownloadFile {
  id: string;
  name: string;
  size_bytes: number;
  /** Absolute path on the API, already tokenised. Not a media URL. */
  url: string;
}

export interface DownloadManifest {
  /** `ready`, or why not: the page shows the shop's contact details either way. */
  state: "ready" | "expired" | "exhausted";
  product_name: string;
  reference: string;
  purchased_at: string;
  /** Null when the grant is unlimited. */
  downloads_remaining: number | null;
  /** Null when the link never expires. */
  expires_at: string | null;
  store: {
    name: string;
    slug: string;
    url: string;
    email: string;
    phone: string;
    logo: string | null;
    primary_color: string;
  };
  files: DownloadFile[];
}

export interface StorefrontConfig {
  id?: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  font: string;
  heading_font?: string;
  button_style: string;
  product_card_style: string;
  /** Page structure. Absent on storefronts published before layouts existed. */
  layout?: StorefrontLayout;
  navigation: any;
  footer: any;
  announcement_bar: any;
  published_at?: string | null;
}

export interface StorefrontSection {
  id: string;
  type: string;
  order: number;
  enabled: boolean;
  settings: any;
}

// ─── Order types ──────────────────────────────────────────────────────────
/** DRF's PageNumberPagination envelope. */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface MerchantOrderItem {
  id: string;
  /** Null once the product has been deleted; the snapshot fields survive it. */
  product: string | null;
  product_name: string;
  quantity: number;
  price: string;
  line_total: string;
}

export interface MerchantOrder {
  id: string;
  /** The eight characters the invoice, the payment message and this list share. */
  reference: string;
  store: string;
  store_name: string;
  store_slug: string;
  currency: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  city: string;
  total_amount: string;
  payment_status: "pending" | "paid" | "failed";
  item_count: number;
  created_at: string;
  // Detail only.
  shipping_address?: string;
  postal_code?: string;
  payment_link?: string;
  fapshi_trans_id?: string;
  items?: MerchantOrderItem[];
  updated_at?: string;
}

export interface OrderListParams {
  store?: string;
  payment_status?: string;
  search?: string;
  ordering?: string;
  page?: number;
  created_at__gte?: string;
  created_at__lte?: string;
}

// ─── Analytics types ──────────────────────────────────────────────────────
//
// Mirrors `backend/apps/analytics/reports.py`. Two things to carry in mind when
// rendering these:
//
// * Traffic and engagement counts come from collected events, which a visitor
//   can decline. They are a floor, not a census, and the page says so.
// * Money arrives as a *string*, because a decimal parsed into a JavaScript
//   number is a decimal that can be rounded. Format it; do not add to it.

export interface AnalyticsParams {
  /** A store id, or omitted for every shop the account can reach. */
  store?: string;
  days?: number;
}

export interface AnalyticsRange {
  days: number;
  start: string;
  end: string;
}

/** Every shop the report could have covered, for the picker. */
export interface AnalyticsStoreOption {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface TrafficReport {
  range: AnalyticsRange;
  totals: {
    views: number;
    visitors: number;
    views_per_visitor: number;
    bounce_rate: number;
  };
  previous: { views: number; visitors: number };
  series: Array<{ date: string; views: number; visitors: number }>;
  top_pages: Array<{ path: string; views: number }>;
  referrers: Array<{ source: string; views: number }>;
  devices: Array<{ device: string; views: number }>;
  stores: Array<{ id: string; name: string; slug: string; views: number }>;
  available_stores: AnalyticsStoreOption[];
}

export interface EngagementReport {
  range: AnalyticsRange;
  totals: {
    product_views: number;
    add_to_cart: number;
    checkout_started: number;
    searches: number;
    enquiries: number;
    orders_paid: number;
  };
  /** `rate` is null where the step is measured differently from the one above. */
  funnel: Array<{ step: string; count: number; rate: number | null }>;
  series: Array<{
    date: string;
    product_views: number;
    add_to_cart: number;
    checkout_start: number;
  }>;
  top_products: Array<{
    id: string;
    name: string;
    views: number;
    carted: number;
    cart_rate: number;
  }>;
  searches: Array<{ term: string; count: number }>;
  stores: Array<{ id: string; name: string; slug: string; events: number }>;
  available_stores: AnalyticsStoreOption[];
}

export interface SalesReport {
  range: AnalyticsRange;
  /** Null when the selected shops bill in different currencies. */
  currency: string | null;
  totals: {
    orders: number;
    orders_all: number;
    /** Null when the shops selected bill in different currencies. */
    revenue: string | null;
    average_order: string | null;
    units: number;
    /** Null when there was no measured traffic to divide by. */
    conversion_rate: number | null;
  };
  previous: { orders: number; revenue: string | null };
  series: Array<{ date: string; orders: number; revenue: string | null }>;
  by_status: Array<{ status: string; orders: number; revenue: string | null }>;
  top_products: Array<{ name: string; units: number; revenue: string | null }>;
  stores: Array<{
    id: string;
    name: string;
    slug: string;
    currency: string;
    orders: number;
    revenue: string;
  }>;
  available_stores: AnalyticsStoreOption[];
}

// ─── SEO types ────────────────────────────────────────────────────────────
//
// Mirrors `backend/apps/stores/seo.py`, which owns every threshold and every
// piece of advice. Nothing here restates a rule — the page renders whatever
// checks the audit returns, so adding a check is a backend-only change.

export type SeoStatus = "pass" | "warn" | "fail";

export interface SeoCheck {
  key: string;
  label: string;
  status: SeoStatus;
  weight: number;
  detail: string;
  fix: string;
  /** False when the check cannot apply yet; shown, but not scored. */
  applicable: boolean;
  action: { label: string; href: string } | null;
}

export interface SeoGroup {
  key: string;
  title: string;
  blurb: string;
  checks: SeoCheck[];
}

export interface SeoReport {
  store: { id: string; name: string; slug: string; url: string };
  generated_at: string;
  score: number;
  grade: string;
  summary: { passed: number; warnings: number; problems: number; total: number };
  preview: {
    title: string;
    url: string;
    description: string;
    truncated_title: boolean;
    truncated_description: boolean;
  };
  /** The five worst, worst first — "do this next" rather than an inventory. */
  priorities: SeoCheck[];
  groups: SeoGroup[];
}

// ─── Site settings types ──────────────────────────────────────────────────
//
// Mirrors `backend/apps/stores/site_settings.py`, which declares the thirteen
// panels, their fields, their choices and their help text. Nothing here
// restates a choice list: the settings page renders whatever `panels` contains,
// so a new setting is a backend-only change.

export type SettingKind =
  | "bool"
  | "string"
  | "text"
  | "url"
  | "int"
  | "choice"
  | "multi"
  | "tags"
  | "image";

export interface SettingField {
  key: string;
  label: string;
  kind: SettingKind;
  help: string;
  choices: Array<{ value: string; label: string }>;
  max_length: number | null;
  min: number | null;
  max: number | null;
  /** "settings" lives in the JSON blob; "store" is a column on the store. */
  source: "settings" | "store";
  /** Render only when another field holds a given value. */
  depends_on: { key: string; value: string | boolean } | null;
  secret: boolean;
}

export interface SettingPanel {
  key: string;
  title: string;
  blurb: string;
  /** Non-empty when the panel needs a bespoke widget rather than plain fields. */
  component: "" | "favicon" | "social_sharing" | "import_export";
  fields: SettingField[];
}

export type SettingValue = string | number | boolean | string[];

export interface SiteSettingsResponse {
  panels: SettingPanel[];
  values: Record<string, SettingValue>;
  /** Whether a passcode is set. The passcode itself never leaves the server. */
  has_access_password: boolean;
  store: {
    id: string;
    name: string;
    favicon: string | null;
    social_image: string | null;
    instagram: string;
    facebook: string;
    whatsapp: string;
    seo_title: string;
    seo_description: string;
  };
}

/** The result of a catalogue CSV import — dry run and commit share this shape. */
export interface ImportReport {
  committed: boolean;
  errors: string[];
  create: number;
  update: number;
  create_sample?: string[];
  update_sample?: string[];
  created?: number;
  updated?: number;
}

// ─── Blueprint types ──────────────────────────────────────────────────────
//
// These mirror `backend/apps/storefront/blueprint.py`, which is the only
// place the actual palettes, pairings and kits are written down. Nothing
// here restates a colour or a font name — the wizard renders whatever the
// catalogue endpoint sends, so a palette added on the backend shows up
// without a frontend change.

export interface BlueprintCategory {
  key: string;
  name: string;
  blurb: string;
  /** What this category starts you on, so changing the answer re-recommends. */
  recommends: {
    palette: string;
    pairing: string;
    style_kit: string;
    sections: string[];
  };
}

export interface BlueprintPalette {
  key: string;
  name: string;
  mood: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
}

export interface BlueprintPairing {
  key: string;
  name: string;
  mood: string;
  heading_font: string;
  font: string;
}

export interface BlueprintStyleKit {
  key: string;
  name: string;
  mood: string;
  button_style: string;
  product_card_style: string;
}

export interface BlueprintSectionOption {
  type: string;
  name: string;
  blurb: string;
  required: boolean;
  /** Placeholder copy, so the preview can show a section the store has no row for yet. */
  default_settings: Record<string, unknown>;
}

export interface BlueprintAnswers {
  category: string;
  palette: string;
  pairing: string;
  style_kit: string;
  sections: string[];
}

export interface BlueprintCatalogue {
  categories: BlueprintCategory[];
  palettes: BlueprintPalette[];
  pairings: BlueprintPairing[];
  style_kits: BlueprintStyleKit[];
  sections: BlueprintSectionOption[];
  defaults: BlueprintAnswers;
  current: {
    font: string;
    heading_font: string;
    button_style: string;
    product_card_style: string;
    primary_color: string;
    sections: string[];
  };
  store: { id: string; name: string; tagline: string };
}

/** One tier as served by `/payments/plans/`, derived from `merchants.plans`. */
export interface PlanCatalogueEntry {
  key: string;
  name: string;
  tagline: string;
  price_yearly: number;
  order: number;
  /** Null means unlimited — the backend cannot send Infinity as JSON. */
  limits: Record<string, number | null>;
  features: Record<string, boolean>;
}

/** `/payments/subscription/` — see `payments.lifecycle.subscription_state`. */
export interface SubscriptionState {
  /** The tier actually enforced right now; free once a paid term lapses. */
  plan: string;
  /** The tier they bought, which outlives the term until the sweep runs. */
  purchased_plan: string;
  status: "active" | "expired";
  billing_cycle: string;
  /** Null on free. */
  expires_at: string | null;
  /** End of the paid term, kept even after the drop to free. */
  term_ends_at: string | null;
  is_expired: boolean;
  days_remaining: number;
  /** True inside the last week of a paid term. */
  expiring_soon: boolean;
  amount_paid: number;
  renewal_price: number;
  /** The plan they were last on, once a term has been retired. */
  previous_plan: string | null;
  previous_plan_ended_at: string | null;
  usage: Record<string, unknown> | null;
}

/** The whole `/payments/plans/` payload. */
export interface PlanCatalogue {
  currency: string;
  billing_cycle: string;
  plans: PlanCatalogueEntry[];
}

/**
 * Plan catalogue for the marketing pricing table, fetched on the server.
 *
 * `PlanCatalogueView` is `AllowAny` with no authentication classes, so this
 * needs no token. Revalidated hourly: a price change has to reach the
 * pricing page, but not at the cost of a backend round trip per visitor.
 *
 * Returns null when the backend is unreachable — `npm run build` runs with
 * nothing listening on :8000, and a marketing page must not fail the build
 * over a pricing fetch. The caller renders a link to the dashboard instead
 * of inventing numbers, and the next revalidation fills the table in.
 */
export async function getPlanCatalogue(): Promise<PlanCatalogue | null> {
  try {
    const res = await fetch(`${serverApiBase()}/payments/plans/`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export const paymentApi = {
  initiate: (plan: string, billing_cycle: string) =>
    api.post("/payments/initiate/", { plan, billing_cycle }),
  verifyCallback: (transId: string) =>
    api.get(`/payments/callback/?transId=${transId}`),
  getSubscription: () =>
    api.get<SubscriptionState>("/payments/subscription/"),
  /** Public plan table. Prices live in `merchants.plans`, never in the UI. */
  getPlans: () =>
    api.get<PlanCatalogue>("/payments/plans/"),
};

export interface CheckoutData {
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  shipping_address: string;
  city: string;
  postal_code?: string;
  items: Array<{
    product_id: string;
    quantity: number;
  }>;
}
