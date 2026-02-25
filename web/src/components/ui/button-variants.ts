import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-xl)] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        default:
          "bg-[color:var(--primary)] text-[color:var(--primary-foreground)] shadow-[var(--shadow-sm)] hover:bg-[color:var(--brand-700)]",
        secondary:
          "border border-[color:var(--border)] bg-[color:var(--secondary)] text-[color:var(--secondary-foreground)] shadow-[var(--shadow-2xs)] hover:bg-[color:var(--accent)]",
        destructive: "bg-[color:var(--danger)] text-white hover:brightness-95",
        ghost: "border border-[color:var(--border)] bg-transparent text-[color:var(--foreground)] hover:bg-[color:var(--secondary)]",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-[var(--radius-md)] px-3",
        lg: "h-12 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
