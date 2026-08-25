/**
 * Where the browser reaches the API.
 *
 * In its own module so a page that needs only the URL — the analytics beacon —
 * does not pull axios and every API type into the bundle with it.
 *
 * A relative value means the API is served from the page's own origin.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
