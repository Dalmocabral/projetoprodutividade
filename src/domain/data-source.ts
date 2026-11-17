import type { CraneWorkPlan, PortainerId, SimulationState, StopType } from "./model";
import {
  advanceOneMinute,
  createCleanSimulationState,
  createSimulationState,
  registerStop,
  resumePortainer,
} from "./simulator";

export interface ProductivityDataSource {
  readonly mode: "simulation" | "corporate-api";
  initialize(now?: number): SimulationState;
  initializeClean(now?: number): SimulationState;
  advanceMinute(state: SimulationState, workPlans?: Record<PortainerId, CraneWorkPlan>): SimulationState;
  beginStop(state: SimulationState, portainerId: PortainerId, type: StopType): SimulationState;
  resume(state: SimulationState, portainerId: PortainerId): SimulationState;
}

// A UI consome uma interface única; a próxima etapa pode substituir este adaptador por um
// feed de API corporativa autorizado sem conectar o navegador diretamente ao banco da empresa.
export const demoProductivitySource: ProductivityDataSource = {
  mode: "simulation",
  initialize: createSimulationState,
  initializeClean: createCleanSimulationState,
  advanceMinute: advanceOneMinute,
  beginStop: registerStop,
  resume: resumePortainer,
};
