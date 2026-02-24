import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { PlaygroundControl } from "@/features/design-system/types";

type PlaygroundValues = Record<string, string | number | boolean>;

type PlaygroundControlsProps = {
  controls: PlaygroundControl[];
  values: PlaygroundValues;
  onChange: (id: string, value: string | number | boolean) => void;
};

export function PlaygroundControls({
  controls,
  values,
  onChange,
}: PlaygroundControlsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {controls.map((control) => {
        const value = values[control.id];
        const fieldId = `playground-${control.id}`;

        if (control.kind === "toggle") {
          return (
            <div
              key={control.id}
              className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2"
            >
              <div className="flex items-center justify-between">
                <Label htmlFor={fieldId}>{control.label}</Label>
                <Switch
                  id={fieldId}
                  checked={Boolean(value)}
                  onCheckedChange={(checked) => onChange(control.id, checked)}
                />
              </div>
            </div>
          );
        }

        if (control.kind === "select") {
          return (
            <label key={control.id} className="space-y-1">
              <Label htmlFor={fieldId}>{control.label}</Label>
              <Select
                id={fieldId}
                value={String(value ?? "")}
                onChange={(event) => onChange(control.id, event.target.value)}
              >
                {(control.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </label>
          );
        }

        if (control.kind === "number") {
          return (
            <label key={control.id} className="space-y-1">
              <Label htmlFor={fieldId}>{control.label}</Label>
              <Input
                id={fieldId}
                type="number"
                value={String(value ?? 0)}
                min={control.min}
                max={control.max}
                step={control.step ?? 1}
                onChange={(event) => onChange(control.id, Number(event.target.value))}
              />
            </label>
          );
        }

        return (
          <label key={control.id} className="space-y-1">
            <Label htmlFor={fieldId}>{control.label}</Label>
            <Input
              id={fieldId}
              value={String(value ?? "")}
              onChange={(event) => onChange(control.id, event.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}
