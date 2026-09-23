export const spacingOptions = [
  { value: 0.7, name: "Sıkı" },
  { value: 1, name: "Dengeli" },
  { value: 1.6, name: "Ferah" },
] as const;
export function parseSpacing(value: string | null): number {
  return (
    spacingOptions.find((option) => option.value === Number(value))?.value ?? 1
  );
}
export type LayoutStatus = "pending" | "ready" | "fallback";

export const groupingOptions = [
  { value: 0.8, name: "Geniş" },
  { value: 1.5, name: "Dengeli" },
  { value: 3, name: "Ayrıntılı" },
] as const;
export function parseResolution(value: string | null): number {
  return (
    groupingOptions.find((option) => option.value === Number(value))?.value ??
    1.5
  );
}

export type ViewMode = "2d" | "3d";
export function parseViewMode(value: string | null): ViewMode {
  return value === "3d" ? "3d" : "2d";
}
