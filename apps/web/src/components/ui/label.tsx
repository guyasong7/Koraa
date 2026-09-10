"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Reproduces globals.css `.input-label`.
 *
 * Labels stay visible by design — the CSS carries a note that a
 * placeholder is not a label, since it vanishes exactly when the user
 * most needs it. Do not swap this for a floating or placeholder label.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "mb-1.5 block text-sm font-[550] text-text-primary",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
