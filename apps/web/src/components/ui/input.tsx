"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Reproduces globals.css `.input`.
 *
 * `outline-none` is kept here, unlike in Button. `.input:focus` paints its
 * own affordance — a 3px brand-tinted box-shadow plus a border colour
 * change — so suppressing the UA outline costs no visible focus state.
 * Dropping `outline-none` would stack the global `:focus-visible` outline
 * on top of that shadow and give fields a double ring.
 *
 * Hover uses an arbitrary variant rather than stacked Tailwind ones so it
 * compiles to the original selector exactly: a field that is focused or
 * disabled must not take the hover border, or the hover grey would fight
 * the brand focus border on the way in.
 */
const inputVariants = cva(
  "w-full min-h-11 rounded-control border bg-surface-900 px-[13px] py-[11px] font-sans text-base leading-normal text-text-primary outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-text-disabled [&:hover:not(:disabled):not(:focus)]:border-surface-500 disabled:cursor-not-allowed disabled:bg-surface-850 disabled:text-text-muted",
  {
    variants: {
      state: {
        default:
          "border-border-strong focus:border-brand-solid focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand-solid)_18%,transparent)]",
        // The CSS used !important to beat `.input:focus`; the `!` suffix is
        // the same thing, and is what keeps a field red while focused.
        error:
          "border-danger! shadow-[0_0_0_3px_color-mix(in_srgb,var(--danger)_15%,transparent)]!",
      },
    },
    defaultVariants: {
      state: "default",
    },
  },
);

export interface InputProps
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {}

function Input({ className, state, type, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ state }), className)}
      {...props}
    />
  );
}

/** `select.input` in the CSS — same field, pointer cursor. */
function Select({
  className,
  state,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> &
  VariantProps<typeof inputVariants>) {
  return (
    <select
      data-slot="select"
      className={cn(inputVariants({ state }), "cursor-pointer", className)}
      {...props}
    />
  );
}

function Textarea({
  className,
  state,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> &
  VariantProps<typeof inputVariants>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(inputVariants({ state }), className)}
      {...props}
    />
  );
}

/** `.input-group` — the label/field/hint stack. */
function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

/** `.input-hint` */
function InputHint({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="input-hint"
      className={cn("text-sm leading-normal text-text-muted", className)}
      {...props}
    />
  );
}

/** `.error-text` */
function ErrorText({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="error-text"
      className={cn(
        "flex items-center gap-[5px] text-sm text-danger",
        className,
      )}
      {...props}
    />
  );
}

export {
  Input,
  Select,
  Textarea,
  InputGroup,
  InputHint,
  ErrorText,
  inputVariants,
};
