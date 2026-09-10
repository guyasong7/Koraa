"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Reproduces globals.css `.btn` and its variants as Tailwind utilities.
 *
 * Two details are carried over deliberately rather than modernised:
 *
 * - Every size keeps `rounded-control`, the shared button/field corner.
 *   A 36px button beside a 44px field on two different radii is exactly
 *   the mismatch that token exists to prevent, so `sm` does not get a
 *   tighter corner. Regions override the corner by re-pointing
 *   `--control-radius` on an ancestor (`.auth-split` makes it a pill).
 * - Hover is `disabled:` guarded, not `hover:` alone. The CSS used
 *   `:hover:not(:disabled)`, so a disabled button must not light up
 *   under the cursor; `disabled:hover:bg-*` restores the base colour.
 *
 * No focus ring here — globals.css styles `:focus-visible` globally, so a
 * ring on the component would double it. Never add one.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-control font-sans text-[0.9375rem] leading-none font-[550] cursor-pointer border border-transparent no-underline select-none whitespace-nowrap transition-[background-color,border-color,color] duration-200 ease-[var(--ease-out)] disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary:
          "bg-brand-solid text-on-brand-solid hover:bg-brand-solid-hover disabled:hover:bg-brand-solid",
        secondary:
          "bg-surface-900 text-text-primary border-border-strong hover:bg-surface-850 hover:border-surface-500 disabled:hover:bg-surface-900 disabled:hover:border-border-strong",
        ghost:
          "bg-transparent text-text-secondary hover:bg-surface-850 hover:text-text-primary disabled:hover:bg-transparent disabled:hover:text-text-secondary",
        danger:
          "bg-transparent text-danger border-[color-mix(in_srgb,var(--danger)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:border-danger disabled:hover:bg-transparent disabled:hover:border-[color-mix(in_srgb,var(--danger)_35%,transparent)]",
      },
      size: {
        sm: "min-h-9 px-3.5 text-sm",
        md: "min-h-[42px] px-[18px]",
        lg: "min-h-[50px] px-[26px] text-base",
      },
      full: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render the child element instead of a `<button>` — for `<Link>` CTAs. */
  asChild?: boolean;
}

function Button({
  className,
  variant,
  size,
  full,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, full }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
