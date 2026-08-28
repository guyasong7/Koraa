/**
 * Cameroonian mobile money numbers, for the checkout form.
 *
 * Deliberately a thinner version of `backend/apps/payments/fapshi.py`. The
 * backend parses with `phonenumbers` and is the authority: it is what refuses a
 * landline, and what the charge is actually built from. These exist so a shopper
 * who mistypes their number learns about it while their thumb is still on the
 * keyboard, rather than after a round trip.
 *
 * They must stay *permissive* relative to the backend. A client check stricter
 * than the server's would reject numbers that would in fact have worked, and
 * nobody would ever see the error to report it.
 */

import type { PaymentMedium } from "@/lib/api";

export const MEDIUM_MTN: PaymentMedium = "mobile money";
export const MEDIUM_ORANGE: PaymentMedium = "orange money";

/**
 * Nine local digits, from whatever the shopper typed.
 *
 * Accepts `+237 6 70 00 00 00`, `00237670000000`, `670 000 000` — the forms
 * people actually write on a Cameroonian shopfront. Returns "" when there is
 * nothing usable to send, which is what `isPlausibleMsisdn` reports on.
 */
export function normaliseMsisdn(raw: string): string {
  const digits = (raw || "").replace(/\D+/g, "");
  if (!digits) return "";
  // Strip the country code in either of the two ways it gets written.
  if (digits.startsWith("00237")) return digits.slice(5);
  if (digits.startsWith("237")) return digits.slice(3);
  return digits;
}

/**
 * Could this reach a mobile money wallet?
 *
 * Nine digits starting with 6 — every Cameroonian mobile number, and no
 * landline. Whether the *specific* number exists is Fapshi's answer to give, and
 * "not registered for mobile money" is the one error worth a round trip because
 * no client-side table can know it.
 */
export function isPlausibleMsisdn(raw: string): boolean {
  return /^6\d{8}$/.test(normaliseMsisdn(raw));
}

/**
 * Which wallet a number probably belongs to, or null when unclear.
 *
 * Pre-ticks a radio so the shopper usually does not have to think about it, and
 * that is *all* it does. Operators reallocate prefix ranges and this table will
 * go stale, so the charge omits `medium` unless the shopper overrode the
 * pre-selection and Fapshi resolves the number itself. Being wrong here costs a
 * radio button; being wrong on the charge would route money to the wrong
 * operator. Mirrors `fapshi.infer_medium`.
 */
export function inferMedium(raw: string): PaymentMedium | null {
  const msisdn = normaliseMsisdn(raw);
  if (!/^\d{9}$/.test(msisdn)) return null;
  const prefix = msisdn.slice(0, 2);
  const third = msisdn[2];
  if (prefix === "67") return MEDIUM_MTN;
  if (prefix === "69") return MEDIUM_ORANGE;
  // 650-654 and 680-684 are MTN; 655-659 and 685-689 are Orange.
  if (prefix === "65" || prefix === "68") {
    return "01234".includes(third) ? MEDIUM_MTN : MEDIUM_ORANGE;
  }
  // 62x is Camtel, which Fapshi does not carry for mobile money.
  return null;
}

/** "MTN MoMo" / "Orange Money", for a label. */
export function mediumLabel(medium: PaymentMedium): string {
  return medium === MEDIUM_ORANGE ? "Orange Money" : "MTN MoMo";
}

/** A basic shape check for an email, replacing a truthiness test. */
export function isPlausibleEmail(raw: string): boolean {
  const text = (raw || "").trim();
  // One @, something either side, and a dot in the domain. Anything tighter
  // starts rejecting real addresses, and the confirmation email is the real test.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}
