import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-11 w-full appearance-none rounded-xl border border-[color:var(--line)] bg-white px-3 pr-10 text-base text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]"
        aria-hidden="true"
      />
    </div>
  );
}
