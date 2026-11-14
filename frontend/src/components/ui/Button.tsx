import type { ButtonHTMLAttributes, Ref } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "board";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  loading?: boolean;
  loadingLabel?: string;
  block?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-sign-edge bg-sign text-sign-ink hover:bg-sign-hover",
  secondary: "border-line-strong bg-paper-raised text-ink hover:bg-paper-sunken",
  ghost: "border-transparent bg-transparent text-ink hover:bg-paper-sunken",
  board: "border-board-line bg-flap text-board-ink hover:bg-flap-hi",
};

const SIZE: Record<NonNullable<ButtonProps["size"]>, string> = {
  md: "min-h-11 px-4 py-2 text-base",
  sm: "min-h-8 px-3 py-1 text-sm",
};

/**
 * Action button. Use `primary` for the one main action on paper, `board` on the
 * dark board. While `loading` it is disabled and shows `loadingLabel` if given.
 */
export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  loadingLabel,
  block = false,
  type = "button",
  disabled,
  className,
  children,
  ref,
  ...rest
}: ButtonProps) {
  const classes = [
    "inline-flex items-center justify-center gap-2 rounded-control border font-sans font-medium",
    "disabled:cursor-not-allowed disabled:opacity-60",
    VARIANT[variant],
    SIZE[size],
    block ? "w-full" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? "true" : rest["aria-busy"]}
      className={classes}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}
