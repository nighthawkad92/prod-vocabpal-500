export {};

declare global {
  interface Window {
    clarity?: ((method: string, ...args: unknown[]) => void) & { q?: unknown[][] };
    __vpClarityDebug?: {
      calls: Array<{
        method: string;
        args: unknown[];
        atIso: string;
        enabled: boolean;
      }>;
    };
  }
}
