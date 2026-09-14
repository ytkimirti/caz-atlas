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
export interface Ensemble {
  id: string;
  name: string;
  concerts: number;
  musicians: Record<string, number>;
}
export interface Venue {
  id: string;
  name: string;
  city: string;
  concerts: number;
  musicians: Record<string, number>;
  edges: Edge[];
  ensembles: Ensemble[];
}
export interface DatedConcert {
  ensemble?: string;
  date: string;
  venue: string;
  musicians: number[];
}
export interface ConcertIndex {
  timeline: DatedConcert[];
  ensembles: Ensemble[];
  counts: Record<string, number>;
  edges: Edge[];
  venues: Venue[];
  meta: {
    source: string;
    fetchedAt: string;
    through: string;
    concerts: number;
    matchedMusicians: number;
    unmatchedNames: number;
  };
}
export const groups = [
  { id: "Piano", name: "Piyano", color: "#577c9a" },
  { id: "Brass", name: "Bakır üflemeli", color: "#b88a45" },
  { id: "Woodwinds", name: "Tahta üflemeli", color: "#8e9560" },
  { id: "Guitar", name: "Gitar", color: "#598878" },
  { id: "Bass", name: "Bas", color: "#94775a" },
  { id: "Drums", name: "Davul", color: "#877698" },
  { id: "Vocals", name: "Vokal", color: "#b7787c" },
  { id: "Strings", name: "Yaylılar", color: "#648d91" },
  { id: "Others", name: "Diğer", color: "#92938c" },
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
