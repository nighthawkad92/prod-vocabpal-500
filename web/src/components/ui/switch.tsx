import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function Switch({
  checked,
  onCheckedChange,
  className,
  ...props
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn(
        "relative inline-flex h-7 w-12 items-center rounded-full border border-[color:var(--line)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
        checked ? "bg-[color:var(--brand-600)]" : "bg-[#d6e2ea]",
        className,
      )}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
