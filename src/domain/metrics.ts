import {
  DEFAULT_WORK_PLANS,
  MINUTE_MS,
  PORTAINER_IDS,
  TARGET_MOVES_PER_HOUR,
  type CraneWorkPlan,
  type MinuteRecord,
  type PortainerId,
  type StopEvent,
} from "./model";

export { TARGET_MOVES_PER_HOUR };

export interface PortainerMetric {
  id: PortainerId;
  lastHourMoves: number;
  lastHourTeu: number;
  rateMovesPerHour: number;
  activeRateMovesPerHour: number;
  availabilityPercent: number;
  isOnTarget: boolean;
  activeStop: StopEvent | undefined;
  // Plano de trabalho e contagem regressiva
  vesselId: string | null;
  targetMoves: number;
  totalExecutedMoves: number;
  remainingMoves: number;
  progressPercent: number;
  estimatedRemainingMinutes: number | null;
  estimatedCompletionAt: number | null;
}

export function getPortainerMetrics(
  records: MinuteRecord[],
  events: StopEvent[],
  now: number,
  selected: PortainerId[],
  workPlans: Record<PortainerId, CraneWorkPlan> = DEFAULT_WORK_PLANS,
): PortainerMetric[] {
  const hourStart = now - 59 * MINUTE_MS;
  const windowStart = now - 14 * MINUTE_MS;
  const hourRecords = records.filter((record) => record.timestamp >= hourStart && record.timestamp <= now);
  const windowRecords = records.filter((record) => record.timestamp >= windowStart && record.timestamp <= now);

  return selected.map((id) => {
    const lastHourMoves = hourRecords.reduce((sum, record) => sum + (record.byPortainer[id]?.moves ?? 0), 0);
    const lastHourTeu = hourRecords.reduce((sum, record) => sum + (record.byPortainer[id]?.teu ?? 0), 0);
    const movesInWindow = windowRecords.reduce((sum, record) => sum + (record.byPortainer[id]?.moves ?? 0), 0);
    const activeMinutes = windowRecords.filter((record) => (record.byPortainer[id]?.stop ?? null) === null).length;
    const activeStop = events.find((event) => event.portainerId === id && event.endAt === null);

    // Se o portêiner está em paralisação ativa neste momento, o ritmo operacional instantâneo é 0.0 MPH
    const rateMovesPerHour = activeStop
      ? 0
      : windowRecords.length === 0
      ? 0
      : (movesInWindow / windowRecords.length) * 60;

    const activeRateMovesPerHour = activeMinutes === 0 ? 0 : (movesInWindow / activeMinutes) * 60;
    const availabilityPercent = windowRecords.length === 0 ? 0 : (activeMinutes / windowRecords.length) * 100;

    // Contagem regressiva e plano de manobra
    const plan = workPlans[id];
    const vesselId = plan?.vesselId ?? null;
    const isStandby = vesselId === null;
    const targetMoves = plan?.targetMoves ?? (isStandby ? 0 : 500);
    const totalExecutedMoves = (plan?.initialExecutedMoves ?? 0) + (isStandby && targetMoves === 0 ? 0 : records.reduce((sum, r) => sum + (r.byPortainer[id]?.moves ?? 0), 0));
    const remainingMoves = Math.max(0, targetMoves - totalExecutedMoves);
    const progressPercent = targetMoves > 0 ? Math.min(100, (totalExecutedMoves / targetMoves) * 100) : 0;
    const effectiveMph = rateMovesPerHour > 0 ? rateMovesPerHour : (activeRateMovesPerHour > 0 ? activeRateMovesPerHour : 0);
    const estimatedRemainingMinutes = (!activeStop && effectiveMph > 0 && remainingMoves > 0) ? Math.round((remainingMoves / effectiveMph) * 60) : null;
    const estimatedCompletionAt = estimatedRemainingMinutes !== null ? (now + estimatedRemainingMinutes * MINUTE_MS) : null;

    return {
      id,
      lastHourMoves,
      lastHourTeu,
      rateMovesPerHour,
      activeRateMovesPerHour,
      availabilityPercent,
      isOnTarget: !activeStop && rateMovesPerHour >= TARGET_MOVES_PER_HOUR,
      activeStop,
      vesselId,
      targetMoves,
      totalExecutedMoves,
      remainingMoves,
      progressPercent,
      estimatedRemainingMinutes,
      estimatedCompletionAt,
    };
  });
}

export function getSelectedIds(selected: PortainerId | "ALL"): PortainerId[] {
  return selected === "ALL" ? [...PORTAINER_IDS] : [selected];
}

function getTotal(
  records: MinuteRecord[],
  now: number,
  minutes: number,
  selected: PortainerId[],
  measure: "moves" | "teu",
): number {
  const start = now - (minutes - 1) * MINUTE_MS;
  return records
    .filter((record) => record.timestamp >= start && record.timestamp <= now)
    .reduce(
      (total, record) =>
        total + selected.reduce((sum, id) => sum + (record.byPortainer[id]?.[measure] ?? 0), 0),
      0,
    );
}

export function getTotalMoves(
  records: MinuteRecord[],
  now: number,
  minutes = 60,
  selected: PortainerId[] = [...PORTAINER_IDS],
): number {
  return getTotal(records, now, minutes, selected, "moves");
}

export function getTotalTeu(
  records: MinuteRecord[],
  now: number,
  minutes = 60,
  selected: PortainerId[] = [...PORTAINER_IDS],
): number {
  return getTotal(records, now, minutes, selected, "teu");
}
