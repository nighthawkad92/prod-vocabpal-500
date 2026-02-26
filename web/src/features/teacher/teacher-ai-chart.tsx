import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TeacherAiChartSpec } from "@/features/shared/types";

type TeacherAiChartProps = {
  chart: TeacherAiChartSpec;
};

const PALETTE = [
  "bg-[color:var(--brand-600)]",
  "bg-[color:var(--brand-700)]",
  "bg-[color:var(--accent)]",
  "bg-[color:var(--line)]",
];

const PALETTE_HEX = ["#78d700", "#5fb300", "#d9f2b6", "#a8d58a"];

function formatChartValue(value: number, unit: TeacherAiChartSpec["yUnit"]): string {
  if (unit === "percent") return `${value}%`;
  if (unit === "seconds") return `${value}s`;
  if (unit === "score") return `${value}/10`;
  return `${value}`;
}

function toPolarX(centerX: number, radius: number, angle: number): number {
  return centerX + radius * Math.cos(angle);
}

function toPolarY(centerY: number, radius: number, angle: number): number {
  return centerY + radius * Math.sin(angle);
}

function donutPath(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const startX = toPolarX(centerX, radius, startAngle);
  const startY = toPolarY(centerY, radius, startAngle);
  const endX = toPolarX(centerX, radius, endAngle);
  const endY = toPolarY(centerY, radius, endAngle);
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

  return `M ${centerX} ${centerY} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;
}

function BarChart({ chart }: TeacherAiChartProps) {
  const series = chart.series[0];
  if (!series) {
    return <p className="text-sm text-[color:var(--muted)]">No bar-series data.</p>;
  }

  const maxValue = Math.max(...series.data, 1);
  return (
    <div className="space-y-2">
      {chart.labels.map((label, index) => {
        const value = series.data[index] ?? 0;
        const width = Math.max(4, (value / maxValue) * 100);
        return (
          <div key={`${label}-${index}`} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold">
              <span className="text-[color:var(--ink)]">{label}</span>
              <span className="text-[color:var(--muted)]">{formatChartValue(value, chart.yUnit)}</span>
            </div>
            <div className="h-2 rounded-full bg-[color:var(--surface-2)]">
              <div
                className="h-full rounded-full bg-[color:var(--brand-600)]"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StackedBarChart({ chart }: TeacherAiChartProps) {
  const maxTotal = Math.max(
    ...chart.labels.map((_, labelIndex) =>
      chart.series.reduce((sum, series) => sum + (series.data[labelIndex] ?? 0), 0)
    ),
    1,
  );

  return (
    <div className="space-y-3">
      {chart.labels.map((label, labelIndex) => {
        const total = chart.series.reduce((sum, series) => sum + (series.data[labelIndex] ?? 0), 0);
        return (
          <div key={`${label}-${labelIndex}`} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold">
              <span>{label}</span>
              <span className="text-[color:var(--muted)]">{formatChartValue(total, chart.yUnit)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[color:var(--surface-2)]">
              <div className="flex h-full items-stretch">
                {chart.series.map((series, seriesIndex) => {
                  const value = series.data[labelIndex] ?? 0;
                  const width = total <= 0 ? 0 : (value / maxTotal) * 100;
                  return (
                    <div
                      key={`${series.label}-${seriesIndex}-${labelIndex}`}
                      className={PALETTE[seriesIndex % PALETTE.length]}
                      style={{ width: `${width}%` }}
                      title={`${series.label}: ${formatChartValue(value, chart.yUnit)}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        {chart.series.map((series, index) => (
          <div key={`${series.label}-${index}`} className="inline-flex items-center gap-1 rounded-full border border-[color:var(--line)] bg-white px-2 py-1">
            <span className={`h-2 w-2 rounded-full ${PALETTE[index % PALETTE.length]}`} />
            <span>{series.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutChart({ chart }: TeacherAiChartProps) {
  const series = chart.series[0];
  if (!series) {
    return <p className="text-sm text-[color:var(--muted)]">No donut-series data.</p>;
  }

  const values = chart.labels.map((_, index) => series.data[index] ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return <p className="text-sm text-[color:var(--muted)]">No donut-series data.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
      <svg viewBox="0 0 128 128" className="h-32 w-32">
        <circle cx="64" cy="64" r="55" fill="#eef4e5" />
        {values.map((value, index) => {
          const priorTotal = values.slice(0, index).reduce((sum, item) => sum + item, 0);
          const start = -Math.PI / 2 + (priorTotal / total) * Math.PI * 2;
          const sweep = (value / total) * Math.PI * 2;
          const end = start + sweep;
          return (
            <path
              key={`${chart.labels[index]}-${index}`}
              d={donutPath(64, 64, 54, start, end)}
              fill={PALETTE_HEX[index % PALETTE_HEX.length]}
            />
          );
        })}
        <circle cx="64" cy="64" r="28" fill="white" />
        <text x="64" y="62" textAnchor="middle" className="fill-[color:var(--ink)] text-[10px] font-semibold">
          Total
        </text>
        <text x="64" y="76" textAnchor="middle" className="fill-[color:var(--ink)] text-[14px] font-semibold">
          {Math.round(total)}
        </text>
      </svg>
      <div className="space-y-2">
        {chart.labels.map((label, index) => {
          const value = values[index] ?? 0;
          const percent = ((value / total) * 100).toFixed(1);
          return (
            <div key={`${label}-${index}`} className="flex items-center justify-between gap-2 text-xs font-semibold">
              <div className="inline-flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: PALETTE_HEX[index % PALETTE_HEX.length] }}
                />
                <span>{label}</span>
              </div>
              <span className="text-[color:var(--muted)]">{percent}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendLineChart({ chart }: TeacherAiChartProps) {
  const series = chart.series[0];
  if (!series) {
    return <p className="text-sm text-[color:var(--muted)]">No trend data.</p>;
  }

  const width = 360;
  const height = 140;
  const padX = 20;
  const padY = 14;
  const values = series.data;
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = Math.max(maxValue - minValue, 1);

  const points = values.map((value, index) => {
    const x = padX + (index * (width - padX * 2)) / Math.max(values.length - 1, 1);
    const y = height - padY - ((value - minValue) / range) * (height - padY * 2);
    return { x, y, value, index };
  });

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full rounded-[var(--radius-lg)] bg-white">
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#bddc91" strokeWidth="1" />
        <polyline
          points={polyline}
          fill="none"
          stroke="#78d700"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point) => (
          <circle key={`${point.index}-${point.value}`} cx={point.x} cy={point.y} r="2.8" fill="#5fb300" />
        ))}
      </svg>
      <div className="grid grid-cols-5 gap-1 text-[11px] text-[color:var(--muted)]">
        {chart.labels.slice(0, 5).map((label) => (
          <span key={label} className="truncate">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function TeacherAiChart({ chart }: TeacherAiChartProps) {
  return (
    <Card className="bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{chart.title || "Insight chart"}</CardTitle>
      </CardHeader>
      <CardContent>
        {chart.type === "bar" ? <BarChart chart={chart} /> : null}
        {chart.type === "stacked_bar" ? <StackedBarChart chart={chart} /> : null}
        {chart.type === "donut" ? <DonutChart chart={chart} /> : null}
        {chart.type === "trend_line" ? <TrendLineChart chart={chart} /> : null}
      </CardContent>
    </Card>
  );
}
