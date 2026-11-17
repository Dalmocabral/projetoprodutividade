export const MINUTE_MS = 60_000;
export const TARGET_MOVES_PER_HOUR = 27;

export const PORTAINER_IDS = ["P4", "P5", "P6", "P7", "P8", "P9"] as const;

export type PortainerId = (typeof PORTAINER_IDS)[number];
export type PortainerFilter = PortainerId | "ALL";
export type StopType = "plug" | "vessel" | "truck";
export type LiftMode = "single-20ft" | "single-40ft" | "twin-lift-20ft";

export const STOP_TYPES: StopType[] = ["plug", "vessel", "truck"];

export const STOP_LABELS: Record<StopType, string> = {
  plug: "Retirada de tampão",
  vessel: "Espera pela passagem de outro navio",
  truck: "Demora de carreta no abastecimento",
};

export const PORTAINER_META: Record<PortainerId, { name: string; color: string }> = {
  P4: { name: "Portêiner 04", color: "#57d8c5" },
  P5: { name: "Portêiner 05", color: "#6da8ff" },
  P6: { name: "Portêiner 06", color: "#eebc68" },
  P7: { name: "Portêiner 07", color: "#b59aff" },
  P8: { name: "Portêiner 08", color: "#ff8fa3" },
  P9: { name: "Portêiner 09", color: "#4ae396" },
};

export interface Vessel {
  id: string;
  name: string;
  berth: string;
  voyage?: string;
}

export interface CatalogVessel {
  id: string;
  name: string;
  voyage: string;
  berth: string;
}

export const CATALOG_VESSELS: CatalogVessel[] = [
  { id: "vessel-dusseldorf", name: "DUSSELDORF EXPRESS", voyage: "643W-643W", berth: "" },
  { id: "vessel-santos", name: "SANTOS EXPRESS", voyage: "102E-102E", berth: "" },
  { id: "vessel-maersk", name: "MAERSK FORTALEZA", voyage: "401N-401N", berth: "" },
  { id: "vessel-cma", name: "CMA CGM SANTOS", voyage: "882S-882S", berth: "" },
  { id: "vessel-buzios", name: "MSC BÚZIOS", voyage: "514W-514W", berth: "" },
  { id: "vessel-login", name: "LOG-IN PANTANAL", voyage: "203S-203S", berth: "" },
  { id: "vessel-montevideo", name: "MONTEVIDEO EXPRESS", voyage: "311E-311E", berth: "" },
];

export function formatVesselTitle(vessel?: Vessel | null): string {
  if (!vessel) return "Operação Geral";
  if (vessel.voyage) {
    return `${vessel.name} - ${vessel.voyage}`;
  }
  return vessel.name;
}

export const DEFAULT_VESSELS: Vessel[] = [];

export interface CraneWorkPlan {
  portainerId: PortainerId;
  vesselId: string | null; // null = Não alocado / Standby
  targetMoves: number;     // Total programado para a manobra (ex: 178, 154, 122)
  initialExecutedMoves?: number;
}

export const DEFAULT_WORK_PLANS: Record<PortainerId, CraneWorkPlan> = {
  P4: { portainerId: "P4", vesselId: null, targetMoves: 0 },
  P5: { portainerId: "P5", vesselId: null, targetMoves: 0 },
  P6: { portainerId: "P6", vesselId: null, targetMoves: 0 },
  P7: { portainerId: "P7", vesselId: null, targetMoves: 0 },
  P8: { portainerId: "P8", vesselId: null, targetMoves: 0 },
  P9: { portainerId: "P9", vesselId: null, targetMoves: 0 },
};

export interface MinuteSample {
  moves: number;
  teu: number;
  liftMode: LiftMode | null;
  stop: StopType | null;
}

export interface MinuteRecord {
  timestamp: number;
  byPortainer: Record<PortainerId, MinuteSample>;
}

export interface StopEvent {
  id: string;
  portainerId: PortainerId;
  type: StopType;
  startAt: number;
  endAt: number | null;
}

export interface SimulationState {
  now: number;
  running: boolean;
  records: MinuteRecord[];
  events: StopEvent[];
}
