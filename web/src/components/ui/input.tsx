import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-base text-[color:var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] transition-colors placeholder:text-[color:var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
        className,
      )}
      {...props}
    />
  );
}
