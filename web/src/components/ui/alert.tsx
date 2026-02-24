import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "rounded-xl border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        default:
          "border-[color:var(--line)] bg-white text-[color:var(--ink)]",
        success:
          "border-[#b7dfc2] bg-[#edf9f1] text-[#16502c]",
        destructive:
          "border-[#f0b8b4] bg-[#fdecea] text-[#812019]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type AlertProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>;

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div className={cn(alertVariants({ variant }), className)} role="alert" {...props} />;
}
