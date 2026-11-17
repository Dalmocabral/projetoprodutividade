import {
  DEFAULT_VESSELS,
  DEFAULT_WORK_PLANS,
  MINUTE_MS,
  PORTAINER_IDS,
  STOP_LABELS,
  STOP_TYPES,
  TARGET_MOVES_PER_HOUR,
  type CraneWorkPlan,
  type MinuteRecord,
  type PortainerId,
  type SimulationState,
  type StopEvent,
  type StopType,
  type Vessel,
} from "./model";

export type ReportKind = "partial" | "final";

export interface ReportCraneSummary {
  portainerId: PortainerId;
  moves: number;
  teu: number;
  mph: number;
  activeMph: number;
  availabilityPercent: number;
  belowTarget: boolean;
  vesselName?: string;
  targetMoves?: number;
  remainingMoves?: number;
}

export interface ReportStopDetail {
  event: StopEvent;
  durationMinutes: number;
}

export interface ReportStopReason {
  type: StopType;
  label: string;
  count: number;
  totalMinutes: number;
}

export interface ProductivityWindow {
  portainerId: PortainerId;
  startAt: number;
  endAt: number;
  minutes: number;
  mph: number;
}

export interface ReportTimelinePoint {
  timestamp: number;
  mphByPortainer: Record<PortainerId, number>;
}

export interface ProductivityReport {
  kind: ReportKind;
  label: string;
  periodLabel: string;
  periodStart: number;
  periodEnd: number;
  periodMinutes: number;
  generatedAt: number;
  totalMoves: number;
  totalTeu: number;
  averageMph: number;
  onTargetCount: number;
  cranes: ReportCraneSummary[];
  stopDetails: ReportStopDetail[];
  stopReasons: ReportStopReason[];
  totalStopMinutes: number;
  highWindows: ProductivityWindow[];
  lowWindows: ProductivityWindow[];
  timeline: ReportTimelinePoint[];
  bottlenecks: string[];
  text: string;
}

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(timestamp: number): string {
  return dateTimeFormatter.format(new Date(timestamp));
}

function formatMph(value: number): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MPH`;
}

function formatSigned(value: number): string {
  const formatted = Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return value >= 0 ? `+${formatted}` : `−${formatted}`;
}

function formatMinutes(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole} min`;
  return `${Math.floor(whole / 60)}h ${String(whole % 60).padStart(2, "0")}min`;
}

function sumMeasure(records: MinuteRecord[], portainerId: PortainerId, measure: "moves" | "teu"): number {
  return records.reduce((sum, record) => sum + (record.byPortainer[portainerId]?.[measure] ?? 0), 0);
}

function findProductivityWindows(records: MinuteRecord[], portainerId: PortainerId): {
  best: ProductivityWindow | undefined;
  low: ProductivityWindow[];
} {
  const windowSize = Math.min(15, records.length);
  if (windowSize === 0) return { best: undefined, low: [] };

  const windows: ProductivityWindow[] = [];
  for (let endIndex = windowSize - 1; endIndex < records.length; endIndex += 1) {
    const startIndex = endIndex - windowSize + 1;
    const sample = records.slice(startIndex, endIndex + 1);
    const moves = sumMeasure(sample, portainerId, "moves");
    windows.push({
      portainerId,
      startAt: sample[0].timestamp,
      endAt: sample[sample.length - 1].timestamp + MINUTE_MS,
      minutes: sample.length,
      mph: (moves / sample.length) * 60,
    });
  }

  const best = [...windows].sort((a, b) => b.mph - a.mph)[0];
  const below = windows
    .filter((window) => window.mph < TARGET_MOVES_PER_HOUR)
    .sort((a, b) => a.mph - b.mph);
  const low: ProductivityWindow[] = [];
  for (const candidate of below) {
    const overlaps = low.some((chosen) => candidate.startAt < chosen.endAt && candidate.endAt > chosen.startAt);
    if (!overlaps) low.push(candidate);
    if (low.length === 2) break;
  }
  return { best, low };
}

