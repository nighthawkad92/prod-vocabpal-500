import {
  createContext,
  useContext,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

type TabsProps = HTMLAttributes<HTMLDivElement> & {
  value: string;
  onValueChange: (value: string) => void;
};

export function Tabs({ value, onValueChange, className, ...props }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn("space-y-4", className)} {...props} />
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-[color:var(--line)] bg-white p-1",
        className,
      )}
      {...props}
    />
  );
}

type TabsTriggerProps = HTMLAttributes<HTMLButtonElement> & {
  value: string;
};

export function TabsTrigger({
  value,
  className,
  children,
  ...props
}: TabsTriggerProps) {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("TabsTrigger must be used within Tabs");
  }

  const isActive = context.value === value;

  return (
    <button
      type="button"
      className={cn(
        "rounded-full px-5 py-2 text-sm font-semibold transition-colors",
        isActive
          ? "bg-[color:var(--brand-600)] text-white"
          : "text-[color:var(--ink)] hover:bg-[color:var(--surface-2)]",
        className,
      )}
      onClick={() => context.onValueChange(value)}
      {...props}
    >
      {children}
    </button>
  );
}

type TabsContentProps = HTMLAttributes<HTMLDivElement> & {
  value: string;
  children: ReactNode;
};

export function TabsContent({ value, className, children, ...props }: TabsContentProps) {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("TabsContent must be used within Tabs");
  }

  if (context.value !== value) {
    return null;
  }

  return (
    <div className={cn("space-y-4", className)} {...props}>
      {children}
    </div>
  );
}
