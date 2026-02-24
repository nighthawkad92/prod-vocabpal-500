import type {
  ComponentCatalogItem,
  DesignToken,
  SfxCatalogItem,
} from "@/features/design-system/types";
import { SFX_CONFIG, type SfxEvent } from "@/lib/sfx";

const COLOR_VARIABLES: Array<{ name: string; fallback: string; description?: string }> = [
  { name: "--bg-a", fallback: "#fff8ea", description: "Warm gradient anchor" },
  { name: "--bg-b", fallback: "#edf7ff", description: "Cool gradient anchor" },
  { name: "--ink", fallback: "#182538", description: "Primary text color" },
  { name: "--muted", fallback: "#5b6f82", description: "Secondary text color" },
  { name: "--line", fallback: "#c9d9e5", description: "Border and divider color" },
  { name: "--surface", fallback: "#fefeffd9", description: "Card surface color" },
  { name: "--surface-2", fallback: "#f3f7fb", description: "Muted surface color" },
  { name: "--brand-600", fallback: "#0f7f94", description: "Primary action color" },
  { name: "--brand-700", fallback: "#0a6374", description: "Primary hover color" },
  { name: "--accent", fallback: "#eab63f", description: "Accent highlight" },
  { name: "--danger", fallback: "#b8453f", description: "Destructive state color" },
  { name: "--ring", fallback: "#6ca2ff", description: "Focus ring color" },
];

const SPACING_TOKENS: DesignToken[] = [
  { name: "space-2", value: "0.5rem", category: "spacing" },
  { name: "space-3", value: "0.75rem", category: "spacing" },
  { name: "space-4", value: "1rem", category: "spacing" },
  { name: "space-5", value: "1.25rem", category: "spacing" },
  { name: "space-6", value: "1.5rem", category: "spacing" },
  { name: "space-8", value: "2rem", category: "spacing" },
];

const RADIUS_TOKENS: DesignToken[] = [
  { name: "radius-sm", value: "0.5rem", category: "radius" },
  { name: "radius-md", value: "0.75rem", category: "radius" },
  { name: "radius-lg", value: "1rem", category: "radius" },
  { name: "radius-xl", value: "1.5rem", category: "radius" },
  { name: "radius-2xl", value: "2rem", category: "radius" },
];

const SHADOW_TOKENS: DesignToken[] = [
  {
    name: "card-shadow",
    value: "0 16px 36px rgba(9,34,58,0.1)",
    category: "shadow",
  },
  {
    name: "surface-shadow",
    value: "0 10px 24px rgba(13,44,74,0.08)",
    category: "shadow",
  },
];

const MOTION_TOKENS: DesignToken[] = [
  { name: "duration-fast", value: "120ms", category: "motion" },
  { name: "duration-base", value: "180ms", category: "motion" },
  { name: "duration-enter", value: "260ms", category: "motion" },
  { name: "tap-scale", value: "0.98", category: "motion" },
];

const COMPONENT_CATALOG: ComponentCatalogItem[] = [
  {
    id: "button",
    name: "Button",
    description: "Primary action control with semantic variants and sizes.",
    variants: ["default", "secondary", "destructive", "ghost"],
    states: ["default", "disabled"],
  },
  {
    id: "input",
    name: "Input",
    description: "Single-line text entry field for names and short answers.",
    variants: ["default"],
    states: ["default", "focused", "disabled"],
  },
  {
    id: "textarea",
    name: "Textarea",
    description: "Multi-line text input for notes and longer prompts.",
    variants: ["default"],
    states: ["default", "disabled"],
  },
  {
    id: "select",
    name: "Select",
    description: "Native select wrapper with chevron and focus ring.",
    variants: ["default"],
    states: ["default", "disabled"],
  },
  {
    id: "card",
    name: "Card",
    description: "Primary content surface used across student and teacher sections.",
    variants: ["default", "gradient surface"],
    states: ["default"],
  },
  {
    id: "badge",
    name: "Badge",
    description: "Compact status label for metadata and summaries.",
    variants: ["default"],
    states: ["default"],
  },
  {
    id: "alert",
    name: "Alert",
    description: "Inline message surface for notices and errors.",
    variants: ["default", "success", "destructive"],
    states: ["default"],
  },
  {
    id: "progress",
    name: "Progress",
    description: "Linear progress indicator for stage/question completion.",
    variants: ["default"],
    states: ["0-100 value"],
  },
  {
    id: "separator",
    name: "Separator",
    description: "Visual divider between related content clusters.",
    variants: ["default"],
    states: ["default"],
  },
  {
    id: "switch",
    name: "Switch",
    description: "Binary state toggle used for global sound preferences.",
    variants: ["default"],
    states: ["on", "off", "disabled"],
  },
  {
    id: "tabs",
    name: "Tabs",
    description: "Segmented control for mode and section switching.",
    variants: ["pill"],
    states: ["active", "inactive"],
  },
  {
    id: "motion-button",
    name: "MotionButton",
    description: "Button variant with low-impact tap-scale animation.",
    variants: ["default", "secondary", "destructive", "ghost"],
    states: ["full motion", "reduced motion"],
  },
];

function readCssVariable(name: string, fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function getDesignTokens(): DesignToken[] {
  const colorTokens: DesignToken[] = COLOR_VARIABLES.map((variable) => ({
    name: variable.name,
    value: readCssVariable(variable.name, variable.fallback),
    category: "color",
    description: variable.description,
  }));

  return [
    ...colorTokens,
    ...SPACING_TOKENS,
    ...RADIUS_TOKENS,
    ...SHADOW_TOKENS,
    ...MOTION_TOKENS,
  ];
}

export function groupDesignTokens(tokens: DesignToken[]): Record<DesignToken["category"], DesignToken[]> {
  return {
    color: tokens.filter((token) => token.category === "color"),
    spacing: tokens.filter((token) => token.category === "spacing"),
    radius: tokens.filter((token) => token.category === "radius"),
    shadow: tokens.filter((token) => token.category === "shadow"),
    motion: tokens.filter((token) => token.category === "motion"),
  };
}

export function getComponentCatalog(): ComponentCatalogItem[] {
  return COMPONENT_CATALOG;
}

export function getSfxCatalog(): SfxCatalogItem[] {
  return (Object.keys(SFX_CONFIG) as SfxEvent[]).map((event) => ({
    event,
    volume: SFX_CONFIG[event].volume,
    cooldownMs: SFX_CONFIG[event].cooldownMs,
  }));
}