function buildReportText(report: Omit<ProductivityReport, "text">): string {
  const kindTitle = report.kind === "partial" ? "RELATÓRIO PARCIAL" : "RELATÓRIO FINAL";
  const craneLines = report.cranes.map((crane) => {
    const status = crane.belowTarget ? "ABAIXO DA PEDIDA" : "NA/ACIMA DA PEDIDA";
    const vesselPart = crane.vesselName ? ` [${crane.vesselName}]` : "";
    const planPart = crane.targetMoves !== undefined
      ? ` | saldo ${crane.remainingMoves}/${crane.targetMoves} mov`
      : "";
    return `${crane.portainerId}${vesselPart}: ${crane.moves} movimentos | ${crane.teu} TEU${planPart} | ${formatMph(crane.mph)} (${formatSigned(crane.mph - TARGET_MOVES_PER_HOUR)}) | disponibilidade ${crane.availabilityPercent.toFixed(0)}% | ${status}`;
  });

  const bestLines = report.highWindows.map((window) =>
    `${window.portainerId}: ${formatDateTime(window.startAt)}–${formatDateTime(window.endAt)} · ${formatMph(window.mph)} (${window.minutes} min)`,
  );
  const lowLines = report.lowWindows.map((window) =>
    `${window.portainerId}: ${formatDateTime(window.startAt)}–${formatDateTime(window.endAt)} · ${formatMph(window.mph)} · ${formatSigned(window.mph - TARGET_MOVES_PER_HOUR)} vs. pedida`,
  );
  const stopReasonLines = report.stopReasons
    .filter((reason) => reason.count > 0)
    .map((reason) => `${reason.label}: ${reason.count} ocorrência(s), ${formatMinutes(reason.totalMinutes)} acumulados`);
  const stopDetailLines = report.stopDetails.map(({ event, durationMinutes }) =>
    `${event.portainerId} · ${STOP_LABELS[event.type]} · início ${formatDateTime(event.startAt)} · ${formatMinutes(durationMinutes)}${event.endAt === null ? " · em andamento" : ""}`,
  );

  return [
    `PORTLINE — ${kindTitle} DE PRODUTIVIDADE`,
    `Gerado em: ${formatDateTime(report.generatedAt)}`,
    `Período: ${formatDateTime(report.periodStart)} até ${formatDateTime(report.periodEnd)} · ${formatMinutes(report.periodMinutes)}`,
    `Escopo: ${report.periodLabel} · meta ${TARGET_MOVES_PER_HOUR} MPH por portêiner.`,
    "",
    "RESUMO EXECUTIVO",
    `Movimentos: ${report.totalMoves} · TEU movimentados: ${report.totalTeu} (volume de carga, não equivalente ao número de movimentos).`,
    `Ritmo médio: ${formatMph(report.averageMph)} por portêiner · ${report.onTargetCount}/${report.cranes.length} portêiner(es) na/ acima da pedida.`,
    `Paradas: ${report.stopDetails.length} ocorrência(s) · ${formatMinutes(report.totalStopMinutes)} de portêiner-minutos acumulados.`,
    "",
    "DESEMPENHO POR PORTÊINER",
    ...craneLines,
    "",
    `MELHORES JANELAS DE ${Math.min(15, report.periodMinutes)} MIN`,
    ...(bestLines.length ? bestLines : ["Sem dados suficientes para identificar janelas de maior produtividade."]),
    "",
    `JANELAS ABAIXO DE ${TARGET_MOVES_PER_HOUR} MPH`,
    ...(lowLines.length ? lowLines : ["Nenhuma janela abaixo da pedida no período analisado."]),
    "",
    "PARADAS E GARGALOS OBSERVADOS",
    ...(stopReasonLines.length ? ["Paradas por motivo:", ...stopReasonLines] : ["Nenhuma parada registrada no período."]),
    ...(stopDetailLines.length ? ["Detalhamento:", ...stopDetailLines] : []),
    ...(report.bottlenecks.length ? ["Observações:", ...report.bottlenecks.map((note) => `• ${note}`)] : []),
    "",
    "Regra de medição: cada ciclo físico do guindaste conta como 1 movimento. Contêiner 20' simples = 1 movimento/1 TEU; contêiner 40' = 1 movimento/2 TEU; twin lift de dois 20' = 1 movimento/2 TEU.",
    "Este relatório foi preparado a partir do simulador local. Nenhum e-mail foi enviado automaticamente.",
    "Para anexar o relatório visual em PDF, baixe o arquivo e anexe-o manualmente no aplicativo de e-mail.",
  ].join("\n");
}

