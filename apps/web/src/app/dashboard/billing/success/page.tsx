import { redirect } from "next/navigation";

/**
 * Where the hosted Fapshi checkout used to send merchants back to. Now a redirect.
 *
 * Plans are charged in place (see `../PurchaseDialog`), so nothing creates a
 * hosted payment link any more and nothing sends anyone here — but this URL was
 * live for months and sits in browser histories, so it stays a valid route rather
 * than becoming a 404 for a merchant who returns to it.
 *
 * The page it replaces did real harm and is worth not resurrecting: it read *any*
 * failed status call as a failed payment (`catch(() => setState("failed"))`) and
 * told merchants "No charges were applied" on the strength of it. An unreachable
 * gateway is not a refused payment, and that page said it was.
 *
 * A `?transId=` on the way in is dropped deliberately: billing shows the plan
 * actually held right now, which is the honest answer to "did it work", and any
 * still-unsettled charge is finished by the reconcile sweep whether or not anyone
 * is looking.
 */
export default function BillingSuccessPage() {
  redirect("/dashboard/billing");
}
