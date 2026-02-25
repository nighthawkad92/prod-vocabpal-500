import type { ReactNode } from "react";
import { MotionButton } from "@/components/motion-button";
import type { MotionPolicy } from "@/hooks/use-motion-policy";
import { cn } from "@/lib/utils";

type RadioOptionProps = {
  label: ReactNode;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  motionPolicy?: MotionPolicy;
  variant?: "default" | "tile";
  className?: string;
};

export function RadioOption({
  label,
  selected,
  onSelect,
  disabled = false,
  motionPolicy = "full",
  variant = "default",
  className,
}: RadioOptionProps) {
  const isTile = variant === "tile";

  return (
    <MotionButton
      type="button"
      variant="secondary"
      motionPolicy={motionPolicy}
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      className={cn(
        isTile
          ? "option min-h-[7rem] justify-center px-3 py-3 text-center"
          : "option justify-start gap-3",
        selected
          ? "border-[color:var(--primary)] bg-[color:var(--secondary)]"
          : "bg-white",
        className,
      )}
      onClick={onSelect}
    >
      {!isTile && (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full border border-[color:var(--border)] shadow-[var(--shadow-2xs)]",
            selected ? "bg-[color:var(--secondary)]" : "bg-transparent",
          )}
        >
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full border border-[color:var(--border)]",
              selected ? "bg-[color:var(--primary)]" : "bg-transparent",
            )}
          />
        </span>
      )}
      <span className={cn(isTile ? "text-base font-semibold leading-6" : undefined)}>{label}</span>
    </MotionButton>
  );
}
