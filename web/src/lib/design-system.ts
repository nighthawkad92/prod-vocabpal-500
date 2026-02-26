import type {
  ComponentCatalogItem,
  DesignToken,
  SfxCatalogItem,
} from "@/features/design-system/types";
import { SFX_CONFIG, type SfxEvent } from "@/lib/sfx";

const COLOR_VARIABLES: Array<{ name: string; fallback: string; description?: string }> = [
  { name: "--bg-a", fallback: "oklch(0.967 0.067 122.328)", description: "Warm lime gradient anchor" },
  { name: "--bg-b", fallback: "oklch(0.959 0.046 146.81)", description: "Cool lime gradient anchor" },
  { name: "--ink", fallback: "oklch(0.274 0.072 132.109)", description: "Primary text color" },
  { name: "--muted", fallback: "oklch(0.274 0.072 132.109)", description: "Secondary text color (aligned with primary ink)" },
  { name: "--line", fallback: "oklch(0.872 0.031 128.981)", description: "Border and divider color" },
  { name: "--surface", fallback: "oklch(0.99 0.011 120.757 / 0.9)", description: "Card surface color" },
  { name: "--surface-2", fallback: "oklch(0.967 0.067 122.328 / 0.58)", description: "Muted surface color" },
  { name: "--brand-600", fallback: "oklch(0.79 0.233 130.85)", description: "Primary action color" },
  { name: "--brand-700", fallback: "oklch(0.72 0.205 130.85)", description: "Primary hover color" },
  { name: "--accent", fallback: "oklch(0.95 0.03 120.757)", description: "Accent highlight" },
  { name: "--danger", fallback: "#b8453f", description: "Destructive state color" },
  { name: "--ring", fallback: "oklch(0.79 0.233 130.85)", description: "Focus ring color" },
];

const SPACING_TOKENS: DesignToken[] = [
  { name: "space-2", value: "0.5rem", category: "spacing" },
  { name: "space-3", value: "0.75rem", category: "spacing" },
  { name: "space-4", value: "1rem", category: "spacing" },
  { name: "space-5", value: "1.25rem", category: "spacing" },
  { name: "space-6", value: "1.5rem", category: "spacing" },
  { name: "space-8", value: "2rem", category: "spacing" },
];

const RADIUS_VARIABLES: Array<{ name: string; cssVar: string; fallback: string }> = [
  { name: "radius-sm", cssVar: "--radius-sm", fallback: "0.375rem" },
  { name: "radius-md", cssVar: "--radius-md", fallback: "0.5rem" },
  { name: "radius-lg", cssVar: "--radius-lg", fallback: "0.625rem" },
  { name: "radius-xl", cssVar: "--radius-xl", fallback: "0.875rem" },
  { name: "radius-2xl", cssVar: "--radius-2xl", fallback: "1.125rem" },
  { name: "radius-3xl", cssVar: "--radius-3xl", fallback: "1.375rem" },
  { name: "radius-4xl", cssVar: "--radius-4xl", fallback: "1.625rem" },
];

const SHADOW_VARIABLES: Array<{ name: string; cssVar: string; fallback: string }> = [
  { name: "shadow-2xs", cssVar: "--shadow-2xs", fallback: "0 1px 2px rgba(0,0,0,0.14)" },
  { name: "shadow-sm", cssVar: "--shadow-sm", fallback: "0 4px 10px rgba(0,0,0,0.16)" },
  { name: "shadow-md", cssVar: "--shadow-md", fallback: "0 10px 20px rgba(0,0,0,0.2)" },
  { name: "shadow-lg", cssVar: "--shadow-lg", fallback: "0 16px 32px rgba(0,0,0,0.22)" },
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
    id: "radio-option",
    name: "RadioOption",
    description: "Answer-option control used by student MCQ questions and design-system demos.",
    variants: ["default", "tile", "selected", "unselected"],
    states: ["selected", "unselected", "disabled"],
  },
  {
    id: "motion-button",
    name: "MotionButton",
    description: "Button variant with low-impact tap-scale animation.",
    variants: ["default", "secondary", "destructive", "ghost"],
    states: ["full motion", "reduced motion"],
  },
  {
    id: "ai-filter-controls",
    name: "AiFilterControls",
    description: "Class multi-select and timeframe controls used to auto-generate AI sections.",
    variants: ["desktop-inline", "mobile-bottom-sheet"],
    states: ["default", "loading"],
  },
  {
    id: "insight-block",
    name: "InsightSection",
    description: "Structured AI subsection surface for summary and key insights.",
    variants: ["class-snapshot", "support-priority", "slow-questions"],
    states: ["default", "updating", "error"],
  },
  {
    id: "ai-chart-card",
    name: "AiChartCard",
    description: "Lightweight teacher AI chart renderer (bar, stacked, donut, trend line).",
    variants: ["bar", "stacked_bar", "donut", "trend_line"],
    states: ["data", "empty"],
  },
  {
    id: "ai-source-metrics-table",
    name: "AiSourceMetricsTable",
    description: "Structured list/table surface for evidence rows and source metrics.",
    variants: ["rows", "metrics"],
    states: ["with data", "empty"],
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

  const radiusTokens: DesignToken[] = RADIUS_VARIABLES.map((token) => ({
    name: token.name,
    value: readCssVariable(token.cssVar, token.fallback),
    category: "radius",
  }));

  const shadowTokens: DesignToken[] = SHADOW_VARIABLES.map((token) => ({
    name: token.name,
    value: readCssVariable(token.cssVar, token.fallback),
    category: "shadow",
  }));

  return [
    ...colorTokens,
    ...SPACING_TOKENS,
    ...radiusTokens,
    ...shadowTokens,
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
