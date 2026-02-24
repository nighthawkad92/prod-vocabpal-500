import { motion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import type { MotionPolicy } from "@/hooks/use-motion-policy";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";
import type { ButtonProps } from "@/components/ui/button";

type MotionButtonProps = Omit<HTMLMotionProps<"button">, "color"> &
  Pick<ButtonProps, "variant" | "size"> & {
    motionPolicy: MotionPolicy;
  };

export function MotionButton({
  className,
  variant,
  size,
  motionPolicy,
  ...props
}: MotionButtonProps) {
  return (
    <motion.button
      whileTap={motionPolicy === "full" ? { scale: 0.98 } : undefined}
      transition={{ duration: 0.12 }}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
