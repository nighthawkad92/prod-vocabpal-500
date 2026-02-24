import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ProgressProps = HTMLAttributes<HTMLDivElement> & {
  value: number;
};

export function Progress({ value, className, ...props }: ProgressProps) {
  const bounded = Math.max(0, Math.min(value, 100));

  return (
    <div
      className={cn(
        "relative h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--line)]",
        className,
      )}
      {...props}
    >
      <div
        className="h-full rounded-full bg-[color:var(--brand-600)] transition-[width] duration-300 ease-out"
        style={{ width: `${bounded}%` }}
      />
    </div>
  );
}