export function createProductivityReport(
  state: SimulationState,
  kind: ReportKind,
  workPlans: Record<PortainerId, CraneWorkPlan> = DEFAULT_WORK_PLANS,
  vessels: Vessel[] = DEFAULT_VESSELS,
  partialMinutes: number = 60,
): ProductivityReport {
  const availableRecords = [...state.records].sort((a, b) => a.timestamp - b.timestamp);
  const sliceCount = kind === "partial" ? Math.min(partialMinutes, availableRecords.length) : availableRecords.length;
  const reportRecords = kind === "partial" ? availableRecords.slice(-sliceCount) : availableRecords;
  const firstRecord = reportRecords[0];
  const lastRecord = reportRecords[reportRecords.length - 1];
  const periodStart = firstRecord?.timestamp ?? state.now;
  const periodEnd = lastRecord ? lastRecord.timestamp + MINUTE_MS : state.now;
  const periodEndExclusive = periodEnd;
  const periodMinutes = reportRecords.length;

  const cranes: ReportCraneSummary[] = PORTAINER_IDS.map((portainerId) => {
    const moves = sumMeasure(reportRecords, portainerId, "moves");
    const teu = sumMeasure(reportRecords, portainerId, "teu");
    const activeMinutes = reportRecords.filter((record) => record.byPortainer[portainerId].stop === null).length;
    const mph = periodMinutes === 0 ? 0 : (moves / periodMinutes) * 60;
    const activeMph = activeMinutes === 0 ? 0 : (moves / activeMinutes) * 60;

    const plan = workPlans[portainerId];
    const vessel = vessels.find((v) => v.id === plan?.vesselId);
    const targetMoves = plan?.targetMoves ?? 500;
    const totalExecutedMoves = (plan?.initialExecutedMoves ?? 0) + state.records.reduce((sum, r) => sum + (r.byPortainer[portainerId]?.moves ?? 0), 0);
    const remainingMoves = Math.max(0, targetMoves - totalExecutedMoves);

    return {
      portainerId,
      moves,
      teu,
      mph,
      activeMph,
      availabilityPercent: periodMinutes === 0 ? 0 : (activeMinutes / periodMinutes) * 100,
      belowTarget: mph < TARGET_MOVES_PER_HOUR,
      vesselName: vessel ? (vessel.voyage ? `${vessel.name} (${vessel.voyage})` : vessel.name) : (plan?.vesselId === null ? "Standby" : undefined),
      targetMoves,
      remainingMoves,
    };
  });

  const stopDetails: ReportStopDetail[] = state.events
    .filter((event) => event.startAt < periodEnd && (event.endAt === null || event.endAt > periodStart))
    .flatMap((event) => {
      const start = Math.max(event.startAt, periodStart);
      const end = Math.min(event.endAt ?? periodEnd, periodEndExclusive);
      const durationMinutes = Math.max(0, Math.round((end - start) / MINUTE_MS));
      return durationMinutes > 0 ? [{ event, durationMinutes }] : [];
    })
    .sort((a, b) => a.event.startAt - b.event.startAt);

  const stopReasons: ReportStopReason[] = STOP_TYPES.map((type) => {
    const events = stopDetails.filter((detail) => detail.event.type === type);
    return {
      type,
      label: STOP_LABELS[type],
      count: events.length,
      totalMinutes: events.reduce((sum, detail) => sum + detail.durationMinutes, 0),
    };
  });
  const totalStopMinutes = stopDetails.reduce((sum, detail) => sum + detail.durationMinutes, 0);
  const windowsByCrane = PORTAINER_IDS.map((id) => findProductivityWindows(reportRecords, id));
  const highWindows = windowsByCrane.flatMap((result) => result.best ? [result.best] : []);
  const lowWindows = windowsByCrane.flatMap((result) => result.low).sort((a, b) => a.mph - b.mph);
  const totalMoves = cranes.reduce((sum, crane) => sum + crane.moves, 0);
  const totalTeu = cranes.reduce((sum, crane) => sum + crane.teu, 0);
  const averageMph = cranes.length === 0 ? 0 : cranes.reduce((sum, crane) => sum + crane.mph, 0) / cranes.length;
  const onTargetCount = cranes.filter((crane) => !crane.belowTarget).length;
  const timeline: ReportTimelinePoint[] = reportRecords.map((record, index) => {
    const sample = reportRecords.slice(Math.max(0, index - 14), index + 1);
    const mphByPortainer = Object.fromEntries(PORTAINER_IDS.map((portainerId) => [
      portainerId,
      (sumMeasure(sample, portainerId, "moves") / sample.length) * 60,
    ])) as Record<PortainerId, number>;
    return { timestamp: record.timestamp, mphByPortainer };
  });
  const slowest = [...cranes].sort((a, b) => a.mph - b.mph)[0];
  const longestStopReason = [...stopReasons].sort((a, b) => b.totalMinutes - a.totalMinutes)[0];
  const bottlenecks: string[] = [];
  if (slowest?.belowTarget) {
    bottlenecks.push(`${slowest.portainerId} apresentou o menor ritmo médio (${formatMph(slowest.mph)}), abaixo da pedida de ${TARGET_MOVES_PER_HOUR} MPH.`);
  }
  if (longestStopReason && longestStopReason.totalMinutes > 0) {
    bottlenecks.push(`Maior tempo acumulado de parada por motivo: ${longestStopReason.label} (${formatMinutes(longestStopReason.totalMinutes)}).`);
  }
  if (lowWindows[0]) {
    bottlenecks.push(`Menor janela observada: ${lowWindows[0].portainerId}, ${formatDateTime(lowWindows[0].startAt)}–${formatDateTime(lowWindows[0].endAt)}, com ${formatMph(lowWindows[0].mph)}.`);
  }

  const reportBase: Omit<ProductivityReport, "text"> = {
    kind,
    label: kind === "partial" ? "Parcial" : "Final",
    periodLabel: kind === "partial" ? `últimos dados disponíveis (${periodMinutes} min)` : "todo o histórico da faina",
    periodStart,
    periodEnd,
    periodMinutes,
    generatedAt: state.now,
    totalMoves,
    totalTeu,
    averageMph,
    onTargetCount,
    cranes,
    stopDetails,
    stopReasons,
    totalStopMinutes,
    highWindows,
    lowWindows,
    timeline,
    bottlenecks,
  };

  return { ...reportBase, text: buildReportText(reportBase) };
}
