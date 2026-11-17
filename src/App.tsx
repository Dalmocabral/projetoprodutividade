import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Anchor,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock3,
  Columns2,
  Columns3,
  Container,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  GripVertical,
  LayoutDashboard,
  Mail,
  Plus,
  RotateCcw,
  Rows2,
  Ship,
  SlidersHorizontal,
  Timer,
  Trash2,
  X,
  Settings,
} from "lucide-react";
import {
  CATALOG_VESSELS,
  DEFAULT_VESSELS,
  DEFAULT_WORK_PLANS,
  formatVesselTitle,
  MINUTE_MS,
  PORTAINER_IDS,
  PORTAINER_META,
  STOP_LABELS,
  STOP_TYPES,
  TARGET_MOVES_PER_HOUR,
  type CraneWorkPlan,
  type PortainerFilter,
  type PortainerId,
  type SimulationState,
  type StopType,
  type Vessel,
} from "./domain/model";
import { demoProductivitySource } from "./domain/data-source";
import { getPortainerMetrics, getSelectedIds, getTotalMoves, getTotalTeu } from "./domain/metrics";
import { createProductivityReport, type ProductivityReport, type ReportKind } from "./domain/reports";
import { seedSimulationRecordsForPlans } from "./domain/simulator";
import { EmailConfigModal } from "./components/EmailConfigModal";
import { EmailPromptModal } from "./components/EmailPromptModal";
import {
  loadEmailConfig,
  saveEmailConfig,
  type EmailNotificationConfig,
} from "./domain/email-config";

const PerformanceChart = lazy(() => import("./components/Charts").then((module) => ({ default: module.PerformanceChart })));

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const clockFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const shortTimeFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function formatClock(timestamp: number): string {
  return clockFormatter.format(new Date(timestamp));
}

function formatShortTime(timestamp: number): string {
  return shortTimeFormatter.format(new Date(timestamp));
}

function formatSigned(value: number): string {
  const fixed = Math.abs(value).toFixed(1);
  return value >= 0 ? `+${fixed}` : `−${fixed}`;
}

