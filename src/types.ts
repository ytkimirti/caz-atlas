export interface Musician {
  id: number;
  key: string;
  name: string;
  group: string;
  city: string;
  status: string;
  degree: number;
  x: number;
  y: number;
  islandX: number;
  islandY: number;
  recordX: number;
  recordY: number;
  coverage: "available" | "unavailable" | "pending";
}
export interface Edge {
  source: number;
  target: number;
  weight: number;
}
export interface Atlas {
  nodes: Musician[];
  edges: Edge[];
  meta: {
    source: string;
    fetchedAt: string;
    directoryCount: number;
    archiveCount: number;
    fetchedCount: number;
    unavailableCount: number;
    pendingCount: number;
    components: number;
    isolatedCount: number;
    period: string;
    mergedAliases: number;
    complete: boolean;
  };
}
export type Mode = "network" | "islands" | "record" | "path";
export const groups = [
  { id: "Piano", name: "Piyano", color: "#72aef7" },
  { id: "Brass", name: "Bakır üflemeli", color: "#f3a661" },
  { id: "Woodwinds", name: "Tahta üflemeli", color: "#edc96d" },
  { id: "Guitar", name: "Gitar", color: "#8ccaab" },
  { id: "Bass", name: "Bas", color: "#c7db7c" },
  { id: "Drums", name: "Davul", color: "#ab8be6" },
  { id: "Vocals", name: "Vokal", color: "#e98dab" },
  { id: "Strings", name: "Yaylılar", color: "#6ac6cf" },
  { id: "Others", name: "Diğer / bilinmiyor", color: "#a1a6b0" },
];
export const groupInfo = (id: string) =>
  groups.find((g) => g.id === id) || groups[groups.length - 1];
export const number = (n: number) => n.toLocaleString("tr-TR");
export const normalize = (text: string) =>
  text
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
