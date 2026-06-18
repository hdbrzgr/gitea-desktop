/** Button component with GitHub-inspired variants. */
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[var(--color-success-emphasis)] text-white hover:brightness-110 border border-transparent",
  secondary:
    "bg-[var(--color-surface)] text-[var(--color-fg-default)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)]",
  danger:
    "bg-[var(--color-danger-emphasis)] text-white hover:brightness-110 border border-transparent",
  ghost:
    "bg-transparent text-[var(--color-fg-default)] hover:bg-[var(--color-surface-hover)] border border-transparent",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-8 px-3 text-sm gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", className, children, ...rest }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  ),
);
Button.displayName = "Button";
