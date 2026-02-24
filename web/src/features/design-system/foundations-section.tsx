import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { groupDesignTokens } from "@/lib/design-system";
import type { DesignToken } from "@/features/design-system/types";

type FoundationsSectionProps = {
  tokens: DesignToken[];
};

export function FoundationsSection({ tokens }: FoundationsSectionProps) {
  const grouped = groupDesignTokens(tokens);

  return (
    <section className="space-y-4" aria-labelledby="foundations-heading">
      <div className="space-y-1">
        <h2 id="foundations-heading" className="font-['Fraunces',serif] text-3xl text-[color:var(--ink)]">
          Foundations
        </h2>
        <p className="text-sm text-[color:var(--muted)]">
          Runtime token values pulled from the active CSS system.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Color Tokens</CardTitle>
          <CardDescription>Source of truth from CSS variables in `:root`.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {grouped.color.map((token) => (
            <div key={token.name} className="ds-token-row">
              <div className="ds-swatch" style={{ backgroundColor: token.value }} />
              <div>
                <div className="ds-token-name">{token.name}</div>
                <div className="ds-token-value">{token.value}</div>
                {token.description ? (
                  <p className="mt-1 text-xs text-[color:var(--muted)]">{token.description}</p>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Typography</CardTitle>
            <CardDescription>Current type pairs in use across app surfaces.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 rounded-2xl border border-[color:var(--line)] bg-white p-4">
              <p className="font-['Fraunces',serif] text-4xl leading-tight">Fraunces Display</p>
              <p className="text-sm text-[color:var(--muted)]">Used for major headings and hero titles.</p>
            </div>
            <div className="space-y-2 rounded-2xl border border-[color:var(--line)] bg-white p-4">
              <p className="text-xl font-semibold">Plus Jakarta Sans</p>
              <p className="text-sm text-[color:var(--muted)]">
                Used for body copy, labels, controls, and dashboard text.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Spacing + Radius + Shadow</CardTitle>
            <CardDescription>Scale samples used in cards, forms, and controls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--muted)]">Spacing</p>
              <div className="space-y-2">
                {grouped.spacing.map((token) => (
                  <div key={token.name} className="flex items-center gap-2">
                    <span className="w-20 text-xs text-[color:var(--muted)]">{token.name}</span>
                    <span
                      className="h-3 rounded-full bg-[color:var(--brand-600)]/80"
                      style={{ width: `calc(${token.value} * 3)` }}
                    />
                    <span className="text-xs text-[color:var(--ink)]">{token.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--muted)]">Radius</p>
              <div className="flex flex-wrap gap-2">
                {grouped.radius.map((token) => (
                  <div key={token.name} className="space-y-1 text-center">
                    <div
                      className="h-11 w-16 border border-[color:var(--line)] bg-white"
                      style={{ borderRadius: token.value }}
                    />
                    <div className="text-[11px] text-[color:var(--muted)]">{token.name}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--muted)]">Shadow</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {grouped.shadow.map((token) => (
                  <div key={token.name} className="space-y-1 rounded-xl border border-[color:var(--line)] p-2">
                    <div
                      className="h-12 rounded-lg bg-white"
                      style={{ boxShadow: token.value }}
                    />
                    <div className="text-[11px] text-[color:var(--muted)]">{token.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
