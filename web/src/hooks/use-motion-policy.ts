import { useReducedMotion } from "motion/react";

export type MotionPolicy = "full" | "reduced";

export function useMotionPolicy(): MotionPolicy {
  const prefersReducedMotion = useReducedMotion();
  return prefersReducedMotion ? "reduced" : "full";
}
