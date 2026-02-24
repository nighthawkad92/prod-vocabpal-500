import type { SfxEvent } from "@/lib/sfx";

export type DesignTokenCategory =
  | "color"
  | "spacing"
  | "radius"
  | "shadow"
  | "motion";

export type DesignToken = {
  name: string;
  value: string;
  category: DesignTokenCategory;
  description?: string;
};

export type ComponentCatalogItem = {
  id: string;
  name: string;
  description: string;
  variants: string[];
  states: string[];
};

export type PlaygroundControlKind = "select" | "toggle" | "text" | "number";

export type PlaygroundControl = {
  id: string;
  label: string;
  kind: PlaygroundControlKind;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
};

export type SfxCatalogItem = {
  event: SfxEvent;
  volume: number;
  cooldownMs: number;
};
