import { jsPDF } from "jspdf";
import {
  PORTAINER_IDS,
  PORTAINER_META,
  STOP_LABELS,
  TARGET_MOVES_PER_HOUR,
  type PortainerId,
  type StopType,
} from "./model";
import type { ProductivityReport, ProductivityWindow } from "./reports";

type RGB = [number, number, number];

const PAGE_WIDTH = 297;
const PAGE_HEIGHT = 210;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const COLORS = {
  navy: [11, 29, 43] as RGB,
  ink: [31, 48, 61] as RGB,
  muted: [102, 119, 132] as RGB,
  line: [220, 228, 233] as RGB,
  pale: [246, 249, 250] as RGB,
  teal: [43, 164, 148] as RGB,
  amber: [201, 143, 54] as RGB,
  red: [194, 83, 88] as RGB,
  white: [255, 255, 255] as RGB,
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const timeFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function rgbFromHex(hex: string): RGB {
  const clean = hex.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function fmtDate(timestamp: number): string {
  return dateFormatter.format(new Date(timestamp));
}

function fmtTime(timestamp: number): string {
  return timeFormatter.format(new Date(timestamp));
}

function fmtMph(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtMinutes(value: number): string {
  const minutes = Math.max(0, Math.round(value));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")} min`;
}

function setFont(doc: jsPDF, size: number, color: RGB = COLORS.ink, bold = false): void {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
}

function writeText(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  size: number,
  color: RGB = COLORS.ink,
  bold = false,
  align: "left" | "center" | "right" = "left",
): void {
  setFont(doc, size, color, bold);
  doc.text(value, x, y, { align });
}

function writeWrapped(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  width: number,
  size: number,
  color: RGB = COLORS.ink,
  lineHeight = 3.8,
): number {
  setFont(doc, size, color);
  const lines = doc.splitTextToSize(value, width) as string[];
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function drawPanel(doc: jsPDF, x: number, y: number, width: number, height: number): void {
  doc.setFillColor(COLORS.white[0], COLORS.white[1], COLORS.white[2]);
  doc.setDrawColor(COLORS.line[0], COLORS.line[1], COLORS.line[2]);
  doc.setLineWidth(0.25);
  doc.rect(x, y, width, height, "FD");
}

function drawHeader(doc: jsPDF, report: ProductivityReport, section: string): void {
  doc.setFillColor(COLORS.navy[0], COLORS.navy[1], COLORS.navy[2]);
  doc.rect(0, 0, PAGE_WIDTH, 29, "F");
  writeText(doc, "PORTLINE  /  PAINEL OPERACIONAL", MARGIN, 8, 7.2, [116, 222, 207], true);
  writeText(doc, `RELATÓRIO ${report.label.toUpperCase()}  |  ${section.toUpperCase()}`, MARGIN, 17, 14, COLORS.white, true);
  writeText(doc, "DADOS FICTÍCIOS", PAGE_WIDTH - MARGIN, 9, 7.2, [238, 188, 104], true, "right");
  writeText(
    doc,
    `${fmtDate(report.periodStart)} - ${fmtDate(report.periodEnd)}  |  ${report.periodMinutes} minutos  |  Meta ${TARGET_MOVES_PER_HOUR} MPH por portêiner`,
    MARGIN,
    24,
    7.5,
    [194, 207, 216],
  );
}

function drawFooter(doc: jsPDF): void {
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(COLORS.line[0], COLORS.line[1], COLORS.line[2]);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, 202, PAGE_WIDTH - MARGIN, 202);
    writeText(doc, "Portline | Relatório demonstrativo | Não representa conexão ao banco corporativo", MARGIN, 207, 6.4, COLORS.muted);
    writeText(doc, `${page}/${totalPages}`, PAGE_WIDTH - MARGIN, 207, 6.4, COLORS.muted, false, "right");
  }
}

function drawKpis(doc: jsPDF, report: ProductivityReport): void {
  const items = [
    { label: "MOVIMENTOS", value: String(report.totalMoves) },
    { label: "TEU MOVIMENTADOS", value: String(report.totalTeu) },
    { label: "MPH MÉDIO / PORTÊINER", value: fmtMph(report.averageMph) },
    { label: "NA / ACIMA DA META", value: `${report.onTargetCount}/${report.cranes.length}` },
    { label: "TEMPO EM PARADA", value: fmtMinutes(report.totalStopMinutes) },
  ];
  const gap = 2;
  const width = (CONTENT_WIDTH - gap * (items.length - 1)) / items.length;
  const y = 34;
  const height = 23;
  items.forEach((item, index) => {
    const x = MARGIN + index * (width + gap);
    doc.setFillColor(COLORS.pale[0], COLORS.pale[1], COLORS.pale[2]);
    doc.setDrawColor(COLORS.line[0], COLORS.line[1], COLORS.line[2]);
    doc.rect(x, y, width, height, "FD");
    writeText(doc, item.label, x + 3, y + 6, 5.9, COLORS.muted, true);
    writeText(doc, item.value, x + 3, y + 17, item.value.length > 10 ? 10 : 13, COLORS.ink, true);
  });
}

function drawSectionTitle(doc: jsPDF, title: string, x: number, y: number, size = 7.2): void {
  writeText(doc, title, x, y, size, COLORS.ink, true);
}

function drawDashedHorizontal(doc: jsPDF, x: number, y: number, width: number, color: RGB): void {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.45);
  for (let offset = 0; offset < width; offset += 4) {
    doc.line(x + offset, y, x + Math.min(offset + 2.2, width), y);
  }
}

function drawTimelineChart(doc: jsPDF, report: ProductivityReport, x: number, y: number, width: number, height: number): void {
  drawPanel(doc, x, y, width, height);
  drawSectionTitle(doc, "EVOLUÇÃO DO RITMO (MPH)  |  MÉDIA MÓVEL DE 15 MIN", x + 5, y + 8, 6.8);
  const plotX = x + 14;
  const plotY = y + 18;
  const plotWidth = width - 22;
  const plotHeight = 43;
  const plotBottom = plotY + plotHeight;
  const maximum = Math.max(45, Math.ceil(Math.max(0, ...report.timeline.flatMap((point) => PORTAINER_IDS.map((id) => point.mphByPortainer[id]))) / 15) * 15);
  const tickStep = maximum > 60 ? maximum / 4 : 15;

  for (let value = 0; value <= maximum; value += tickStep) {
    const pointY = plotBottom - (value / maximum) * plotHeight;
    doc.setDrawColor(COLORS.line[0], COLORS.line[1], COLORS.line[2]);
    doc.setLineWidth(0.2);
    doc.line(plotX, pointY, plotX + plotWidth, pointY);
    writeText(doc, String(Math.round(value)), x + 3, pointY + 1.5, 5.7, COLORS.muted, false, "right");
  }

  const targetY = plotBottom - (TARGET_MOVES_PER_HOUR / maximum) * plotHeight;
  drawDashedHorizontal(doc, plotX, targetY, plotWidth, COLORS.red);
  writeText(doc, `META ${TARGET_MOVES_PER_HOUR}`, plotX + plotWidth - 2, targetY - 1.3, 5.4, COLORS.red, true, "right");

  const count = report.timeline.length;
  if (count > 1) {
    PORTAINER_IDS.forEach((portainerId) => {
      const color = rgbFromHex(PORTAINER_META[portainerId].color);
      doc.setDrawColor(color[0], color[1], color[2]);
      doc.setLineWidth(0.65);
      for (let index = 1; index < count; index += 1) {
        const previous = report.timeline[index - 1];
        const current = report.timeline[index];
        const x1 = plotX + ((index - 1) / (count - 1)) * plotWidth;
        const x2 = plotX + (index / (count - 1)) * plotWidth;
        const y1 = plotBottom - (previous.mphByPortainer[portainerId] / maximum) * plotHeight;
        const y2 = plotBottom - (current.mphByPortainer[portainerId] / maximum) * plotHeight;
        doc.line(x1, y1, x2, y2);
      }
    });

    const timeIndices = [...new Set([0, Math.floor((count - 1) / 3), Math.floor(((count - 1) * 2) / 3), count - 1])];
    timeIndices.forEach((index) => {
      const point = report.timeline[index];
      const pointX = plotX + (index / (count - 1)) * plotWidth;
      writeText(doc, fmtTime(point.timestamp), pointX, plotBottom + 6, 5.8, COLORS.muted, false, index === 0 ? "left" : index === count - 1 ? "right" : "center");
    });
  }

  const legendSpacing = (width - 18) / PORTAINER_IDS.length;
  PORTAINER_IDS.forEach((portainerId, index) => {
    const legendX = x + 7 + index * legendSpacing;
    const color = rgbFromHex(PORTAINER_META[portainerId].color);
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(1.1);
    doc.line(legendX, y + height - 5, legendX + 5, y + height - 5);
    writeText(doc, portainerId, legendX + 7, y + height - 3.7, 5.8, COLORS.muted, true);
  });
}

function drawComparisonChart(doc: jsPDF, report: ProductivityReport, x: number, y: number, width: number, height: number): void {
  drawPanel(doc, x, y, width, height);
  drawSectionTitle(doc, "RITMO POR PORTÊINER", x + 5, y + 8, 6.8);
  const plotX = x + 10;
  const plotY = y + 19;
  const plotWidth = width - 17;
  const plotHeight = 47;
  const bottom = plotY + plotHeight;
  const maxValue = Math.max(40, Math.ceil(Math.max(...report.cranes.map((crane) => crane.mph)) / 10) * 10);
  [0, 10, 20, 30, 40].filter((tick) => tick <= maxValue).forEach((tick) => {
    const lineY = bottom - (tick / maxValue) * plotHeight;
    doc.setDrawColor(COLORS.line[0], COLORS.line[1], COLORS.line[2]);
    doc.setLineWidth(0.2);
    doc.line(plotX, lineY, plotX + plotWidth, lineY);
  });

  const targetY = bottom - (TARGET_MOVES_PER_HOUR / maxValue) * plotHeight;
  drawDashedHorizontal(doc, plotX, targetY, plotWidth, COLORS.red);
  const slotWidth = plotWidth / report.cranes.length;
  report.cranes.forEach((crane, index) => {
    const center = plotX + slotWidth * (index + 0.5);
    const barWidth = Math.min(8, slotWidth * 0.55);
    const barHeight = Math.max(0.5, (crane.mph / maxValue) * plotHeight);
    const color = rgbFromHex(PORTAINER_META[crane.portainerId]?.color ?? "#57d8c5");
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(center - barWidth / 2, bottom - barHeight, barWidth, barHeight, "F");
    writeText(doc, fmtMph(crane.mph), center, bottom - barHeight - 2, 5.4, COLORS.ink, true, "center");
    writeText(doc, crane.portainerId, center, bottom + 6, 5.8, COLORS.muted, true, "center");
  });
  doc.setDrawColor(COLORS.red[0], COLORS.red[1], COLORS.red[2]);
  doc.setLineWidth(0.6);
  doc.line(x + 7, y + height - 5, x + 13, y + height - 5);
  writeText(doc, `Pedida ${TARGET_MOVES_PER_HOUR} MPH`, x + 15, y + height - 3.7, 5.8, COLORS.muted);
}

function drawCraneSummary(doc: jsPDF, report: ProductivityReport): void {
  drawSectionTitle(doc, "RESUMO POR PORTÊINER  |  MOVIMENTOS E TEU SÃO CONTADORES SEPARADOS", MARGIN, 163, 6.8);
  const columns = [MARGIN, 52, 91, 119, 151, 186, 225, 255];
  const headers = ["PORTÊINER", "MOVIMENTOS", "TEU", "MPH", "DELTA META", "DISPONIB.", "STATUS"];
  headers.forEach((label, index) => writeText(doc, label, columns[index], 170.5, 6, COLORS.muted, true));
  doc.setDrawColor(COLORS.line[0], COLORS.line[1], COLORS.line[2]);
  doc.line(MARGIN, 172.5, PAGE_WIDTH - MARGIN, 172.5);

  const rowHeight = report.cranes.length > 4 ? 3.9 : 4.7;
  const startY = 177.5;

  report.cranes.forEach((crane, index) => {
    const y = startY + index * rowHeight;
    const delta = crane.mph - TARGET_MOVES_PER_HOUR;
    const color = rgbFromHex(PORTAINER_META[crane.portainerId]?.color ?? "#57d8c5");
    writeText(doc, crane.portainerId, columns[0], y, 6.3, color, true);
    writeText(doc, String(crane.moves), columns[1], y, 6.3);
    writeText(doc, String(crane.teu), columns[2], y, 6.3);
    writeText(doc, `${fmtMph(crane.mph)} MPH`, columns[3], y, 6.3);
    writeText(doc, `${delta >= 0 ? "+" : "-"}${fmtMph(Math.abs(delta))}`, columns[4], y, 6.3, delta >= 0 ? COLORS.teal : COLORS.red);
    writeText(doc, `${crane.availabilityPercent.toFixed(0)}%`, columns[5], y, 6.3);
    writeText(doc, crane.belowTarget ? "ABAIXO" : "NA META", columns[6], y, 6.3, crane.belowTarget ? COLORS.red : COLORS.teal, true);
  });
}

function shortReason(type: StopType): string {
  if (type === "plug") return "Retirada de tampão";
  if (type === "vessel") return "Espera por outro navio";
  return "Demora de carreta";
}

function drawStopReasonChart(doc: jsPDF, report: ProductivityReport, x: number, y: number, width: number, height: number): void {
  drawPanel(doc, x, y, width, height);
  drawSectionTitle(doc, "PARADAS POR MOTIVO", x + 5, y + 8);
  const maxMinutes = Math.max(1, ...report.stopReasons.map((reason) => reason.totalMinutes));
  report.stopReasons.forEach((reason, index) => {
    const rowY = y + 19 + index * 8;
    writeText(doc, shortReason(reason.type), x + 5, rowY, 6.1, COLORS.muted);
    const barX = x + 52;
    const barWidth = (reason.totalMinutes / maxMinutes) * (width - 83);
    if (barWidth > 0) {
      doc.setFillColor(COLORS.amber[0], COLORS.amber[1], COLORS.amber[2]);
      doc.rect(barX, rowY - 3.2, barWidth, 3.4, "F");
    }
    writeText(doc, `${reason.totalMinutes} min`, x + width - 5, rowY, 6, COLORS.ink, true, "right");
  });
}

function drawWindowList(
  doc: jsPDF,
  title: string,
  windows: ProductivityWindow[],
  x: number,
  y: number,
  width: number,
  height: number,
  isLow: boolean,
): void {
  drawPanel(doc, x, y, width, height);
  drawSectionTitle(doc, title, x + 5, y + 8, 6.6);
  if (windows.length === 0) {
    writeText(doc, isLow ? "Nenhuma janela abaixo da pedida." : "Sem dados suficientes.", x + 5, y + 19, 6.5, COLORS.muted);
    return;
  }
  const rowHeight = windows.length > 6 ? 6.2 : 7;
  windows.forEach((window, index) => {
    const rowY = y + 16 + index * rowHeight;
    const color = isLow ? COLORS.red : rgbFromHex(PORTAINER_META[window.portainerId].color);
    writeText(doc, window.portainerId, x + 5, rowY, 6.2, color, true);
    writeText(doc, `${fmtTime(window.startAt)}-${fmtTime(window.endAt)}`, x + 21, rowY, 6, COLORS.muted);
    writeText(doc, `${fmtMph(window.mph)} MPH`, x + width - 5, rowY, 6.1, color, true, "right");
  });
}

function drawBottlenecks(doc: jsPDF, report: ProductivityReport, x: number, y: number, width: number, height: number): void {
  drawPanel(doc, x, y, width, height);
  drawSectionTitle(doc, "GARGALOS / OBSERVAÇÕES", x + 5, y + 8, 6.6);
  if (report.bottlenecks.length === 0) {
    writeText(doc, "Sem gargalo destacado neste período.", x + 5, y + 17, 6, COLORS.muted);
    return;
  }
  let nextY = y + 15;
  const maxY = y + height - 4;
  for (const note of report.bottlenecks) {
    if (nextY >= maxY) break;
    nextY = writeWrapped(doc, `- ${note}`, x + 5, nextY, width - 10, 5.8, COLORS.ink, 3.5) + 0.8;
  }
}

function drawStopDetails(doc: jsPDF, report: ProductivityReport): void {
  let y = 170;

  const renderTableHeader = (currentY: number): number => {
    writeText(doc, "PORTÊINER", MARGIN, currentY, 5.8, COLORS.muted, true);
    writeText(doc, "MOTIVO", 36, currentY, 5.8, COLORS.muted, true);
    writeText(doc, "INÍCIO", 166, currentY, 5.8, COLORS.muted, true);
    writeText(doc, "DURAÇÃO", 216, currentY, 5.8, COLORS.muted, true);
    writeText(doc, "SITUAÇÃO", 252, currentY, 5.8, COLORS.muted, true);
    return currentY + 3.5;
  };

  drawSectionTitle(doc, "OCORRÊNCIAS DETALHADAS", MARGIN, 163, 7);
  y = renderTableHeader(y);

  if (report.stopDetails.length === 0) {
    writeText(doc, "Nenhuma parada registrada no período analisado.", MARGIN, y + 3, 6.3, COLORS.muted);
    return;
  }

  report.stopDetails.forEach(({ event, durationMinutes }, index) => {
    if (y > 195) {
      doc.addPage();
      drawHeader(doc, report, "CONTINUAÇÃO DAS PARADAS");
      y = renderTableHeader(38);
    }
    const rowY = y + 2.2;
    if (index % 2 === 0) {
      doc.setFillColor(COLORS.pale[0], COLORS.pale[1], COLORS.pale[2]);
      doc.rect(MARGIN, y - 1.2, CONTENT_WIDTH, 4.5, "F");
    }
    const color = rgbFromHex(PORTAINER_META[event.portainerId].color);
    writeText(doc, event.portainerId, MARGIN, rowY, 5.9, color, true);
    writeText(doc, STOP_LABELS[event.type], 36, rowY, 5.8, COLORS.ink);
    writeText(doc, fmtDate(event.startAt), 166, rowY, 5.8, COLORS.muted);
    writeText(doc, fmtMinutes(durationMinutes), 216, rowY, 5.8, COLORS.ink);
    writeText(doc, event.endAt === null ? "Em andamento" : "Encerrada", 252, rowY, 5.8, event.endAt === null ? COLORS.amber : COLORS.muted);
    y += 4.5;
  });
}

function localFileStamp(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

export function buildProductivityPdf(report: ProductivityReport): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: `Portline - Relatório ${report.label}`,
    subject: "Produtividade do navio em MPH, volume em TEU e ocorrências simuladas",
    author: "Portline",
    creator: "Painel de Produtividade Portuária",
  });

  drawHeader(doc, report, "VISÃO GERAL");
  drawKpis(doc, report);
  drawTimelineChart(doc, report, MARGIN, 62, 176, 91);
  drawComparisonChart(doc, report, 193, 62, 90, 91);
  drawCraneSummary(doc, report);

  doc.addPage();
  drawHeader(doc, report, "PARADAS E DIAGNÓSTICO");
  drawStopReasonChart(doc, report, MARGIN, 35, 132, 48);
  drawWindowList(doc, "MELHORES JANELAS (15 MIN)", report.highWindows, MARGIN, 87, 132, 51, false);
  drawWindowList(doc, `JANELAS ABAIXO DE ${TARGET_MOVES_PER_HOUR} MPH`, report.lowWindows, 151, 35, 132, 84, true);
  drawBottlenecks(doc, report, 151, 122, 132, 33);
  drawStopDetails(doc, report);
  drawFooter(doc);
  return doc;
}

export function downloadProductivityPdf(report: ProductivityReport): void {
  const doc = buildProductivityPdf(report);
  doc.save(`portline-relatorio-${report.kind}-${localFileStamp(report.generatedAt)}.pdf`);
}
