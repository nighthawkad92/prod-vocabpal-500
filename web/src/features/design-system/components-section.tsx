import { useMemo, useState } from "react";
import { MotionButton } from "@/components/motion-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioOption } from "@/components/ui/radio-option";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PlaygroundControls } from "@/features/design-system/playground-controls";
import type {
  ComponentCatalogItem,
  PlaygroundControl,
} from "@/features/design-system/types";
import type { MotionPolicy } from "@/hooks/use-motion-policy";

type ComponentsSectionProps = {
  catalog: ComponentCatalogItem[];
  defaultMotionPolicy: MotionPolicy;
};

export function ComponentsSection({
  catalog,
  defaultMotionPolicy,
}: ComponentsSectionProps) {
  const [tab, setTab] = useState("button");
  const [playground, setPlayground] = useState<Record<string, string | number | boolean>>({
    buttonVariant: "default",
    buttonSize: "default",
    buttonDisabled: false,
    buttonLabel: "Tap Me",
    inputValue: "Class A",
    inputDisabled: false,
    textareaValue: "Type your sentence here...",
    textareaDisabled: false,
    selectValue: "Class A",
    selectDisabled: false,
    alertVariant: "default",
    progressValue: 45,
    switchChecked: true,
    switchDisabled: false,
    tabsValue: "student",
    radioSelected: "option-a",
    radioDisabled: false,
    radioVariant: "default",
    radioOptionA: "sand",
    radioOptionB: "cat",
    motionPolicy: defaultMotionPolicy,
  });

  const update = (id: string, value: string | number | boolean) => {
    setPlayground((current) => ({ ...current, [id]: value }));
  };

  const controlsByTab = useMemo<Record<string, PlaygroundControl[]>>(
    () => ({
      button: [
        {
          id: "buttonVariant",
          label: "Variant",
          kind: "select",
          options: ["default", "secondary", "destructive", "ghost"],
        },
        {
          id: "buttonSize",
          label: "Size",
          kind: "select",
          options: ["default", "sm", "lg", "icon"],
        },
        { id: "buttonDisabled", label: "Disabled", kind: "toggle" },
        { id: "buttonLabel", label: "Text", kind: "text" },
      ],
      input: [
        { id: "inputValue", label: "Value", kind: "text" },
        { id: "inputDisabled", label: "Disabled", kind: "toggle" },
      ],
      textarea: [
        { id: "textareaValue", label: "Value", kind: "text" },
        { id: "textareaDisabled", label: "Disabled", kind: "toggle" },
      ],
      select: [
        {
          id: "selectValue",
          label: "Selected",
          kind: "select",
          options: ["Class A", "Class B", "Class C"],
        },
        { id: "selectDisabled", label: "Disabled", kind: "toggle" },
      ],
      alert: [
        {
          id: "alertVariant",
          label: "Variant",
          kind: "select",
          options: ["default", "success", "destructive"],
        },
      ],
      progress: [
        {
          id: "progressValue",
          label: "Progress %",
          kind: "number",
          min: 0,
          max: 100,
        },
      ],
      switch: [
        { id: "switchChecked", label: "Checked", kind: "toggle" },
        { id: "switchDisabled", label: "Disabled", kind: "toggle" },
      ],
      tabs: [
        {
          id: "tabsValue",
          label: "Active Tab",
          kind: "select",
          options: ["student", "teacher"],
        },
      ],
      radio: [
        {
          id: "radioVariant",
          label: "Variant",
          kind: "select",
          options: ["default", "tile"],
        },
        {
          id: "radioSelected",
          label: "Selected Option",
          kind: "select",
          options: ["option-a", "option-b", "none"],
        },
        { id: "radioDisabled", label: "Disabled", kind: "toggle" },
        { id: "radioOptionA", label: "Option A Text", kind: "text" },
        { id: "radioOptionB", label: "Option B Text", kind: "text" },
      ],
      motion: [
        {
          id: "motionPolicy",
          label: "Motion Policy",
          kind: "select",
          options: ["full", "reduced"],
        },
        {
          id: "buttonVariant",
          label: "Variant",
          kind: "select",
          options: ["default", "secondary", "destructive", "ghost"],
        },
      ],
    }),
    [],
  );

  const buttonVariant = String(playground.buttonVariant) as
    | "default"
    | "secondary"
    | "destructive"
    | "ghost";
  const buttonSize = String(playground.buttonSize) as "default" | "sm" | "lg" | "icon";
  const motionPolicy = String(playground.motionPolicy) as MotionPolicy;
  const alertVariant = String(playground.alertVariant) as "default" | "success" | "destructive";
  const progressValue = Math.max(0, Math.min(100, Number(playground.progressValue ?? 0)));
  const radioSelected = String(playground.radioSelected);
  const radioVariant = String(playground.radioVariant) as "default" | "tile";
  const radioOptionA = String(playground.radioOptionA || "sand");
  const radioOptionB = String(playground.radioOptionB || "cat");
  const selectedRadioLabel =
    radioSelected === "option-a"
      ? radioOptionA
      : radioSelected === "option-b"
        ? radioOptionB
        : "(none)";

  return (
    <section className="space-y-4" aria-labelledby="components-heading">
      <div className="space-y-1">
        <h2 id="components-heading" className="font-['Fraunces',serif] text-3xl text-[color:var(--ink)]">
          Components
        </h2>
        <p className="text-sm text-[color:var(--muted)]">
          Implemented primitive inventory and live prop/state playground.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Catalog</CardTitle>
          <CardDescription>Current primitives used in production screens.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {catalog.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[color:var(--line)] bg-white p-3">
              <p className="text-sm font-bold text-[color:var(--ink)]">{item.name}</p>
              <p className="mt-1 text-xs text-[color:var(--muted)]">{item.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {item.variants.map((variant) => (
                  <Badge key={`${item.id}-${variant}`}>{variant}</Badge>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-[color:var(--muted)]">
                States: {item.states.join(", ")}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Playground</CardTitle>
          <CardDescription>
            Change controls to inspect real component output and states.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="button">Button</TabsTrigger>
              <TabsTrigger value="input">Input</TabsTrigger>
              <TabsTrigger value="textarea">Textarea</TabsTrigger>
              <TabsTrigger value="select">Select</TabsTrigger>
              <TabsTrigger value="alert">Alert</TabsTrigger>
              <TabsTrigger value="progress">Progress</TabsTrigger>
              <TabsTrigger value="switch">Switch</TabsTrigger>
              <TabsTrigger value="tabs">Tabs</TabsTrigger>
              <TabsTrigger value="radio">Radio Option</TabsTrigger>
              <TabsTrigger value="motion">MotionButton</TabsTrigger>
            </TabsList>

            <TabsContent value="button">
              <PlaygroundControls controls={controlsByTab.button} values={playground} onChange={update} />
              <div className="ds-preview-panel">
                <Button
                  variant={buttonVariant}
                  size={buttonSize}
                  disabled={Boolean(playground.buttonDisabled)}
                >
                  {String(playground.buttonLabel || "Tap Me")}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="input">
              <PlaygroundControls controls={controlsByTab.input} values={playground} onChange={update} />
              <div className="ds-preview-panel max-w-md">
                <Label htmlFor="ds-playground-input">Class Name</Label>
                <Input
                  id="ds-playground-input"
                  value={String(playground.inputValue)}
                  disabled={Boolean(playground.inputDisabled)}
                  onChange={(event) => update("inputValue", event.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="textarea">
              <PlaygroundControls controls={controlsByTab.textarea} values={playground} onChange={update} />
              <div className="ds-preview-panel max-w-md">
                <Label htmlFor="ds-playground-textarea">Sentence Response</Label>
                <Textarea
                  id="ds-playground-textarea"
                  value={String(playground.textareaValue)}
                  disabled={Boolean(playground.textareaDisabled)}
                  onChange={(event) => update("textareaValue", event.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="select">
              <PlaygroundControls controls={controlsByTab.select} values={playground} onChange={update} />
              <div className="ds-preview-panel max-w-md">
                <Label htmlFor="ds-playground-select">Class</Label>
                <Select
                  id="ds-playground-select"
                  value={String(playground.selectValue)}
                  disabled={Boolean(playground.selectDisabled)}
                  onChange={(event) => update("selectValue", event.target.value)}
                >
                  <option value="Class A">Class A</option>
                  <option value="Class B">Class B</option>
                  <option value="Class C">Class C</option>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="alert">
              <PlaygroundControls controls={controlsByTab.alert} values={playground} onChange={update} />
              <div className="ds-preview-panel">
                <Alert variant={alertVariant}>
                  {alertVariant === "success"
                    ? "Data stored successfully."
                    : alertVariant === "destructive"
                      ? "Request failed. Try again."
                      : "Teacher dashboard is in read mode."}
                </Alert>
              </div>
            </TabsContent>

            <TabsContent value="progress">
              <PlaygroundControls controls={controlsByTab.progress} values={playground} onChange={update} />
              <div className="ds-preview-panel max-w-md space-y-2">
                <Progress value={progressValue} />
                <p className="text-xs text-[color:var(--muted)]">{progressValue}% complete</p>
              </div>
            </TabsContent>

            <TabsContent value="switch">
              <PlaygroundControls controls={controlsByTab.switch} values={playground} onChange={update} />
              <div className="ds-preview-panel">
                <Switch
                  checked={Boolean(playground.switchChecked)}
                  disabled={Boolean(playground.switchDisabled)}
                  onCheckedChange={(checked) => update("switchChecked", checked)}
                />
              </div>
            </TabsContent>

            <TabsContent value="tabs">
              <PlaygroundControls controls={controlsByTab.tabs} values={playground} onChange={update} />
              <div className="ds-preview-panel max-w-xl">
                <Tabs
                  value={String(playground.tabsValue)}
                  onValueChange={(value) => update("tabsValue", value)}
                >
                  <TabsList>
                    <TabsTrigger value="student">Student</TabsTrigger>
                    <TabsTrigger value="teacher">Teacher</TabsTrigger>
                  </TabsList>
                  <TabsContent value="student">
                    <p className="text-sm text-[color:var(--muted)]">
                      Student mode shows baseline questions and stars.
                    </p>
                  </TabsContent>
                  <TabsContent value="teacher">
                    <p className="text-sm text-[color:var(--muted)]">
                      Teacher mode shows summary cards and attempts.
                    </p>
                  </TabsContent>
                </Tabs>
              </div>
            </TabsContent>

            <TabsContent value="radio">
              <PlaygroundControls controls={controlsByTab.radio} values={playground} onChange={update} />
              <div className="ds-preview-panel max-w-xl">
                <p className="text-sm font-semibold text-[color:var(--ink)]">Student answer option style</p>
                <div
                  className={radioVariant === "tile" ? "grid grid-cols-2 gap-2" : "grid gap-2"}
                  role="radiogroup"
                  aria-label="Design system radio options"
                >
                  <RadioOption
                    label={radioOptionA}
                    selected={radioSelected === "option-a"}
                    disabled={Boolean(playground.radioDisabled)}
                    motionPolicy={motionPolicy}
                    variant={radioVariant}
                    onSelect={() => update("radioSelected", "option-a")}
                  />
                  <RadioOption
                    label={radioOptionB}
                    selected={radioSelected === "option-b"}
                    disabled={Boolean(playground.radioDisabled)}
                    motionPolicy={motionPolicy}
                    variant={radioVariant}
                    onSelect={() => update("radioSelected", "option-b")}
                  />
                </div>
                <p className="text-xs text-[color:var(--muted)]">
                  Selected: <strong>{selectedRadioLabel}</strong>
                </p>
              </div>
            </TabsContent>

            <TabsContent value="motion">
              <PlaygroundControls controls={controlsByTab.motion} values={playground} onChange={update} />
              <div className="ds-preview-panel">
                <MotionButton
                  motionPolicy={motionPolicy}
                  variant={buttonVariant}
                  onClick={() => void 0}
                >
                  Motion Tap Sample
                </MotionButton>
                <Separator />
                <p className="text-xs text-[color:var(--muted)]">
                  Active policy: <strong>{motionPolicy}</strong>. Full uses tap-scale; reduced disables tap motion.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </section>
  );
}