function formatDuration(startAt: number, endAt: number): string {
  const minutes = Math.max(0, Math.floor((endAt - startAt) / MINUTE_MS));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}min`;
}

function CraneGlyph() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="crane-glyph">
      <path d="M8 38h32M13 36V12h22v24M10 12h28M19 18v12m8-12v12m8-12v12M13 41l4-5m18 5-4-5" />
      <path d="M20 31h10l-2.2 4h-5.6L20 31Z" className="glyph-load" />
    </svg>
  );
}

const SUGGESTED_VESSEL_NAMES = [
  "Santos Express",
  "Maersk Fortaleza",
  "CMA CGM Santos",
  "MSC Rio de Janeiro",
  "Log-In Pantanal",
  "Montevideo Express",
];

function App() {
  const [simulation, setSimulation] = useState<SimulationState>(() => demoProductivitySource.initializeClean());
  const [vessels, setVessels] = useState<Vessel[]>(DEFAULT_VESSELS);
  const [selectedVesselId, setSelectedVesselId] = useState<string | "ALL">("ALL");
  const [workPlans, setWorkPlans] = useState<Record<PortainerId, CraneWorkPlan>>(DEFAULT_WORK_PLANS);

  // Modal de Adição/Seleção de Navio & Alocação de Guindastes
  const [showVesselModal, setShowVesselModal] = useState(false);
  const [editingVesselId, setEditingVesselId] = useState<string | null>(null);
  const [dropdownSelectionKey, setDropdownSelectionKey] = useState<string>("vessel-dusseldorf");
  const [activeModalBerth, setActiveModalBerth] = useState<string>("");
  const [customVesselName, setCustomVesselName] = useState<string>("");
  const [customVesselVoyage, setCustomVesselVoyage] = useState<string>("");
  const [customVesselBerth, setCustomVesselBerth] = useState<string>("");
  const [tempAllocatedCranes, setTempAllocatedCranes] = useState<
    Record<PortainerId, { allocated: boolean; targetMoves: number }>
  >({
    P4: { allocated: false, targetMoves: 150 },
    P5: { allocated: false, targetMoves: 150 },
    P6: { allocated: true, targetMoves: 154 },
    P7: { allocated: true, targetMoves: 178 },
    P8: { allocated: false, targetMoves: 150 },
    P9: { allocated: true, targetMoves: 122 },
  });

  const [portainerFilter, setPortainerFilter] = useState<PortainerFilter>("ALL");
  const [rangeMinutes, setRangeMinutes] = useState(60);
  const [eventFilter, setEventFilter] = useState<StopType | "ALL">("ALL");
  const [showStopDialog, setShowStopDialog] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [report, setReport] = useState<ProductivityReport | null>(null);
  const [emailConfig, setEmailConfig] = useState<EmailNotificationConfig>(() => loadEmailConfig());
  const [reportRecipients, setReportRecipients] = useState(() => loadEmailConfig().recipients.join(", "));
  const [showEmailConfigModal, setShowEmailConfigModal] = useState(false);
  const [promptModalData, setPromptModalData] = useState<{
    isOpen: boolean;
    kind: "partial" | "final";
    vesselName?: string;
    periodMinutes?: number;
    moves?: number;
    teu?: number;
    averageMph?: number;
  } | null>(null);
  const lastPartialTriggerTimeRef = useRef<number>(Date.now());
  const notifiedFinishedVesselIdsRef = useRef<string[]>([]);
  const [reportFeedback, setReportFeedback] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [formPortainer, setFormPortainer] = useState<PortainerId>("P7");
  const [formStopType, setFormStopType] = useState<StopType>("plug");

  // Multi-row crane organization
  const [craneRows, setCraneRows] = useState<PortainerId[][]>(() => [
    ["P4", "P5", "P6", "P7", "P8", "P9"],
  ]);
  const [hiddenCraneIds, setHiddenCraneIds] = useState<PortainerId[]>([]);
  const [draggedCrane, setDraggedCrane] = useState<{ id: PortainerId; sourceRow: number } | null>(null);
  const [dragOverRow, setDragOverRow] = useState<number | null>(null);

  // Vessel line charts ordering, layout and visibility
  const [vesselChartOrder, setVesselChartOrder] = useState<string[]>(() => DEFAULT_VESSELS.map((v) => v.id));
  const [chartsLayout, setChartsLayout] = useState<"side-by-side" | "stacked">("side-by-side");
  const [draggedVesselId, setDraggedVesselId] = useState<string | null>(null);
  const [dragOverVesselId, setDragOverVesselId] = useState<string | null>(null);
  // Visualização das Fainas de Cais: "1" (Individual), "2" (2 Navios) ou "3" (3 Navios / Cais completo)
  const [quayViewMode, setQuayViewMode] = useState<"1" | "2" | "3">("2");
  const [hiddenVesselChartIds, setHiddenVesselChartIds] = useState<string[]>([]);

  // Widget sections visibility
  const [showSummarySection, setShowSummarySection] = useState(true);
  const [showCranesSection, setShowCranesSection] = useState(true);
  const [showChartsSection, setShowChartsSection] = useState(true);
  const [showEventsSection, setShowEventsSection] = useState(true);

  function hideCrane(id: PortainerId) {
    setHiddenCraneIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function restoreCrane(id: PortainerId) {
    setHiddenCraneIds((prev) => prev.filter((item) => item !== id));
  }

  function restoreAllCranes() {
    setHiddenCraneIds([]);
  }

  function hideVesselChart(id: string) {
    setHiddenVesselChartIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function restoreVesselChart(id: string) {
    setHiddenVesselChartIds((prev) => prev.filter((item) => item !== id));
  }

  function restoreAllVesselCharts() {
    setHiddenVesselChartIds([]);
  }

  function removeVesselCompletely(vesselId: string) {
    const remaining = vessels.filter((v) => v.id !== vesselId);
    setVessels(remaining);

    // Desalocar guindastes alocados neste navio (voltam para standby)
    setWorkPlans((prev) => {
      const next = { ...prev };
      PORTAINER_IDS.forEach((id) => {
        if (next[id]?.vesselId === vesselId) {
          next[id] = { ...next[id], vesselId: null, targetMoves: 0 };
        }
      });
      return next;
    });

    setVesselChartOrder((prev) => prev.filter((id) => id !== vesselId));
    setHiddenVesselChartIds((prev) => prev.filter((id) => id !== vesselId));

    if (remaining.length === 0) {
      setSelectedVesselId("ALL");
      setQuayViewMode("1");
      setSimulation(demoProductivitySource.initializeClean());
    } else if (selectedVesselId === vesselId) {
      setSelectedVesselId(remaining[0].id);
    }
  }

  function handleCraneCardDrop(targetId: PortainerId, targetRow: number) {
    if (!draggedCrane) return;
    const { id: sourceId, sourceRow } = draggedCrane;
    if (sourceId === targetId && sourceRow === targetRow) {
      setDraggedCrane(null);
      setDragOverRow(null);
      return;
    }

    setCraneRows((prevRows) => {
      const next = prevRows.map((r) => [...r]);
      const srcIdx = next[sourceRow]?.indexOf(sourceId);
      if (srcIdx !== undefined && srcIdx !== -1) {
        next[sourceRow].splice(srcIdx, 1);
      }
      const tgtIdx = next[targetRow]?.indexOf(targetId) ?? -1;
      if (tgtIdx !== -1) {
        next[targetRow].splice(tgtIdx, 0, sourceId);
      } else {
        next[targetRow].push(sourceId);
      }
      const filtered = next.filter((r) => r.length > 0);
      return filtered.length > 0 ? filtered : [[sourceId]];
    });

    setDraggedCrane(null);
    setDragOverRow(null);
  }

  function handleCraneRowDrop(targetRow: number) {
    if (!draggedCrane) return;
    const { id: sourceId, sourceRow } = draggedCrane;
    if (sourceRow === targetRow) {
      setDraggedCrane(null);
      setDragOverRow(null);
      return;
    }

    setCraneRows((prevRows) => {
      const next = prevRows.map((r) => [...r]);
      const srcIdx = next[sourceRow]?.indexOf(sourceId);
      if (srcIdx !== undefined && srcIdx !== -1) {
        next[sourceRow].splice(srcIdx, 1);
      }
      if (next[targetRow]) {
        next[targetRow].push(sourceId);
      }
      const filtered = next.filter((r) => r.length > 0);
      return filtered.length > 0 ? filtered : [[sourceId]];
    });

    setDraggedCrane(null);
    setDragOverRow(null);
  }

  function handleVesselChartDrop(targetVesselId: string, event?: React.DragEvent) {
    if (!draggedVesselId) return;

    if (draggedVesselId === targetVesselId) {
      setDraggedVesselId(null);
      setDragOverVesselId(null);
      return;
    }

    if (event) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const relY = (event.clientY - rect.top) / rect.height;
      const relX = (event.clientX - rect.left) / rect.width;

      if (chartsLayout === "side-by-side" && relY > 0.6) {
        setChartsLayout("stacked");
      } else if (chartsLayout === "stacked" && (relX > 0.6 || relX < 0.4)) {
        setChartsLayout("side-by-side");
      }
    }

    setVesselChartOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(draggedVesselId);
      const toIdx = next.indexOf(targetVesselId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, draggedVesselId);
      return next;
    });
    setDraggedVesselId(null);
    setDragOverVesselId(null);
  }

  useEffect(() => {
    if (!simulation.running) return undefined;
    const interval = window.setInterval(() => {
      setSimulation((current) => demoProductivitySource.advanceMinute(current, workPlans));
    }, MINUTE_MS);
    return () => window.clearInterval(interval);
  }, [simulation.running, workPlans]);

  const activeVesselCraneIds = useMemo(() => {
    if (selectedVesselId === "ALL") {
      return PORTAINER_IDS.filter((id) => workPlans[id]?.vesselId !== null);
    }
    return PORTAINER_IDS.filter((id) => workPlans[id]?.vesselId === selectedVesselId);
  }, [selectedVesselId, workPlans]);

  const selectedIds = useMemo(() => {
    if (vessels.length === 0) {
      return [];
    }
    if (portainerFilter === "ALL") {
      return activeVesselCraneIds.length > 0 ? activeVesselCraneIds : [];
    }
    return activeVesselCraneIds.includes(portainerFilter) ? [portainerFilter] : [];
  }, [vessels.length, portainerFilter, activeVesselCraneIds]);

  const metrics = useMemo(
    () => getPortainerMetrics(simulation.records, simulation.events, simulation.now, selectedIds, workPlans),
    [simulation.records, simulation.events, simulation.now, selectedIds, workPlans],
  );
  const totalMoves = useMemo(
    () => getTotalMoves(simulation.records, simulation.now, 60, selectedIds),
    [simulation.records, simulation.now, selectedIds],
  );
  const totalTeu = useMemo(
    () => getTotalTeu(simulation.records, simulation.now, 60, selectedIds),
    [simulation.records, simulation.now, selectedIds],
  );

  const totalRemainingMoves = useMemo(
    () => metrics.reduce((sum, m) => sum + m.remainingMoves, 0),
    [metrics],
  );
  const totalTargetMoves = useMemo(
    () => metrics.reduce((sum, m) => sum + m.targetMoves, 0),
    [metrics],
  );
  const totalExecutedMoves = useMemo(
    () => metrics.reduce((sum, m) => sum + m.totalExecutedMoves, 0),
    [metrics],
  );
  const currentVessel = useMemo(
    () => vessels.find((v) => v.id === selectedVesselId),
    [vessels, selectedVesselId],
  );

  const visibleRowsToRender = useMemo(() => {
    const allowed = new Set(selectedIds);
    return craneRows
      .map((row, rowIdx) => {
        const cranes = row
          .filter((id) => allowed.has(id))
          .filter((id) => !hiddenCraneIds.includes(id));
        return { rowIdx, cranes };
      })
      .filter((r) => r.cranes.length > 0 || (draggedCrane !== null && craneRows.length > 1));
  }, [craneRows, selectedIds, hiddenCraneIds, draggedCrane]);

  const isIndividualMode = quayViewMode === "1" || selectedVesselId !== "ALL";

  const vesselsToChart = useMemo(() => {
    if (vessels.length === 0) return [];

    // Modo Individual: Se o modo for "1" OU se um navio específico estiver selecionado
    if (isIndividualMode) {
      const activeId = selectedVesselId === "ALL" ? vessels[0]?.id : selectedVesselId;
      const target = vessels.find((v) => v.id === activeId) || vessels[0];
      if (!target || hiddenVesselChartIds.includes(target.id)) return [];
      return [target];
    }

    // Modos 2 e 3 (Todos os navios): Ordenação personalizada com drag and drop
    const ordered = [...vessels]
      .filter((v) => !hiddenVesselChartIds.includes(v.id))
      .sort((a, b) => {
        const idxA = vesselChartOrder.indexOf(a.id);
        const idxB = vesselChartOrder.indexOf(b.id);
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
      });

    const maxCount = quayViewMode === "2" ? 2 : 3;
    return ordered.slice(0, maxCount);
  }, [vessels, isIndividualMode, quayViewMode, selectedVesselId, vesselChartOrder, hiddenVesselChartIds]);

  const emptyQuaySlotsCount = useMemo(() => {
    if (vessels.length === 0) return 0;
    if (isIndividualMode) return 0;
    const target = quayViewMode === "2" ? 2 : 3;
    return Math.max(0, target - vesselsToChart.length);
  }, [vessels.length, isIndividualMode, quayViewMode, vesselsToChart.length]);
  const activeStops = useMemo(
    () => simulation.events.filter((event) => event.endAt === null),
    [simulation.events],
  );

  const visibleEvents = useMemo(() => {
    const list = simulation.events
      // Paradas ativas (endAt === null) NUNCA expiram e nunca somem da tabela
      .filter((event) => event.endAt === null || event.startAt >= simulation.now - 120 * MINUTE_MS)
      .filter((event) => portainerFilter === "ALL" || event.portainerId === portainerFilter)
      .filter((event) => eventFilter === "ALL" || event.type === eventFilter);

    // Paradas ativas sempre aparecem com prioridade no topo da tabela
    return list
      .sort((a, b) => {
        const aActive = a.endAt === null;
        const bActive = b.endAt === null;
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        return b.startAt - a.startAt;
      })
      .slice(0, 15);
  }, [simulation.events, simulation.now, portainerFilter, eventFilter]);

  const onTarget = metrics.filter((metric) => metric.isOnTarget).length;
  const averageRate = metrics.length === 0 ? 0 : metrics.reduce((sum, metric) => sum + metric.rateMovesPerHour, 0) / metrics.length;
  const targetTotal = selectedIds.length * TARGET_MOVES_PER_HOUR;

  const freePortainers = useMemo(
    () => PORTAINER_IDS.filter((id) => !activeStops.some((event) => event.portainerId === id)),
    [activeStops],
  );

  const recipientList = useMemo(
    () => reportRecipients.split(/[;,]/).map((email) => email.trim()).filter(Boolean),
    [reportRecipients],
  );

  const validRecipients = useMemo(
    () => recipientList.length > 0 && recipientList.every((email) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)),
    [recipientList],
  );

  const reportSubject = report ? `Portline | Relatório ${report.label.toLowerCase()} | ${formatShortTime(report.generatedAt)}` : "";
  const MAX_MAILTO_URL_LENGTH = 1900;

  function prepareEmail() {
    if (!report || !validRecipients) return;
    const baseMailto = `mailto:${recipientList.join(",")}?subject=${encodeURIComponent(reportSubject)}&body=`;
    const fullBody = encodeURIComponent(report.text);

    if (baseMailto.length + fullBody.length <= MAX_MAILTO_URL_LENGTH) {
      window.location.href = `${baseMailto}${fullBody}`;
      setReportFeedback("Rascunho de e-mail aberto no aplicativo padrão.");
    } else {
      void navigator.clipboard.writeText(report.text);
      const summaryBody = encodeURIComponent(
        `Prezados,\n\nO relatório operacional completo (${report.label}) excede o limite aceito via link direto e foi copiado automaticamente para sua área de transferência (Ctrl+V).\n\nResumo rápido:\nMovimentos: ${report.totalMoves} | TEU: ${report.totalTeu} | Ritmo médio: ${report.averageMph.toFixed(1)} MPH\nPeríodo: ${formatShortTime(report.periodStart)} até ${formatShortTime(report.periodEnd)}.`
      );
      setReportFeedback("O relatório completo foi copiado para a área de transferência. Cole-o (Ctrl+V) no e-mail aberto.");
      window.location.href = `${baseMailto}${summaryBody}`;
    }
  }

  function sendReportDirectEmail(
    kind: "partial" | "final",
    customRecipients?: string[],
    periodMinutes?: number,
  ) {
    const to = customRecipients && customRecipients.length > 0
      ? customRecipients
      : emailConfig.recipients;
    if (to.length === 0) return;

    const rep = createProductivityReport(
      simulation,
      kind,
      workPlans,
      vessels,
      kind === "partial" ? (periodMinutes ?? emailConfig.partialIntervalMinutes) : undefined,
    );

    const activeVessel = vessels.find((v) => v.id === selectedVesselId) ?? vessels[0];
    const vesselName = activeVessel ? activeVessel.name : "Operação Geral";
    const subject = kind === "partial"
      ? `[PORTLINE] Relatório Parcial (${periodMinutes ?? emailConfig.partialIntervalMinutes} min) - ${vesselName} - ${formatShortTime(rep.generatedAt)}`
      : `[PORTLINE] Relatório Final de Encerramento - ${vesselName} - ${formatShortTime(rep.generatedAt)}`;

    const baseMailto = `mailto:${to.join(",")}?subject=${encodeURIComponent(subject)}&body=`;
    const fullBody = encodeURIComponent(rep.text);

    if (baseMailto.length + fullBody.length <= MAX_MAILTO_URL_LENGTH) {
      window.location.href = `${baseMailto}${fullBody}`;
      setReportFeedback("Rascunho de e-mail aberto no cliente corporativo.");
    } else {
      void navigator.clipboard.writeText(rep.text);
      const summaryBody = encodeURIComponent(
        `Prezados,\n\nO relatório operacional completo (${rep.label}) excede o limite aceito via link direto e foi copiado automaticamente para sua área de transferência (Ctrl+V).\n\nResumo rápido:\nMovimentos: ${rep.totalMoves} | TEU: ${rep.totalTeu} | Ritmo médio: ${rep.averageMph.toFixed(1)} MPH\nPeríodo: ${formatShortTime(rep.periodStart)} até ${formatShortTime(rep.periodEnd)}.`
      );
      setReportFeedback("O relatório completo foi copiado para a área de transferência. Cole-o (Ctrl+V) no e-mail aberto.");
      window.location.href = `${baseMailto}${summaryBody}`;
    }
  }

  // Monitoramento de automações de e-mail (Parcial por tempo e Final ao zerar trabalho)
  useEffect(() => {
    if (!emailConfig.enabled || vessels.length === 0) return;

    // 1. Relatório Parcial
    if (emailConfig.partialMode !== "disabled") {
      const elapsed = simulation.now - lastPartialTriggerTimeRef.current;
      const intervalMs = emailConfig.partialIntervalMinutes * MINUTE_MS;

      if (elapsed >= intervalMs) {
        lastPartialTriggerTimeRef.current = simulation.now;

        if (emailConfig.partialMode === "automatic") {
          sendReportDirectEmail("partial");
        } else if (emailConfig.partialMode === "manual") {
          const activeVessel = vessels.find((v) => v.id === selectedVesselId) ?? vessels[0];
          const partialRep = createProductivityReport(
            simulation,
            "partial",
            workPlans,
            vessels,
            emailConfig.partialIntervalMinutes,
          );
          setPromptModalData({
            isOpen: true,
            kind: "partial",
            vesselName: activeVessel?.name,
            periodMinutes: emailConfig.partialIntervalMinutes,
            moves: partialRep.totalMoves,
            teu: partialRep.totalTeu,
            averageMph: partialRep.averageMph,
          });
        }
      }
    } else {
      lastPartialTriggerTimeRef.current = simulation.now;
    }

    // 2. Relatório Final (disparado quando os movimentos programados zeram)
    if (emailConfig.finalMode !== "disabled") {
      vessels.forEach((v) => {
        const assignedCranes = PORTAINER_IDS.filter((id) => workPlans[id]?.vesselId === v.id);
        if (assignedCranes.length === 0) return;

        const totalPlanned = assignedCranes.reduce((sum, id) => sum + (workPlans[id]?.targetMoves ?? 0), 0);
        const totalRemaining = assignedCranes.reduce((sum, id) => {
          const m = metrics.find((item) => item.id === id);
          return sum + (m?.remainingMoves ?? 0);
        }, 0);

        if (totalPlanned > 0 && totalRemaining === 0) {
          if (!notifiedFinishedVesselIdsRef.current.includes(v.id)) {
            notifiedFinishedVesselIdsRef.current.push(v.id);

            if (emailConfig.finalMode === "automatic") {
              sendReportDirectEmail("final");
            } else if (emailConfig.finalMode === "manual") {
              const finalRep = createProductivityReport(simulation, "final", workPlans, vessels);
              setPromptModalData({
                isOpen: true,
                kind: "final",
                vesselName: v.name,
                moves: finalRep.totalMoves,
                teu: finalRep.totalTeu,
                averageMph: finalRep.averageMph,
              });
            }
          }
        }
      });
    }
  }, [simulation.now, emailConfig, vessels, workPlans, metrics, selectedVesselId]);

  function goTo(section: string) {
    document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openStopDialog() {
    if (portainerFilter !== "ALL" && freePortainers.includes(portainerFilter)) {
      setFormPortainer(portainerFilter);
    } else if (freePortainers.length > 0) {
      setFormPortainer(freePortainers[0]);
    }
    setShowStopDialog(true);
  }

  function openReportDialog() {
    setReport(null);
    setReportFeedback("");
    if (!reportRecipients && emailConfig.recipients.length > 0) {
      setReportRecipients(emailConfig.recipients.join(", "));
    }
    setShowReportDialog(true);
  }

  const activeModalVesselData = useMemo(() => {
    if (dropdownSelectionKey === "CUSTOM") {
      return {
        name: customVesselName.trim() || "Novo Navio",
        voyage: customVesselVoyage.trim() || "",
        berth: customVesselBerth,
      };
    }
    const item = CATALOG_VESSELS.find((c) => c.id === dropdownSelectionKey);
    return {
      name: item?.name ?? "DUSSELDORF EXPRESS",
      voyage: item?.voyage ?? "643W-643W",
      berth: activeModalBerth || item?.berth || "",
    };
  }, [dropdownSelectionKey, customVesselName, customVesselVoyage, customVesselBerth, activeModalBerth]);

  const allocatedCraneIds = useMemo(
    () => PORTAINER_IDS.filter((id) => tempAllocatedCranes[id]?.allocated),
    [tempAllocatedCranes],
  );

  const totalAllocatedTargetMoves = useMemo(
    () => allocatedCraneIds.reduce((sum, id) => sum + (tempAllocatedCranes[id]?.targetMoves ?? 0), 0),
    [allocatedCraneIds, tempAllocatedCranes],
  );

  const editingVessel = useMemo(
    () => (editingVesselId ? vessels.find((v) => v.id === editingVesselId) : null),
    [editingVesselId, vessels],
  );

  function closeVesselModal() {
    setShowVesselModal(false);
    setEditingVesselId(null);
  }

  function openVesselModal(targetVesselId?: string) {
    if (targetVesselId) {
      // MODO EDIÇÃO: Carregar os dados do navio especificado
      const targetVessel = vessels.find((v) => v.id === targetVesselId);
      if (targetVessel) {
        setEditingVesselId(targetVessel.id);

        const catalogMatch = CATALOG_VESSELS.find(
          (c) => c.id === targetVessel.id || c.name.toLowerCase() === targetVessel.name.toLowerCase(),
        );

        if (catalogMatch) {
          setDropdownSelectionKey(catalogMatch.id);
          setActiveModalBerth(targetVessel.berth || catalogMatch.berth);
          setCustomVesselName("");
          setCustomVesselVoyage("");
          setCustomVesselBerth(targetVessel.berth || catalogMatch.berth);
        } else {
          setDropdownSelectionKey("CUSTOM");
          setCustomVesselName(targetVessel.name);
          setCustomVesselVoyage(targetVessel.voyage || "");
          setCustomVesselBerth(targetVessel.berth);
          setActiveModalBerth(targetVessel.berth);
        }

        // Carregar guindastes do navio
        const nextAlloc: Record<PortainerId, { allocated: boolean; targetMoves: number }> = {
          P4: { allocated: false, targetMoves: 150 },
          P5: { allocated: false, targetMoves: 150 },
          P6: { allocated: false, targetMoves: 154 },
          P7: { allocated: false, targetMoves: 178 },
          P8: { allocated: false, targetMoves: 150 },
          P9: { allocated: false, targetMoves: 122 },
        };

        PORTAINER_IDS.forEach((id) => {
          const plan = workPlans[id];
          if (plan && plan.vesselId === targetVessel.id) {
            nextAlloc[id] = { allocated: true, targetMoves: plan.targetMoves || 150 };
          } else {
            const defaultTgt = id === "P7" ? 178 : id === "P6" ? 154 : id === "P9" ? 122 : 150;
            nextAlloc[id] = {
              allocated: false,
              targetMoves: plan?.targetMoves && plan.targetMoves > 0 ? plan.targetMoves : defaultTgt,
            };
          }
        });

        setTempAllocatedCranes(nextAlloc);
        setShowVesselModal(true);
        return;
      }
    }

    // MODO ADICIONAR NOVO NAVIO
    setEditingVesselId(null);

    // Sugerir um navio do catálogo que ainda NÃO esteja atracado
    const undockedCatalog = CATALOG_VESSELS.find(
      (c) => !vessels.some((v) => v.id === c.id || v.name.toLowerCase() === c.name.toLowerCase()),
    );
    const chosenCatalog = undockedCatalog || CATALOG_VESSELS[0];

    setDropdownSelectionKey(chosenCatalog.id);
    setActiveModalBerth(chosenCatalog.berth);
    setCustomVesselName("");
    setCustomVesselVoyage("");
    setCustomVesselBerth(chosenCatalog.berth);

    // Alocar guindastes livres ou sugerir o cenário padrão
    const nextAlloc: Record<PortainerId, { allocated: boolean; targetMoves: number }> = {
      P4: { allocated: false, targetMoves: 150 },
      P5: { allocated: false, targetMoves: 150 },
      P6: { allocated: false, targetMoves: 154 },
      P7: { allocated: false, targetMoves: 178 },
      P8: { allocated: false, targetMoves: 150 },
      P9: { allocated: false, targetMoves: 122 },
    };

    const freeIds = PORTAINER_IDS.filter((id) => !workPlans[id]?.vesselId);
    if (freeIds.length > 0) {
      freeIds.forEach((id) => {
        const defaultTgt = id === "P7" ? 178 : id === "P6" ? 154 : id === "P9" ? 122 : 150;
        nextAlloc[id] = { allocated: true, targetMoves: defaultTgt };
      });
    } else {
      nextAlloc.P6 = { allocated: true, targetMoves: 154 };
      nextAlloc.P7 = { allocated: true, targetMoves: 178 };
      nextAlloc.P9 = { allocated: true, targetMoves: 122 };
    }

    setTempAllocatedCranes(nextAlloc);
    setShowVesselModal(true);
  }

  function handleDropdownChange(key: string) {
    setDropdownSelectionKey(key);
    if (key !== "CUSTOM") {
      const cat = CATALOG_VESSELS.find((c) => c.id === key);
      if (cat) {
        setActiveModalBerth(cat.berth);
      }
    }
  }

  function updateActiveModalBerth(berth: string) {
    setActiveModalBerth(berth);
  }

  function toggleCraneAlloc(craneId: PortainerId) {
    setTempAllocatedCranes((prev) => ({
      ...prev,
      [craneId]: {
        ...prev[craneId],
        allocated: !prev[craneId].allocated,
      },
    }));
  }

  function updateCraneTargetVal(craneId: PortainerId, target: number) {
    const val = Math.max(1, isNaN(target) ? 1 : target);
    setTempAllocatedCranes((prev) => ({
      ...prev,
      [craneId]: {
        ...prev[craneId],
        targetMoves: val,
      },
    }));
  }

  function applyPresetUserSimulation() {
    setTempAllocatedCranes({
      P4: { allocated: false, targetMoves: 150 },
      P5: { allocated: false, targetMoves: 150 },
      P6: { allocated: true, targetMoves: 154 },
      P7: { allocated: true, targetMoves: 178 },
      P8: { allocated: false, targetMoves: 150 },
      P9: { allocated: true, targetMoves: 122 },
    });
  }

  function applyPresetReferenceImage() {
    setTempAllocatedCranes({
      P4: { allocated: false, targetMoves: 150 },
      P5: { allocated: false, targetMoves: 150 },
      P6: { allocated: true, targetMoves: 154 },
      P7: { allocated: false, targetMoves: 178 },
      P8: { allocated: false, targetMoves: 150 },
      P9: { allocated: true, targetMoves: 148 },
    });
  }

  function applyPresetAllCranes() {
    setTempAllocatedCranes({
      P4: { allocated: true, targetMoves: 150 },
      P5: { allocated: true, targetMoves: 150 },
      P6: { allocated: true, targetMoves: 154 },
      P7: { allocated: true, targetMoves: 178 },
      P8: { allocated: true, targetMoves: 150 },
      P9: { allocated: true, targetMoves: 122 },
    });
  }

  function clearAllCraneAllocations() {
    setTempAllocatedCranes((prev) => {
      const next = { ...prev };
      PORTAINER_IDS.forEach((id) => {
        next[id] = { ...next[id], allocated: false };
      });
      return next;
    });
  }

  function confirmAndActivateVessel() {
    let resolvedId: string;
    let targetName: string;
    let targetVoyage: string;
    let targetBerth: string;

    if (dropdownSelectionKey === "CUSTOM") {
      targetName = customVesselName.trim() || (editingVessel ? editingVessel.name : "Navio Personalizado");
      targetVoyage = customVesselVoyage.trim() || "";
      targetBerth = customVesselBerth;
      resolvedId = editingVesselId ?? `vessel-custom-${Date.now()}`;
    } else {
      const catalogItem = CATALOG_VESSELS.find((c) => c.id === dropdownSelectionKey);
      if (!catalogItem) return;
      targetName = catalogItem.name;
      targetVoyage = catalogItem.voyage;
      targetBerth = activeModalBerth || catalogItem.berth || "";
      resolvedId = catalogItem.id;
    }

    let targetVesselId: string;

    if (editingVesselId) {
      // MODO EDIÇÃO: Atualizar o navio existente SEM criar duplicatas!
      const currentEditingId = editingVesselId;
      targetVesselId = currentEditingId;

      setVessels((prev) =>
        prev.map((v) =>
          v.id === currentEditingId
            ? {
                ...v,
                name: targetName,
                voyage: targetVoyage,
                berth: targetBerth,
              }
            : v,
        ),
      );

      setSelectedVesselId(currentEditingId);
      setHiddenVesselChartIds((prev) => prev.filter((id) => id !== currentEditingId));
    } else {
      // MODO ADIÇÃO: Verificar se já existe na lista (por ID ou nome)
      const existingMatch = vessels.find(
        (v) =>
          v.id === resolvedId ||
          v.name.trim().toLowerCase() === targetName.trim().toLowerCase(),
      );

      const finalId = existingMatch ? existingMatch.id : resolvedId;
      targetVesselId = finalId;
      const finalVessel: Vessel = {
        id: finalId,
        name: targetName,
        voyage: targetVoyage,
        berth: targetBerth,
      };

      setVessels((prev) => {
        if (existingMatch) {
          return prev.map((v) => (v.id === finalId ? finalVessel : v));
        }
        return [...prev, finalVessel];
      });

      setSelectedVesselId(finalId);
      setVesselChartOrder((prev) => (prev.includes(finalId) ? prev : [...prev, finalId]));
      setHiddenVesselChartIds((prev) => prev.filter((id) => id !== finalId));
    }

    const nextPlans: Record<PortainerId, CraneWorkPlan> = { ...workPlans };
    PORTAINER_IDS.forEach((id) => {
      const alloc = tempAllocatedCranes[id];
      if (alloc.allocated) {
        nextPlans[id] = {
          portainerId: id,
          vesselId: targetVesselId,
          targetMoves: alloc.targetMoves,
        };
      } else if (nextPlans[id]?.vesselId === targetVesselId) {
        nextPlans[id] = {
          portainerId: id,
          vesselId: null,
          targetMoves: 0,
        };
      }
    });

    setWorkPlans(nextPlans);
    setSimulation((curr) => seedSimulationRecordsForPlans(curr, nextPlans));

    const activeIds = PORTAINER_IDS.filter((id) => tempAllocatedCranes[id].allocated);
    const standbyIds = PORTAINER_IDS.filter((id) => !tempAllocatedCranes[id].allocated);
    if (activeIds.length > 0) {
      setCraneRows(standbyIds.length > 0 ? [activeIds, standbyIds] : [activeIds]);
    }

    closeVesselModal();
  }

  function openConfigDialog() {
    openVesselModal();
  }

  function generateReport(kind: ReportKind) {
    setReport(
      createProductivityReport(
        simulation,
        kind,
        workPlans,
        vessels,
        kind === "partial" ? emailConfig.partialIntervalMinutes : undefined,
      ),
    );
    setReportFeedback("");
  }

  async function copyReport() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.text);
      setReportFeedback("Relatório copiado para a área de transferência.");
    } catch {
      setReportFeedback("Não foi possível copiar automaticamente. Selecione o texto do relatório para copiá-lo.");
    }
  }

  function downloadReport() {
    if (!report) return;
    const objectUrl = URL.createObjectURL(new Blob([report.text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `portline-relatorio-${report.kind}-${formatShortTime(report.generatedAt).replace(":", "-")}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  async function downloadPdf() {
    if (!report || pdfLoading) return;
    setPdfLoading(true);
    setReportFeedback("");
    try {
      const { downloadProductivityPdf } = await import("./domain/pdf-export");
      downloadProductivityPdf(report);
      setReportFeedback("PDF baixado. Anexe o arquivo manualmente ao e-mail, se quiser enviá-lo.");
    } catch {
      setReportFeedback("Não foi possível gerar o PDF. Você ainda pode baixar o relatório em texto.");
    } finally {
      setPdfLoading(false);
    }
  }

  function confirmStop(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSimulation((current) => demoProductivitySource.beginStop(current, formPortainer, formStopType));
    setShowStopDialog(false);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-symbol"><CraneGlyph /></div>
          <div>
            <div className="brand-name">PORTLINE</div>
            <div className="brand-caption">OPERAÇÃO · TERMINAL</div>
          </div>
        </div>

        {/* Botão de Adicionar Navio ACIMA */}
        <button
          type="button"
          className="sidebar-add-vessel-btn"
          onClick={() => openVesselModal()}
          disabled={vessels.length >= 3}
          title={vessels.length >= 3 ? "Capacidade máxima de 3 navios simultâneos atingida no cais" : "Atracar novo navio ou gerenciar atracações"}
        >
          <Plus size={14} />
          <span>{vessels.length >= 3 ? "Cais cheio (3/3)" : "Adicionar navio"}</span>
        </button>

        {/* Lista de navios adicionados ABAIXO do botão */}
        <div className="sidebar-vessels-list">
          {vessels.map((v) => {
            const isSelected = selectedVesselId === v.id;
            const assignedCranes = PORTAINER_IDS.filter((id) => workPlans[id]?.vesselId === v.id);

            return (
              <div
                key={v.id}
                className={`sidebar-vessel-card ${isSelected ? "is-selected" : ""}`}
                onClick={() => {
                  setSelectedVesselId(v.id);
                  setQuayViewMode("1");
                }}
                title={`Clique para selecionar ${v.name} na área de trabalho`}
              >
                <div className="terminal-icon">
                  <Ship size={16} strokeWidth={1.7} />
                </div>
                <div className="terminal-copy">
                  {v.voyage && <span>{v.voyage}</span>}
                  <strong>{formatVesselTitle(v)}</strong>
                  {assignedCranes.length > 0 && (
                    <small className="sidebar-vessel-cranes">
                      {assignedCranes.join(" · ")}
                    </small>
                  )}
                </div>
                <div className="sidebar-vessel-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="sidebar-vessel-action-btn"
                    onClick={() => openVesselModal(v.id)}
                    title={`Configurar guindastes de ${v.name}`}
                  >
                    <SlidersHorizontal size={13} />
                  </button>
                  <button
                    type="button"
                    className="sidebar-vessel-action-btn sidebar-vessel-close-btn"
                    onClick={() => removeVesselCompletely(v.id)}
                    title={`Fechar e remover ${v.name} da área de trabalho`}
                    aria-label={`Fechar ${v.name}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          })}

          {vessels.length === 0 && (
            <div className="sidebar-no-vessels">
              <span>Nenhum navio ativo</span>
              <small>Clique no botão acima para adicionar</small>
            </div>
          )}
        </div>

        <div className="sidebar-section-label">MONITORAMENTO</div>
        <nav className="side-nav" aria-label="Navegação do painel">
          <button className="side-nav-item selected" onClick={() => goTo("produtividade")}>
            <LayoutDashboard size={17} /><span>Produtividade</span><span className="nav-dot" />
          </button>
          <button className="side-nav-item" onClick={() => goTo("ocorrencias")}>
            <Bell size={17} /><span>Paradas e eventos</span>{activeStops.length > 0 && <span className="nav-count">{activeStops.length}</span>}
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="source-status"><span className="source-status-dot" /><div><strong>Fonte de dados</strong><span>Simulador local</span></div></div>
          <div className="sidebar-build">PORTLINE <span>DEMO v0.1</span></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Terminal</span><span className="breadcrumb-separator">/</span><strong>Controle operacional</strong></div>
          <div className="topbar-right">
            <div className="topbar-clock"><Clock3 size={15} /><span>{dateFormatter.format(new Date(simulation.now))}</span><strong>{formatClock(simulation.now)}</strong></div>
            <div className={`live-indicator ${simulation.running ? "is-live" : "is-paused"}`}><span />{simulation.running ? "SIMULAÇÃO ATIVA" : "SIMULAÇÃO PAUSADA"}</div>
          </div>
        </header>

        <div className="page-content" id="produtividade">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" />PAINEL DE TURNO <span className="eyebrow-divider">/</span> MOVIMENTAÇÃO</div>
              <h1>Produtividade <span>do navio</span></h1>
              <p>Acompanhe o ritmo dos portêineres e o saldo decrescente de movimentos programados.</p>
            </div>
            <div className="heading-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowEmailConfigModal(true)}
                title="Configurar lista de e-mails corporativos e envios automáticos"
              >
                <Mail size={15} /> Configuração de E-mails
              </button>
              <button className="button button-secondary" onClick={openReportDialog}>
                <FileText size={15} /> Relatórios
              </button>
            </div>
          </section>

          <section className="vessel-selector-bar" aria-label="Seleção de navio">
            <div className="vessel-selector-left">
              <span className="vessel-selector-label"><Ship size={13} /> Navio:</span>
              <div className="vessel-tabs" role="group" aria-label="Alternar navio ativo">
                {vessels.map((v) => {
                  const assignedCranes = PORTAINER_IDS.filter((id) => workPlans[id]?.vesselId === v.id);
                  return (
                    <div key={v.id} className="vessel-tab-pill-wrapper">
                      <button
                        type="button"
                        className={`vessel-tab-btn ${selectedVesselId === v.id ? "is-active" : ""}`}
                        onClick={() => {
                  setSelectedVesselId(v.id);
                  setQuayViewMode("1");
                }}
                      >
                        <span>{v.name}</span>
                        {v.voyage && <small>({v.voyage})</small>}
                        {assignedCranes.length > 0 && (
                          <span className="vessel-tab-cranes">{assignedCranes.join(" · ")}</span>
                        )}
                      </button>
                      {vessels.length > 1 && (
                        <button
                          type="button"
                          className="vessel-tab-remove-icon-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeVesselCompletely(v.id);
                          }}
                          title={`Desatracar e remover ${v.name}`}
                          aria-label={`Remover ${v.name}`}
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  );
                })}
                <button
                  type="button"
                  className={`vessel-tab-btn ${selectedVesselId === "ALL" && !isIndividualMode ? "is-active" : ""}`}
                  onClick={() => {
                    setSelectedVesselId("ALL");
                    setQuayViewMode(vessels.length >= 3 ? "3" : "2");
                  }}
                >
                  <span>Todos os navios</span>
                </button>
                <button
                  type="button"
                  className="vessel-tab-add-btn"
                  onClick={() => openVesselModal()}
                  disabled={vessels.length >= 3}
                  title={vessels.length >= 3 ? "Capacidade máxima de 3 navios no cais atingida" : "Atracar novo navio no terminal"}
                >
                  <Plus size={12} />
                  <span>{vessels.length >= 3 ? "Cais cheio (3/3)" : "Adicionar navio"}</span>
                </button>
              </div>
            </div>
          </section>

          <div className="widget-header-row">
            <span className="widget-header-title">PAINEL DE INDICADORES (KPIS)</span>
            <button
              type="button"
              className="widget-toggle-btn"
              onClick={() => setShowSummarySection((v) => !v)}
              title={showSummarySection ? "Recolher resumo de indicadores" : "Expandir resumo de indicadores"}
            >
              {showSummarySection ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              <span>{showSummarySection ? "Recolher resumo" : vessels.length === 0 ? "Expandir resumo" : `Expandir resumo (${totalRemainingMoves} mov restantes)`}</span>
            </button>
          </div>

          {showSummarySection && (
            <section className="summary-grid" aria-label="Resumo da operação">
              <SummaryCard
                icon={<Container size={17} />}
                label="Saldo a operar · navio"
                value={vessels.length === 0 ? "0" : String(totalRemainingMoves)}
                suffix={vessels.length === 0 ? undefined : "mov"}
                detail={
                  vessels.length === 0
                    ? "Nenhum navio atracado no momento"
                    : `${totalExecutedMoves} de ${totalTargetMoves} mov concluídos (${totalTargetMoves > 0 ? ((totalExecutedMoves / totalTargetMoves) * 100).toFixed(0) : 0}%)`
                }
                accent="teal"
              />
              <SummaryCard
                icon={<Gauge size={17} />}
                label="Ritmo médio"
                value={vessels.length === 0 || selectedIds.length === 0 ? "0.0" : `${averageRate.toFixed(1)}`}
                suffix="MPH"
                detail={
                  vessels.length === 0 || selectedIds.length === 0
                    ? "Aguardando atracação e escala de portêineres"
                    : `Movimentos/h por portêiner · pedida ${TARGET_MOVES_PER_HOUR} MPH`
                }
                accent="blue"
              />
              <SummaryCard
                icon={<Activity size={17} />}
                label="Na pedida"
                value={vessels.length === 0 || selectedIds.length === 0 ? "0/0" : `${onTarget}/${selectedIds.length}`}
                detail={
                  vessels.length === 0 || selectedIds.length === 0
                    ? "Nenhum guindaste em operação"
                    : "Portêineres no ritmo ou acima"
                }
                accent={vessels.length === 0 || selectedIds.length === 0 ? "amber" : onTarget === selectedIds.length ? "teal" : "amber"}
              />
              <SummaryCard
                icon={<Timer size={17} />}
                label="Paradas ativas"
                value={vessels.length === 0 ? "0" : String(activeStops.filter((event) => selectedIds.includes(event.portainerId)).length)}
                detail={vessels.length === 0 ? "Nenhuma paralisação" : "Aguardas registradas agora"}
                accent="amber"
              />
            </section>
          )}

          <section className="crane-section" aria-label="Produtividade individual dos portêineres">
            <div className="section-heading">
              <div>
                <div className="section-kicker">ACOMPANHAMENTO INDIVIDUAL</div>
                <h2>Ritmo por portêiner</h2>
              </div>
              <div className="crane-section-toolbar">
                <button
                  type="button"
                  className="crane-toolbar-btn"
                  onClick={() => setShowCranesSection((v) => !v)}
                  title={showCranesSection ? "Recolher cards de portêineres" : "Expandir cards de portêineres"}
                >
                  {showCranesSection ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  <span>{showCranesSection ? "Recolher" : "Expandir"}</span>
                </button>
                <div className="section-note"><span className="target-dot" />Meta de referência <strong>{TARGET_MOVES_PER_HOUR} MPH</strong></div>
              </div>
            </div>

            {showCranesSection && (
              <>
                {vessels.length === 0 ? (
                  <div className="crane-empty-terminal-banner">
                    <div className="empty-terminal-icon">
                      <Ship size={28} />
                    </div>
                    <div className="empty-terminal-text">
                      <h3>Terminal limpo · Aguardando atracação de navio</h3>
                      <p>
                        A aplicação iniciou limpa sem dados. Todos os 6 portêineres (P4 a P9) estão disponíveis no cais em standby.
                        Adicione um navio para iniciar a escala e a operação.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => openVesselModal()}
                    >
                      <Plus size={14} /> Adicionar navio e escalar
                    </button>
                  </div>
                ) : (
                  <>
                    {hiddenCraneIds.length > 0 && (
                      <div className="hidden-cranes-bar">
                        <span>Portêineres ocultos:</span>
                        {hiddenCraneIds.map((id) => (
                          <button
                            key={id}
                            type="button"
                            className="pill-restore"
                            onClick={() => restoreCrane(id)}
                            title={`Restaurar visualização do ${id}`}
                          >
                            <RotateCcw size={10} /> {id}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn-restore-all"
                          onClick={restoreAllCranes}
                        >
                          Restaurar todos ({hiddenCraneIds.length})
                        </button>
                      </div>
                    )}

                    {metrics.length > 0 ? (
                      visibleRowsToRender.length > 0 ? (
                        <div>
                      {visibleRowsToRender.map((rowItem) => {
                        const { rowIdx, cranes: rowCraneIds } = rowItem;
                        const rowMetrics = rowCraneIds
                          .map((id) => metrics.find((m) => m.id === id))
                          .filter((m): m is NonNullable<typeof m> => m !== undefined);

                        // Check if all cranes in this row belong to the same vessel
                        const vesselIdsInRow = Array.from(new Set(rowCraneIds.map((id) => workPlans[id]?.vesselId).filter(Boolean)));
                        let rowTitle = `Linha ${rowIdx + 1}`;
                        if (vesselIdsInRow.length === 1) {
                          const v = vessels.find((vessel) => vessel.id === vesselIdsInRow[0]);
                          if (v) {
                            rowTitle = formatVesselTitle(v);
                          }
                        }

                        return (
                          <div key={rowIdx} className="crane-row">
                            <div className="crane-row-header">
                              <div className="crane-row-title">
                                <Ship size={13} />
                                <strong>{rowTitle}</strong>
                                <span className="panel-separator">·</span>
                                <span>{rowCraneIds.length} {rowCraneIds.length === 1 ? "portêiner" : "portêineres"}</span>
                              </div>
                            </div>

                            <div
                              className={`crane-row-grid ${dragOverRow === rowIdx ? "is-row-drag-over" : ""}`}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                setDragOverRow(rowIdx);
                              }}
                              onDragLeave={() => {
                                if (dragOverRow === rowIdx) setDragOverRow(null);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                handleCraneRowDrop(rowIdx);
                              }}
                            >
                              {rowMetrics.map((metric) => {
                                const portainer = PORTAINER_META[metric.id];
                                const difference = metric.rateMovesPerHour - TARGET_MOVES_PER_HOUR;
                                const progress = Math.min(100, (metric.rateMovesPerHour / 40) * 100);
                                const assignedVessel = vessels.find((v) => v.id === metric.vesselId);

                                return (
                                  <article
                                    className={`crane-card ${metric.activeStop ? "has-stop" : ""} ${draggedCrane?.id === metric.id ? "is-dragging" : ""}`}
                                    key={metric.id}
                                    style={{ "--crane-color": portainer.color } as React.CSSProperties}
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData("text/plain", metric.id);
                                      setDraggedCrane({ id: metric.id, sourceRow: rowIdx });
                                    }}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      e.dataTransfer.dropEffect = "move";
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleCraneCardDrop(metric.id, rowIdx);
                                    }}
                                    onDragEnd={() => {
                                      setDraggedCrane(null);
                                      setDragOverRow(null);
                                    }}
                                  >
                                    <div className="crane-card-top">
                                      <div className="crane-ident">
                                        <span className="crane-id">{metric.id}</span>
                                        <div>
                                          <div className="crane-name">{portainer.name}</div>
                                          {assignedVessel && (
                                            <span className="crane-vessel-tag"><Ship size={10} /> {assignedVessel.name}{assignedVessel.voyage ? ` · ${assignedVessel.voyage}` : ""}</span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="crane-card-actions">
                                        <span className={`crane-state ${metric.activeStop ? "state-stopped" : "state-working"}`}>
                                          <i />
                                          {metric.activeStop ? "Parado" : "Em operação"}
                                        </span>
                                        {metric.activeStop && (
                                          <button
                                            type="button"
                                            className="crane-card-resume-btn"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSimulation((current) => demoProductivitySource.resume(current, metric.id));
                                            }}
                                            title={`Retomar operação do ${metric.id}`}
                                            aria-label={`Retomar operação do ${metric.id}`}
                                          >
                                            <Check size={11} /> Retomar
                                          </button>
                                        )}
                                        <span className="card-drag-handle" title="Arrastar para reposicionar entre linhas ou posições"><GripVertical size={13} /></span>
                                        <button
                                          type="button"
                                          className="card-icon-btn card-close-btn"
                                          onClick={() => hideCrane(metric.id)}
                                          title={`Ocultar card do ${metric.id}`}
                                          aria-label={`Ocultar card de ${metric.id}`}
                                        >
                                          <X size={13} />
                                        </button>
                                      </div>
                                    </div>

                                    <div className="crane-countdown-box">
                                      <div className="countdown-header">
                                        <span className="countdown-kicker">Saldo a Operar</span>
                                        <span className="countdown-fraction">
                                          <strong>{metric.remainingMoves}</strong> / {metric.targetMoves} mov
                                        </span>
                                      </div>
                                      <div className="countdown-bar-wrap" aria-label={`Progresso: ${metric.progressPercent.toFixed(1)}%`}>
                                        <div className="countdown-bar-fill" style={{ width: `${metric.progressPercent}%` }} />
                                      </div>
                                      <div className="countdown-info">
                                        <span>{metric.progressPercent.toFixed(1)}% concluído ({metric.totalExecutedMoves} mov)</span>
                                        <span className="countdown-etc">
                                          {metric.activeStop
                                            ? "Paralisado · Em pausa"
                                            : metric.estimatedRemainingMinutes !== null
                                            ? `ETC: ~${Math.floor(metric.estimatedRemainingMinutes / 60)}h ${metric.estimatedRemainingMinutes % 60}m`
                                            : "Aguardando ritmo"}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="crane-rate">
                                      <strong>{metric.rateMovesPerHour.toFixed(1)}</strong>
                                      <span>MPH</span>
                                      {metric.activeStop && <span className="crane-rate-stopped-badge">PARALISADO</span>}
                                    </div>
                                    <div className={`crane-delta ${metric.isOnTarget ? "delta-up" : "delta-down"}`}>
                                      {metric.activeStop ? (
                                        <span className="delta-stopped-text">Parada em andamento: {STOP_LABELS[metric.activeStop.type]}</span>
                                      ) : (
                                        <>
                                          {metric.isOnTarget ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                          <span>{formatSigned(difference)} MPH {metric.isOnTarget ? "acima" : "abaixo"} da pedida</span>
                                        </>
                                      )}
                                    </div>
                                    <div className="progress-track" aria-label={`${progress.toFixed(0)} por cento do limite visual de 40 movimentos por hora`}>
                                      <div className="progress-fill" style={{ width: `${progress}%` }} />
                                      <span className="progress-target" />
                                    </div>
                                    <div className="progress-captions"><span>0</span><span>Meta 27</span><span>40 MPH</span></div>
                                    <div className="crane-card-footer">
                                      <div><span>Movimentos · última hora</span><strong>{metric.lastHourMoves}</strong></div>
                                      <div><span>TEU · última hora</span><strong>{metric.lastHourTeu}</strong></div>
                                      <div><span>Ritmo ativo · 15 min</span><strong>{metric.activeRateMovesPerHour.toFixed(1)} MPH</strong></div>
                                      <div><span>Disponibilidade · 15 min</span><strong>{metric.availabilityPercent.toFixed(0)}%</strong></div>
                                    </div>
                                    {metric.activeStop && (
                                      <div className="crane-stop-note">
                                        <div className="stop-note-info">
                                          <span className="stop-note-dot" />
                                          <span><strong>{STOP_LABELS[metric.activeStop.type]}</strong> (início {formatShortTime(metric.activeStop.startAt)})</span>
                                        </div>
                                        <button
                                          type="button"
                                          className="stop-note-resume-btn"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSimulation((current) => demoProductivitySource.resume(current, metric.id));
                                          }}
                                          title={`Retomar operação do ${metric.id}`}
                                        >
                                          Retomar agora <Check size={11} />
                                        </button>
                                      </div>
                                    )}
                                  </article>
                                );
                              })}
                              {rowMetrics.length === 0 && (
                                <div className="crane-row-empty">
                                  <span>Linha vazia · Arraste portêineres para cá</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="events-empty" style={{ margin: "10px 0 25px" }}>
                      <div className="empty-icon"><RotateCcw size={18} /></div>
                      <strong>Todos os portêineres deste navio estão ocultos</strong>
                      <span>Clique em "Restaurar todos" na barra acima para visualizá-los novamente.</span>
                    </div>
                  )
                ) : (
                  <div className="events-empty" style={{ margin: "10px 0 25px" }}>
                    <div className="empty-icon"><Ship size={18} /></div>
                    <strong>Nenhum portêiner alocado neste navio</strong>
                    <span>Use o botão de ajustes no navio para alocar guindastes para a operação.</span>
                  </div>
                )}
                  </>
                )}
              </>
            )}

            <div className="metric-footnote"><CircleHelp size={14} /><span>MPH conta ciclos físicos: contêiner 20' sozinho = 1 movimento/1 TEU; contêiner 40' = 1 movimento/2 TEU; twin lift de 2×20' = 1 movimento/2 TEU. Arraste qualquer guindaste para cima ou para baixo para posicionar onde desejar.</span></div>
          </section>

          <section className="charts-section" aria-label="Gráficos da produtividade">
            <div className="section-heading charts-section-heading">
              <div><div className="section-kicker">TENDÊNCIA OPERACIONAL</div><h2>Produção ao longo do tempo</h2></div>
              <div className="chart-controls">
                {/* Visualização das Fainas / Capacidade do Cais (1, 2 ou 3 navios) */}
                <div className="layout-toggle-group quay-view-mode-group" role="group" aria-label="Visualização do Cais (Fainas)">
                  <button
                    type="button"
                    className={`layout-btn ${isIndividualMode ? "is-active" : ""}`}
                    onClick={() => {
                      setQuayViewMode("1");
                      if (selectedVesselId === "ALL" && vessels.length > 0) {
                        setSelectedVesselId(vessels[0].id);
                      }
                    }}
                    title="Modo individual: visualiza dados e gráfico de 1 navio em tela inteira"
                  >
                    <Ship size={12} />
                    <span>1 Navio (Individual)</span>
                  </button>
                  <button
                    type="button"
                    className={`layout-btn ${quayViewMode === "2" && !isIndividualMode ? "is-active" : ""}`}
                    onClick={() => {
                      setQuayViewMode("2");
                      setSelectedVesselId("ALL");
                    }}
                    title="Visualizar 2 navios simultâneos"
                  >
                    <Columns2 size={12} />
                    <span>2 Navios</span>
                  </button>
                  <button
                    type="button"
                    className={`layout-btn ${quayViewMode === "3" && !isIndividualMode ? "is-active" : ""}`}
                    onClick={() => {
                      setQuayViewMode("3");
                      setSelectedVesselId("ALL");
                    }}
                    title="Visualizar 3 navios simultâneos (Cais completo)"
                  >
                    <Columns3 size={12} />
                    <span>3 Navios (Cais completo)</span>
                  </button>
                </div>

                {/* Seletor rápido de navio individual quando em modo 1 Navio */}
                {isIndividualMode && vessels.length > 1 && (
                  <div className="layout-toggle-group single-vessel-switcher" role="group" aria-label="Alternar navio individual ativo">
                    {vessels.map((v) => {
                      const isActive = selectedVesselId === v.id || (selectedVesselId === "ALL" && vessels[0]?.id === v.id);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          className={`layout-btn ${isActive ? "is-active" : ""}`}
                          onClick={() => {
                            setSelectedVesselId(v.id);
                            setQuayViewMode("1");
                          }}
                          title={`Exibir gráfico individual de ${v.name}`}
                        >
                          <span>{v.name.split(" ")[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Alternância de Layout: Lado a Lado ou Empilhado (apenas para 2 ou 3 navios) */}
                {!isIndividualMode && (
                  <div className="layout-toggle-group" role="group" aria-label="Layout dos gráficos">
                    <button
                      type="button"
                      className={`layout-btn ${chartsLayout === "side-by-side" ? "is-active" : ""}`}
                      onClick={() => setChartsLayout("side-by-side")}
                      title="Exibir gráficos lado a lado"
                    >
                      <Columns2 size={13} />
                      <span>Lado a lado</span>
                    </button>
                    <button
                      type="button"
                      className={`layout-btn ${chartsLayout === "stacked" ? "is-active" : ""}`}
                      onClick={() => setChartsLayout("stacked")}
                      title="Exibir gráficos empilhados (um sobre o outro)"
                    >
                      <Rows2 size={13} />
                      <span>Empilhado</span>
                    </button>
                  </div>
                )}

                <div className="filter-label"><SlidersHorizontal size={14} /><span>Portêiner</span></div>
                <div className="segmented filter-portainer" role="group" aria-label="Filtrar portêiner">
                  <FilterButton selected={portainerFilter === "ALL"} onClick={() => setPortainerFilter("ALL")}>Todos</FilterButton>
                  {PORTAINER_IDS.map((id) => <FilterButton key={id} selected={portainerFilter === id} onClick={() => setPortainerFilter(id)}>{id}</FilterButton>)}
                </div>

                <button
                  type="button"
                  className="crane-toolbar-btn"
                  onClick={() => setShowChartsSection((v) => !v)}
                  title={showChartsSection ? "Recolher gráficos" : "Expandir gráficos"}
                >
                  {showChartsSection ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  <span>{showChartsSection ? "Recolher" : "Expandir"}</span>
                </button>
              </div>
            </div>

            {showChartsSection && (
              <>
                {hiddenVesselChartIds.length > 0 && (
                  <div className="hidden-cranes-bar hidden-vessels-bar">
                    <span><EyeOff size={11} /> Gráficos de navio fechados:</span>
                    {hiddenVesselChartIds.map((id) => {
                      const v = vessels.find((item) => item.id === id);
                      return (
                        <button
                          key={id}
                          type="button"
                          className="pill-restore"
                          onClick={() => restoreVesselChart(id)}
                          title={`Restaurar gráfico de ${v?.name ?? id}`}
                        >
                          <RotateCcw size={10} /> {v ? v.name : id}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="btn-restore-all"
                      onClick={restoreAllVesselCharts}
                    >
                      Restaurar todos os gráficos ({hiddenVesselChartIds.length})
                    </button>
                  </div>
                )}

                <div className={`vessel-charts-grid view-${isIndividualMode ? "1" : quayViewMode} layout-${chartsLayout}`}>
                  {vesselsToChart.length === 0 ? (
                    <div className="empty-chart-action-box" style={{ gridColumn: "1 / -1", margin: "10px 0" }}>
                      <div className="empty-chart-info">
                        <Ship size={26} className="empty-chart-ship-icon" />
                        <div>
                          <strong>Nenhum gráfico de navio ativo na área de trabalho</strong>
                          <p>
                            {vessels.length === 0
                              ? "Nenhum navio atracado. Adicione um novo navio na barra lateral para iniciar."
                              : "Todos os gráficos foram fechados. Use a barra de restauração acima para reexibir."}
                          </p>
                        </div>
                      </div>
                      {vessels.length === 0 && (
                        <button
                          type="button"
                          className="button button-primary btn-compact"
                          onClick={() => openVesselModal()}
                        >
                          <Plus size={13} /> Adicionar navio
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {vesselsToChart.map((vessel) => {
                        const assignedIds = PORTAINER_IDS.filter((id) => workPlans[id]?.vesselId === vessel.id);
                        const chartIds = portainerFilter === "ALL"
                          ? assignedIds
                          : assignedIds.filter((id) => id === portainerFilter);

                        return (
                          <article
                            key={vessel.id}
                            className={`panel line-panel ${draggedVesselId === vessel.id ? "is-dragging" : ""} ${dragOverVesselId === vessel.id && draggedVesselId !== vessel.id ? "is-drag-over" : ""}`}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", vessel.id);
                              setDraggedVesselId(vessel.id);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              if (dragOverVesselId !== vessel.id) {
                                setDragOverVesselId(vessel.id);
                              }
                            }}
                            onDragLeave={() => {
                              if (dragOverVesselId === vessel.id) {
                                setDragOverVesselId(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              handleVesselChartDrop(vessel.id, e);
                            }}
                            onDragEnd={() => {
                              setDraggedVesselId(null);
                              setDragOverVesselId(null);
                            }}
                          >
                            <div className="panel-heading">
                              <div className="vessel-panel-title">
                                <span className="panel-drag-handle" title="Arrastar para trocar a posição dos navios">
                                  <GripVertical size={14} />
                                </span>
                                <div>
                                  <h3>
                                    <Ship size={14} />
                                    <span>{formatVesselTitle(vessel)}</span>
                                  </h3>
                                  <p>
                                    Ritmo minuto a minuto <span className="panel-separator">·</span> {assignedIds.length > 0 ? assignedIds.join(", ") : "Sem guindaste"} <span className="panel-separator">·</span> MPH
                                  </p>
                                </div>
                              </div>
                              <div className="panel-actions-cluster">
                                <div className="segmented range-control" role="group" aria-label="Intervalo dos gráficos">
                                  {[15, 30, 60].map((minutes) => (
                                    <FilterButton key={minutes} selected={rangeMinutes === minutes} onClick={() => setRangeMinutes(minutes)}>
                                      {minutes} min
                                    </FilterButton>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  className="card-icon-btn card-close-btn"
                                  onClick={() => hideVesselChart(vessel.id)}
                                  title={`Fechar / Remover gráfico de ${vessel.name}`}
                                  aria-label={`Fechar gráfico de ${vessel.name}`}
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            </div>

                            {chartIds.length === 0 ? (
                              <div className="empty-chart-action-box">
                                <div className="empty-chart-info">
                                  <Ship size={24} className="empty-chart-ship-icon" />
                                  <div>
                                    <strong>Nenhum portêiner alocado em {vessel.name}</strong>
                                    <p>Este navio está atracado, mas não possui guindastes operando no momento.</p>
                                  </div>
                                </div>
                                <div className="empty-chart-buttons">
                                  <button
                                    type="button"
                                    className="button button-ghost btn-compact"
                                    onClick={() => hideVesselChart(vessel.id)}
                                    title="Fechar este card da tela"
                                  >
                                    <EyeOff size={12} /> Fechar da tela
                                  </button>
                                  {vessels.length > 1 && (
                                    <button
                                      type="button"
                                      className="button button-danger-ghost btn-compact"
                                      onClick={() => removeVesselCompletely(vessel.id)}
                                      title="Desatracar navio do terminal e remover do painel"
                                    >
                                      <Trash2 size={12} /> Desatracar navio
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="button button-secondary btn-compact"
                                    onClick={() => openVesselModal(vessel.id)}
                                    title="Escalar portêineres para este navio"
                                  >
                                    <Settings size={12} /> Escalar portêineres
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="line-legend">
                                  {chartIds.map((id) => (
                                    <span key={id}>
                                      <i style={{ background: PORTAINER_META[id].color }} />
                                      {id}
                                    </span>
                                  ))}
                                  <span className="legend-target"><i />Pedida 27 MPH</span>
                                  <span className="legend-stop-indicator">
                                    <i className="legend-stop-dot" />
                                    Ponto vermelho = Parada (clique para ver motivo)
                                  </span>
                                </div>

                                <Suspense fallback={<div className="chart-loading line-chart-wrap">Carregando gráfico de linha…</div>}>
                                  <PerformanceChart
                                    records={simulation.records}
                                    events={simulation.events}
                                    selected={chartIds}
                                    now={simulation.now}
                                    rangeMinutes={rangeMinutes}
                                    onResumePortainer={(id) => setSimulation((curr) => demoProductivitySource.resume(curr, id))}
                                  />
                                </Suspense>

                                <div className="chart-footnote">
                                  <span className="legend-target-mark" />
                                  A linha tracejada representa a meta (27 MPH). Pontos vermelhos indicam paralisações — clique neles para ver o motivo.
                                </div>
                              </>
                            )}
                          </article>
                        );
                      })}

                      {/* Vagas livres no cais (apenas exibidas em modo 2 ou 3 navios quando houver capacidade ociosa) */}
                      {emptyQuaySlotsCount > 0 && Array.from({ length: emptyQuaySlotsCount }).map((_, idx) => {
                        const slotNumber = vesselsToChart.length + idx + 1;
                        return (
                          <div
                            key={`quay-slot-${slotNumber}`}
                            className="quay-slot-placeholder-card"
                            onClick={() => openVesselModal()}
                            title={`Atracar navio na vaga ${slotNumber} do cais`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openVesselModal();
                              }
                            }}
                          >
                            <div className="quay-slot-placeholder-content">
                              <div className="quay-slot-icon-box">
                                <Anchor size={22} />
                              </div>
                              <div className="quay-slot-info">
                                <span className="quay-slot-badge">Vaga {slotNumber} de 3 do Cais</span>
                                <h4>Vaga Disponível no Cais</h4>
                                <p>O cais suporta até 3 navios em operação simultânea. Clique aqui para atracar e escalar portêineres nesta vaga.</p>
                              </div>
                              <button
                                type="button"
                                className="button button-primary btn-compact"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openVesselModal();
                                }}
                              >
                                <Plus size={13} /> Atracar navio
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </>
            )}
          </section>

          <section className="panel events-panel" id="ocorrencias">
            <div className="events-header">
              <div className="panel-heading events-title"><div><div className="section-kicker">CONTEXTO DE OPERAÇÃO</div><h3>Paradas e eventos</h3><p>Ocorrências inevitáveis que ajudam a contextualizar o ritmo</p></div></div>
              <div className="event-tools">
                <label className="event-filter-label" htmlFor="event-filter">Tipo de evento</label>
                <div className="select-wrap"><select id="event-filter" value={eventFilter} onChange={(event) => setEventFilter(event.target.value as StopType | "ALL")}><option value="ALL">Todos os tipos</option>{STOP_TYPES.map((type) => <option key={type} value={type}>{STOP_LABELS[type]}</option>)}</select><ChevronDown size={14} /></div>
                <button className="button button-add-event" onClick={openStopDialog} disabled={freePortainers.length === 0}><Plus size={15} /> Nova parada</button>
                <button
                  type="button"
                  className="crane-toolbar-btn"
                  onClick={() => setShowEventsSection((v) => !v)}
                  title={showEventsSection ? "Recolher paradas" : "Expandir paradas"}
                  style={{ marginLeft: "4px" }}
                >
                  {showEventsSection ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  <span>{showEventsSection ? "Recolher" : "Expandir"}</span>
                </button>
              </div>
            </div>
            {showEventsSection && (
              visibleEvents.length > 0 ? (
                <div className="events-table-wrap">
                  <table className="events-table">
                    <thead><tr><th>PORTÊINER</th><th>EVENTO / MOTIVO</th><th>INÍCIO</th><th>DURAÇÃO</th><th>STATUS</th><th><span className="sr-only">Ação</span></th></tr></thead>
                    <tbody>
                      {visibleEvents.map((event) => {
                        const active = event.endAt === null;
                        const durationEnd = event.endAt ?? simulation.now;
                        return (
                          <tr key={event.id} className={active ? "event-row-active" : ""}>
                            <td><span className="event-portainer" style={{ "--crane-color": PORTAINER_META[event.portainerId].color } as React.CSSProperties}>{event.portainerId}</span></td>
                            <td><div className="event-reason"><span className={`event-type-icon event-${event.type}`}><Timer size={14} /></span><strong>{STOP_LABELS[event.type]}</strong></div></td>
                            <td className="event-time">{formatShortTime(event.startAt)}</td>
                            <td className="event-duration">{formatDuration(event.startAt, durationEnd)}</td>
                            <td><span className={`event-status ${active ? "event-status-active" : "event-status-done"}`}><i />{active ? "Em andamento" : "Encerrada"}</span></td>
                            <td className="event-action-cell">{active && <button className="resume-button" onClick={() => setSimulation((current) => demoProductivitySource.resume(current, event.portainerId))}>Retomar <Check size={13} /></button>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="events-empty"><div className="empty-icon"><Bell size={18} /></div><strong>Nenhuma ocorrência neste filtro</strong><span>Registre uma parada simulada ou ajuste o tipo de evento.</span></div>
              )
            )}
            <div className="events-note"><CircleHelp size={14} /><span>A pedida de 27 MPH conta ciclos físicos, não contêineres ou TEUs. O tempo parado e a disponibilidade são exibidos separadamente para dar contexto à operação.</span></div>
          </section>

          <footer className="page-footer"><span><span className="footer-status-dot" /> Dados fictícios para demonstração</span><span>20 pés = 1 TEU <i /> 40 pés = 2 TEU <i /> Fonte corporativa: integração futura</span></footer>
        </div>
      </main>

      {showStopDialog && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowStopDialog(false); }}>
          <form className="stop-dialog" onSubmit={confirmStop} role="dialog" aria-modal="true" aria-labelledby="stop-dialog-title">
            <div className="dialog-header"><div className="dialog-icon"><Timer size={18} /></div><button type="button" className="icon-button" onClick={() => setShowStopDialog(false)} aria-label="Fechar"><X size={18} /></button></div>
            <div className="dialog-kicker">REGISTRO DE EVENTO SIMULADO</div>
            <h2 id="stop-dialog-title">Registrar parada</h2>
            <p>O portêiner ficará sinalizado como parado. Retome a operação para encerrar o evento.</p>
            <label htmlFor="stop-crane">Portêiner</label>
            <div className="select-wrap dialog-select"><select id="stop-crane" value={formPortainer} onChange={(event) => setFormPortainer(event.target.value as PortainerId)}>{freePortainers.map((id) => <option key={id} value={id}>{id} · {PORTAINER_META[id].name}</option>)}</select><ChevronDown size={14} /></div>
            <label htmlFor="stop-type">Motivo da parada</label>
            <div className="select-wrap dialog-select"><select id="stop-type" value={formStopType} onChange={(event) => setFormStopType(event.target.value as StopType)}>{STOP_TYPES.map((type) => <option key={type} value={type}>{STOP_LABELS[type]}</option>)}</select><ChevronDown size={14} /></div>
            <div className="dialog-note"><CircleHelp size={14} /><span>Esta ação altera apenas os dados desta demonstração.</span></div>
            <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setShowStopDialog(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={freePortainers.length === 0}><Plus size={15} /> Iniciar parada</button></div>
          </form>
        </div>
      )}

      {showReportDialog && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowReportDialog(false); }}>
          <section className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-dialog-title">
            <div className="dialog-header">
              <div className="report-dialog-icon"><FileText size={18} /></div>
              <button type="button" className="icon-button" onClick={() => setShowReportDialog(false)} aria-label="Fechar relatórios"><X size={18} /></button>
            </div>
            <div className="dialog-kicker">SÍNTESE PARA GESTORES</div>
            <h2 id="report-dialog-title">Relatório operacional</h2>
            <p>Gere uma fotografia da produtividade de P4–P9 com movimentos, TEUs, janelas de ritmo e paradas.</p>
            <div className="report-type-grid" role="group" aria-label="Tipo de relatório">
              <button type="button" className={`report-type-card ${report?.kind === "partial" ? "is-selected" : ""}`} onClick={() => generateReport("partial")} aria-pressed={report?.kind === "partial"}>
                <span><Clock3 size={15} /> Relatório parcial</span><small>Últimos {emailConfig.partialIntervalMinutes} min</small>
              </button>
              <button type="button" className={`report-type-card ${report?.kind === "final" ? "is-selected" : ""}`} onClick={() => generateReport("final")} aria-pressed={report?.kind === "final"}>
                <span><Activity size={15} /> Relatório final</span><small>Todo o histórico da faina</small>
              </button>
            </div>
            {report ? (
              <>
                <div className="report-period"><strong>{report.label} · {report.periodMinutes} min</strong><span>{formatShortTime(report.periodStart)}–{formatShortTime(report.periodEnd)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0 6px" }}>
                  <label className="report-field-label" htmlFor="report-recipients" style={{ margin: 0 }}>
                    E-mails dos gestores <span>(separe por vírgula)</span>
                  </label>
                  <button
                    type="button"
                    className="button-link-accent"
                    onClick={() => {
                      setShowReportDialog(false);
                      setShowEmailConfigModal(true);
                    }}
                    title="Abrir regras de automação e lista cadastrada"
                  >
                    <Settings size={12} /> Configurações de automação
                  </button>
                </div>
                <input className="report-input" id="report-recipients" type="text" autoComplete="email" placeholder="gestao@empresa.com, operacao@empresa.com" value={reportRecipients} onChange={(event) => setReportRecipients(event.target.value)} />
                <div className="report-email-note"><CircleHelp size={14} /><span>“Preparar e-mail” abre seu aplicativo com assunto e relatório preenchidos. Para anexar o PDF, baixe-o antes e anexe manualmente; revise e envie o e-mail por lá.</span></div>
                <textarea className="report-preview" aria-label="Prévia do conteúdo do relatório" readOnly value={report.text} />
                <div className="report-actions">
                  <button type="button" className="button button-secondary" onClick={() => void copyReport()}><Copy size={14} /> Copiar</button>
                  <button type="button" className="button button-secondary" onClick={downloadReport}><Download size={14} /> Baixar .txt</button>
                  <button type="button" className="button button-primary" disabled={pdfLoading} onClick={() => void downloadPdf()}><Download size={14} /> {pdfLoading ? "Gerando PDF…" : "Baixar PDF"}</button>
                  <button type="button" className="button button-secondary" disabled={!validRecipients} onClick={prepareEmail}><Mail size={14} /> Preparar e-mail</button>
                </div>
                {reportFeedback && <div className="report-feedback" role="status">{reportFeedback}</div>}
              </>
            ) : (
              <div className="report-empty"><FileText size={21} /><strong>Escolha o tipo de relatório</strong><span>Os dados simulados disponíveis serão consolidados para a prévia.</span></div>
            )}
          </section>
        </div>
      )}

      {showVesselModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeVesselModal();
          }}
        >
          <div className="vessel-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="vessel-dialog-title">
            <div className="dialog-header">
              <div className="dialog-icon"><Ship size={18} /></div>
              <button
                type="button"
                className="icon-button"
                onClick={closeVesselModal}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="dialog-kicker">
              {editingVessel ? "EDIÇÃO DE ESCALA DE PORTÊINERES" : "GESTÃO DE ATRACAÇÃO & ESCALA"}
            </div>
            <h2 id="vessel-dialog-title">
              {editingVessel
                ? `Editar Portêineres · ${editingVessel.name}`
                : "Adicionar Navio & Escalar Portêineres"}
            </h2>
            <p className="dialog-desc">
              {editingVessel
                ? `Ajuste quais portêineres vão operar em ${editingVessel.name} e suas respectivas metas de movimentos.`
                : "Selecione o navio e a viagem atracados no terminal. Em seguida, marque os portêineres que vão operar com suas respectivas metas de movimentos."}
            </p>

            {/* SEÇÃO 1: LISTA SUSPENSA DO NAVIO E VIAGEM */}
            <div className="modal-section-box">
              <div className="modal-section-header">
                <div>
                  <strong>Selecione o Navio e Viagem</strong>
                  <span>Escolha o navio na lista suspensa da escala ou digite um novo navio</span>
                </div>
              </div>

              <div className="vessel-dropdown-container">
                <label htmlFor="vessel-select-dropdown" className="vessel-dropdown-label">
                  <Ship size={14} /> Selecione o Navio e Viagem:
                </label>
                <div className="vessel-select-custom-wrapper">
                  <select
                    id="vessel-select-dropdown"
                    className="vessel-dropdown-select"
                    value={dropdownSelectionKey}
                    onChange={(e) => handleDropdownChange(e.target.value)}
                  >
                    <optgroup label="Navios Disponíveis na Escala / Atracados">
                      {CATALOG_VESSELS.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name} - {cat.voyage}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Outro Navio">
                      <option value="CUSTOM">+ Digitar outro navio manualmente...</option>
                    </optgroup>
                  </select>
                  <ChevronDown size={15} className="dropdown-caret" />
                </div>
              </div>

              {/* Informações do navio selecionado ou campos manuais */}
              {dropdownSelectionKey === "CUSTOM" ? (
                <div className="custom-vessel-form-grid">
                  <div className="custom-vessel-field">
                    <label htmlFor="custom-vessel-name">Nome do Navio:</label>
                    <input
                      id="custom-vessel-name"
                      type="text"
                      placeholder="Ex: CAP SAN LORENZO"
                      value={customVesselName}
                      onChange={(e) => setCustomVesselName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="custom-vessel-field">
                    <label htmlFor="custom-vessel-voyage">Viagem:</label>
                    <input
                      id="custom-vessel-voyage"
                      type="text"
                      placeholder="Ex: 742S-742S"
                      value={customVesselVoyage}
                      onChange={(e) => setCustomVesselVoyage(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="selected-vessel-meta-card">
                  <div className="meta-card-main">
                    <div className="meta-card-icon"><Ship size={18} /></div>
                    <div className="meta-card-text">
                      <div className="meta-card-vessel-name">
                        {activeModalVesselData.name} - {activeModalVesselData.voyage}
                      </div>
                      <div className="meta-card-sub">
                        <span className="meta-status-pill">🟢 Pronto para operação</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÃO 2: ALOCAÇÃO DE PORTÊINERES */}
            <div className="modal-section-box">
              <div className="modal-section-header">
                <div>
                  <strong>
                    Portêineres Escalados para:{" "}
                    <span className="highlight-vessel-name">
                      {dropdownSelectionKey === "CUSTOM"
                        ? customVesselName.trim() || "Navio Personalizado"
                        : `${activeModalVesselData.name} - ${activeModalVesselData.voyage}`}
                    </span>
                  </strong>
                  <span>Marque quais portêineres vão operar nesta faina e ajuste a meta de movimentos:</span>
                </div>

                <div className="crane-quick-presets">
                  <button
                    type="button"
                    className="preset-btn preset-btn-highlight"
                    onClick={applyPresetUserSimulation}
                    title="Cenário de simulação: P7 (178), P6 (154) e P9 (122)"
                  >
                    ⭐ P7 (178) · P6 (154) · P9 (122)
                  </button>
                  <button
                    type="button"
                    className="preset-btn"
                    onClick={applyPresetReferenceImage}
                    title="Cenário da imagem de referência: P6 (154) e P9 (148)"
                  >
                    P6 (154) · P9 (148)
                  </button>
                  <button
                    type="button"
                    className="preset-btn"
                    onClick={applyPresetAllCranes}
                  >
                    Todos (P4 a P9)
                  </button>
                  <button
                    type="button"
                    className="preset-btn"
                    onClick={clearAllCraneAllocations}
                  >
                    Desalocar todos
                  </button>
                </div>
              </div>

              {/* Grade de portêineres (P4 a P9) */}
              <div className="crane-allocation-grid">
                {PORTAINER_IDS.map((id) => {
                  const portainer = PORTAINER_META[id];
                  const isAllocated = tempAllocatedCranes[id]?.allocated ?? false;
                  const targetMoves = tempAllocatedCranes[id]?.targetMoves ?? 150;

                  return (
                    <div
                      key={id}
                      className={`crane-alloc-card ${isAllocated ? "is-working-here" : "is-standby"}`}
                      style={{ "--crane-color": portainer.color } as React.CSSProperties}
                      onClick={() => toggleCraneAlloc(id)}
                    >
                      <div className="crane-alloc-top">
                        <div className="crane-alloc-ident">
                          <span className="crane-alloc-badge">{id}</span>
                          <div>
                            <strong>{portainer.name}</strong>
                            <span className="crane-alloc-status-note">
                              {isAllocated ? "🟢 Operando no navio" : "⚪ Standby"}
                            </span>
                          </div>
                        </div>
                        <div className="crane-alloc-check-wrap">
                          <input
                            type="checkbox"
                            checked={isAllocated}
                            onChange={() => {}} // tratado no onClick do card
                            aria-label={`Alocar ${id}`}
                          />
                        </div>
                      </div>

                      {isAllocated ? (
                        <div
                          className="crane-alloc-body"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <label htmlFor={`moves-target-${id}`}>Movimentos programados</label>
                          <div className="target-input-row">
                            <input
                              id={`moves-target-${id}`}
                              type="number"
                              min="1"
                              step="10"
                              value={targetMoves}
                              onChange={(e) => updateCraneTargetVal(id, parseInt(e.target.value, 10))}
                            />
                            <span className="unit-label">mov</span>
                          </div>
                        </div>
                      ) : (
                        <div className="crane-alloc-standby-row">
                          <span>Clique para alocar neste navio</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Resumo da equipe */}
              <div className="allocation-summary-bar">
                <div className="alloc-stat-group">
                  <span>Portêineres escalados:</span>
                  <strong>
                    {allocatedCraneIds.length > 0
                      ? allocatedCraneIds.join(", ")
                      : "Nenhum guindaste escalado"}
                  </strong>
                </div>
                <div className="alloc-stat-group">
                  <span>Total programado navio:</span>
                  <strong>{totalAllocatedTargetMoves} movimentos</strong>
                </div>
              </div>
            </div>

            {/* AÇÕES DO MODAL */}
            <div className="dialog-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={closeVesselModal}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={confirmAndActivateVessel}
                disabled={dropdownSelectionKey === "CUSTOM" && !customVesselName.trim()}
              >
                <Check size={15} /> {editingVessel ? "Salvar Alterações" : "Confirmar e Ativar Navio"}
              </button>
            </div>
          </div>
        </div>
      )}

      <EmailConfigModal
        isOpen={showEmailConfigModal}
        config={emailConfig}
        onClose={() => setShowEmailConfigModal(false)}
        onSave={(newConfig) => {
          setEmailConfig(newConfig);
          saveEmailConfig(newConfig);
          setReportRecipients(newConfig.recipients.join(", "));
        }}
        onTestEmail={(testRecipients) => {
          sendReportDirectEmail("partial", testRecipients);
        }}
      />

      {promptModalData?.isOpen && (
        <EmailPromptModal
          isOpen={promptModalData.isOpen}
          kind={promptModalData.kind}
          vesselName={promptModalData.vesselName}
          periodMinutes={promptModalData.periodMinutes}
          moves={promptModalData.moves}
          teu={promptModalData.teu}
          averageMph={promptModalData.averageMph}
          recipients={emailConfig.recipients}
          onConfirm={() => {
            sendReportDirectEmail(promptModalData.kind);
            setPromptModalData(null);
          }}
          onDismiss={() => {
            setPromptModalData(null);
          }}
        />
      )}
    </div>
  );
}

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
  detail: string;
  accent: "teal" | "blue" | "amber";
}

function SummaryCard({ icon, label, value, suffix, detail, accent }: SummaryCardProps) {
  return (
    <article className={`summary-card accent-${accent}`}>
      <div className="summary-card-top"><span className="summary-icon">{icon}</span><span className="summary-label">{label}</span></div>
      <div className="summary-value">{value}{suffix && <span>{suffix}</span>}</div>
      <div className="summary-detail">{detail}</div>
    </article>
  );
}

interface FilterButtonProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function FilterButton({ selected, onClick, children }: FilterButtonProps) {
  return <button className={`segmented-option ${selected ? "is-selected" : ""}`} onClick={onClick} aria-pressed={selected}>{children}</button>;
}

export default App;
