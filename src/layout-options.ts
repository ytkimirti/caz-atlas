export const layoutEngines = [
  {
    id: "communities",
    name: "Topluluklar · Önerilen",
    description:
      "Sık birlikte çalan gruplara ayrı alan açar. Kalabalık merkezi dağıtmak için.",
  },
  {
    id: "forceatlas2",
    name: "ForceAtlas2 · Kümeler",
    description:
      "Birlikte çalan toplulukları ayırır. Yoğun ağlar için iyi bir başlangıç.",
  },
  {
    id: "d3",
    name: "D3 · Dengeli",
    description:
      "Bağları ve düğüm aralıklarını dengeler; yerel ilişkileri izlemek için.",
  },
  {
    id: "ngraph",
    name: "ngraph · Yaylar",
    description: "Yay ve itme kuvvetleriyle alternatif bir dağılım oluşturur.",
  },
] as const;
export type LayoutEngine = (typeof layoutEngines)[number]["id"];
export const DEFAULT_ENGINE: LayoutEngine = "communities";
export function parseEngine(value: string | null): LayoutEngine {
  return (
    layoutEngines.find((engine) => engine.id === value)?.id ?? DEFAULT_ENGINE
  );
}
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
