import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names, letting later Tailwind utilities win over earlier ones.
 *
 * Plain `clsx` concatenates, which loses on conflicts: `cn("p-2", "p-4")` has
 * to be `p-4`, but string order alone does not decide that in CSS — the two
 * utilities have equal specificity, so whichever Tailwind emitted later wins
 * regardless of the order they appear in the attribute. `twMerge` resolves the
 * conflict by dropping the earlier one, which is what makes a `className` prop
 * on a styled component able to override its defaults.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
