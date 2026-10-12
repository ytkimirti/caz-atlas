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
export type GraphMusician = Pick<
  Musician,
  "id" | "key" | "name" | "group" | "degree" | "x" | "y"
>;
export interface GraphData {
  nodes: GraphMusician[];
  edges: Edge[];
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
  jam?: true;
}
export interface ArchivedConcert extends DatedConcert {
  key: string;
  title?: string;
  /** Lineup names without a unique archive musician. */
  others?: string[];
}
export interface ConcertIndex {
  timeline: ArchivedConcert[];
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
  { id: "Piano", name: "Piyano", color: "#2f6fb5" },
  { id: "Winds", name: "Üflemeli", color: "#c47a0c" },
  { id: "Guitar", name: "Gitar", color: "#1f9a6e" },
  { id: "Bass", name: "Bas", color: "#9c5a2a" },
  { id: "Drums", name: "Davul", color: "#7b4fc4" },
  { id: "Vocals", name: "Vokal", color: "#d9486a" },
  { id: "Strings", name: "Yaylılar", color: "#1a9bb0" },
  { id: "Others", name: "Diğer", color: "#8a8b84" },
];
// The source splits brass and woodwinds; the atlas shows one wind family.
export const groupId = (group: string) =>
  group === "Brass" || group === "Woodwinds" ? "Winds" : group;
export const groupInfo = (id: string) =>
  groups.find((g) => g.id === groupId(id)) || groups[groups.length - 1];
export const number = (n: number) => n.toLocaleString("tr-TR");
export const normalize = (text: string) =>
  text
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
