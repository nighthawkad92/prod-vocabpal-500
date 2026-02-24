import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        default:
          "bg-[color:var(--brand-600)] text-white shadow-sm hover:bg-[color:var(--brand-700)]",
        secondary:
          "border border-[color:var(--line)] bg-white text-[color:var(--ink)] hover:bg-[color:var(--surface-2)]",
        destructive: "bg-[color:var(--danger)] text-white hover:brightness-95",
        ghost: "text-[color:var(--ink)] hover:bg-[color:var(--surface-2)]",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
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
