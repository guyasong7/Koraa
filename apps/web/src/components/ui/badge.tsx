"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Reproduces globals.css `.badge` and its five tones.
 *
 * Each tone is a `color-mix` tint of a status token rather than a fixed
 * pastel, so the same class stays legible in both themes: the tint and
 * the border track the token, and the text uses the `-text` variant,
 * which is the stop that clears 4.5:1 as type on that tint.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-[5px] rounded-full border border-transparent px-2.5 py-1 text-[0.8125rem] font-[550] leading-[1.4] whitespace-nowrap",
  {
    variants: {
      variant: {
        success:
          "bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-success-text border-[color-mix(in_srgb,var(--success)_25%,transparent)]",
        warning:
          "bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-warning-text border-[color-mix(in_srgb,var(--warning)_28%,transparent)]",
        danger:
          "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger-text border-[color-mix(in_srgb,var(--danger)_25%,transparent)]",
        neutral: "bg-surface-850 text-text-secondary border-border",
        brand: "bg-brand-tint text-brand-text border-brand-tint-border",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
