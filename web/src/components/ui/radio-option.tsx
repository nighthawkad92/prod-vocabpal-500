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
  className?: string;
};

export function RadioOption({
  label,
  selected,
  onSelect,
  disabled = false,
  motionPolicy = "full",
  className,
}: RadioOptionProps) {
  return (
    <MotionButton
      type="button"
      variant="secondary"
      motionPolicy={motionPolicy}
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      className={cn(
        "option justify-start gap-3",
        selected
          ? "border-[color:var(--primary)] bg-[color:var(--secondary)]"
          : "bg-transparent",
        className,
      )}
      onClick={onSelect}
    >
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
      <span>{label}</span>
    </MotionButton>
  );
}
