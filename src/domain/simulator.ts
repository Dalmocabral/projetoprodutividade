import {
  MINUTE_MS,
  PORTAINER_IDS,
  type CraneWorkPlan,
  type LiftMode,
  type MinuteRecord,
  type PortainerId,
  type SimulationState,
  type StopEvent,
  type StopType,
} from "./model";

export { MINUTE_MS };
const HISTORY_MINUTES = 120;

function seededUnit(timestamp: number, portainerIndex: number): number {
  const minute = Math.floor(timestamp / MINUTE_MS);
  const value = Math.sin(minute * 12.9898 + (portainerIndex + 1) * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

function initialEvents(_now: number): StopEvent[] {
  // Simulação iniciada com todas as paradas zeradas
  return [];
}

function eventAt(
  events: StopEvent[],
  portainerId: PortainerId,
  timestamp: number,
): StopEvent | undefined {
  return events.find(
    (event) =>
      event.portainerId === portainerId &&
      event.startAt <= timestamp &&
      (event.endAt === null || timestamp < event.endAt),
  );
}

function getLiftMode(timestamp: number, portainerIndex: number): LiftMode {
  const draw = seededUnit(timestamp, portainerIndex + PORTAINER_IDS.length);
  if (draw < 0.3) return "single-20ft";
  if (draw < 0.75) return "single-40ft";
  return "twin-lift-20ft";
}

function makeRecord(
  timestamp: number,
  events: StopEvent[],
  workPlans?: Record<PortainerId, CraneWorkPlan>,
): MinuteRecord {
  const byPortainer = Object.fromEntries(
    PORTAINER_IDS.map((portainerId, index) => {
      const plan = workPlans?.[portainerId];
      // Só gera movimentos se o guindaste estiver alocado a um navio ativo
      const isWorking = workPlans ? Boolean(plan?.vesselId) : true;
      const stop = eventAt(events, portainerId, timestamp);
      const move = isWorking && !stop && seededUnit(timestamp, index) < 0.45;
      const liftMode = move ? getLiftMode(timestamp, index) : null;
      const teu = liftMode === "single-20ft" ? 1 : liftMode ? 2 : 0;
      return [portainerId, { moves: move ? 1 : 0, teu, liftMode, stop: stop?.type ?? null }];
    }),
  ) as MinuteRecord["byPortainer"];

  return { timestamp, byPortainer };
}

export function createSimulationState(now = Date.now()): SimulationState {
  const roundedNow = Math.floor(now / MINUTE_MS) * MINUTE_MS;
  const events = initialEvents(roundedNow);
  const records = Array.from({ length: HISTORY_MINUTES }, (_, index) => {
    const timestamp = roundedNow - (HISTORY_MINUTES - index - 1) * MINUTE_MS;
    return makeRecord(timestamp, events);
  });

  return { now: roundedNow, running: true, records, events };
}

export function createCleanSimulationState(now = Date.now()): SimulationState {
  const roundedNow = Math.floor(now / MINUTE_MS) * MINUTE_MS;
  const records = Array.from({ length: HISTORY_MINUTES }, (_, index) => {
    const timestamp = roundedNow - (HISTORY_MINUTES - index - 1) * MINUTE_MS;
    const byPortainer = Object.fromEntries(
      PORTAINER_IDS.map((id) => [id, { moves: 0, teu: 0, liftMode: null, stop: null }]),
    ) as MinuteRecord["byPortainer"];
    return { timestamp, byPortainer };
  });

  return { now: roundedNow, running: true, records, events: [] };
}

export function seedSimulationRecordsForPlans(
  state: SimulationState,
  workPlans: Record<PortainerId, CraneWorkPlan>,
): SimulationState {
  const records = state.records.map((rec) => {
    const byPortainer = { ...rec.byPortainer };
    PORTAINER_IDS.forEach((id, index) => {
      const plan = workPlans[id];
      if (plan?.vesselId) {
        // Se o guindaste está escalado no navio, gera a curva histórica de produção
        const stop = eventAt(state.events, id, rec.timestamp);
        const move = !stop && seededUnit(rec.timestamp, index) < 0.45;
        const liftMode = move ? getLiftMode(rec.timestamp, index) : null;
        const teu = liftMode === "single-20ft" ? 1 : liftMode ? 2 : 0;
        byPortainer[id] = { moves: move ? 1 : 0, teu, liftMode, stop: stop?.type ?? null };
      } else {
        // Standby: 0 movimentos
        byPortainer[id] = { moves: 0, teu: 0, liftMode: null, stop: null };
      }
    });
    return { ...rec, byPortainer };
  });

  return { ...state, records };
}

export function advanceOneMinute(
  state: SimulationState,
  workPlans?: Record<PortainerId, CraneWorkPlan>,
): SimulationState {
  const now = state.now + MINUTE_MS;
  const record = makeRecord(now, state.events, workPlans);

  // Limpeza de eventos encerrados há mais de 24h para evitar vazamento de memória em execuções longas
  const eventRetentionCutoff = now - 24 * 60 * MINUTE_MS;
  const prunedEvents = state.events.filter(
    (event) => event.endAt === null || event.endAt >= eventRetentionCutoff,
  );

  return {
    ...state,
    now,
    events: prunedEvents,
    records: [...state.records, record].slice(-HISTORY_MINUTES),
  };
}

export function registerStop(
  state: SimulationState,
  portainerId: PortainerId,
  type: StopType,
): SimulationState {
  const alreadyStopped = state.events.some(
    (event) => event.portainerId === portainerId && event.endAt === null,
  );
  if (alreadyStopped) return state;

  const nextEvent: StopEvent = {
    id: `sim-${portainerId}-${state.now}-${state.events.length}`,
    portainerId,
    type,
    startAt: state.now,
    endAt: null,
  };

  const nextEvents = [...state.events, nextEvent];

  // Sincroniza imediatamente o registro do minuto corrente
  const updatedRecords = state.records.map((rec) =>
    rec.timestamp === state.now ? makeRecord(rec.timestamp, nextEvents) : rec,
  );

  return { ...state, events: nextEvents, records: updatedRecords };
}

export function resumePortainer(state: SimulationState, portainerId: PortainerId): SimulationState {
  const activeIndex = state.events.findIndex(
    (event) => event.portainerId === portainerId && event.endAt === null,
  );
  if (activeIndex < 0) return state;

  const events = [...state.events];
  events[activeIndex] = { ...events[activeIndex], endAt: state.now };

  // Sincroniza imediatamente o registro do minuto corrente
  const updatedRecords = state.records.map((rec) =>
    rec.timestamp === state.now ? makeRecord(rec.timestamp, events) : rec,
  );

  return { ...state, events, records: updatedRecords };
}

export function setSimulationRunning(state: SimulationState, running: boolean): SimulationState {
  return { ...state, running };
}
