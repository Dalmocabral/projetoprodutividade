import { useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  MINUTE_MS,
  PORTAINER_META,
  STOP_LABELS,
  TARGET_MOVES_PER_HOUR,
  type MinuteRecord,
  type PortainerId,
  type StopEvent,
  type StopType,
} from "../domain/model";

interface PerformanceChartProps {
  records: MinuteRecord[];
  selected: PortainerId[];
  now: number;
  rangeMinutes: number;
  events?: StopEvent[];
  onResumePortainer?: (id: PortainerId) => void;
}

interface LinePoint {
  time: string;
  timestamp: number;
  target: number;
  stops?: Record<string, StopEvent>;
  [key: string]: any;
}

interface CandlePoint {
  start: number;
  end: number;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

function formatTime(timestamp: number): string {
  return timeFormatter.format(new Date(timestamp));
}

function rollingMph(
  records: MinuteRecord[],
  index: number,
  portainerId: PortainerId,
  period = 15,
): number {
  const samples = records.slice(Math.max(0, index - period + 1), index + 1);
  if (samples.length === 0) return 0;
  const moves = samples.reduce((sum, sample) => sum + (sample.byPortainer[portainerId]?.moves ?? 0), 0);
  return (moves / samples.length) * 60;
}

function makeLineData(
  records: MinuteRecord[],
  selected: PortainerId[],
  now: number,
  rangeMinutes: number,
  events: StopEvent[] = [],
): LinePoint[] {
  if (selected.length === 0 || records.length === 0) return [];
  const cutoff = now - (rangeMinutes - 1) * MINUTE_MS;
  return records.flatMap((record, index) => {
    if (record.timestamp < cutoff || record.timestamp > now) return [];
    const pointStops: Record<string, StopEvent> = {};

    selected.forEach((id) => {
      // 1. Verificar se há evento registrado para este portêiner neste ponto
      const matchingEvent = events.find((e) => {
        if (e.portainerId !== id) return false;
        // Ponto de início da parada (tolerância de 1 minuto)
        if (Math.abs(e.startAt - record.timestamp) < MINUTE_MS) return true;
        // Ponto atual se a parada estiver em andamento (ativa agora)
        if (e.endAt === null && Math.abs(now - record.timestamp) < MINUTE_MS) return true;
        // Se a parada começou antes da janela visível mas continua ativa, marcar no primeiro minuto visível
        if (
          e.startAt < cutoff &&
          Math.abs(cutoff - record.timestamp) < MINUTE_MS &&
          (e.endAt === null || e.endAt >= cutoff)
        ) {
          return true;
        }
        return false;
      });

      if (matchingEvent) {
        pointStops[id] = matchingEvent;
      } else {
        const sampleStop = record.byPortainer[id]?.stop;
        if (sampleStop) {
          pointStops[id] = {
            id: `stop-${id}-${record.timestamp}`,
            portainerId: id,
            type: sampleStop,
            startAt: record.timestamp,
            endAt: null,
          };
        }
      }
    });

    const point: LinePoint = {
      time: formatTime(record.timestamp),
      timestamp: record.timestamp,
      target: TARGET_MOVES_PER_HOUR,
      stops: pointStops,
    };
    selected.forEach((id) => {
      point[id] = Number(rollingMph(records, index, id).toFixed(1));
    });
    return [point];
  });
}

function makeCandles(
  records: MinuteRecord[],
  selected: PortainerId[],
  now: number,
  rangeMinutes: number,
): CandlePoint[] {
  if (selected.length === 0 || records.length === 0) return [];
  const cutoff = now - (rangeMinutes - 1) * MINUTE_MS;
  const buckets = new Map<number, number[]>();

  records.forEach((record, index) => {
    if (record.timestamp < cutoff || record.timestamp > now) return;
    const average = selected.reduce((sum, id) => sum + rollingMph(records, index, id), 0) / selected.length;
    const bucket = Math.floor(record.timestamp / (5 * MINUTE_MS)) * (5 * MINUTE_MS);
    const values = buckets.get(bucket) ?? [];
    values.push(average);
    buckets.set(bucket, values);
  });

  return [...buckets.entries()].map(([start, values]) => {
    const end = Math.min(start + 5 * MINUTE_MS, now + MINUTE_MS);
    return {
      start,
      end,
      label: `${formatTime(start)}–${formatTime(end)}`,
      open: values[0] ?? 0,
      high: values.length > 0 ? Math.max(...values) : 0,
      low: values.length > 0 ? Math.min(...values) : 0,
      close: values[values.length - 1] ?? 0,
    };
  });
}

export function PerformanceChart({
  records,
  selected,
  now,
  rangeMinutes,
  events = [],
  onResumePortainer,
}: PerformanceChartProps) {
  const [selectedStop, setSelectedStop] = useState<{
    stop: StopEvent;
    portainerId: PortainerId;
    cx: number;
    cy: number;
    value: number;
    time: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const data = useMemo(
    () => makeLineData(records, selected, now, rangeMinutes, events),
    [records, selected, now, rangeMinutes, events],
  );
  const interval = Math.max(0, Math.floor(data.length / 8) - 1);

  if (data.length === 0) {
    return <div className="chart-loading line-chart-wrap">Sem dados para exibição no gráfico de linha.</div>;
  }

  // Renderizador do ponto vermelho interativo de paralisação (fixo, sem piscar)
  const renderDot = (dotProps: any, portainerId: PortainerId) => {
    const { cx, cy, payload } = dotProps;
    if (cx == null || cy == null || !payload) return null;

    const stopEvent: StopEvent | undefined = payload.stops?.[portainerId];
    if (!stopEvent) return null;

    const isSelected = selectedStop?.stop.id === stopEvent.id && selectedStop?.portainerId === portainerId;

    return (
      <g
        key={`stop-dot-${portainerId}-${payload.timestamp}`}
        className={`chart-stop-dot-marker ${isSelected ? "is-selected" : ""}`}
        style={{ cursor: "pointer", pointerEvents: "all" }}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedStop({
            stop: stopEvent,
            portainerId,
            cx,
            cy,
            value: Number(payload[portainerId] || 0),
            time: payload.time,
          });
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setSelectedStop({
            stop: stopEvent,
            portainerId,
            cx,
            cy,
            value: Number(payload[portainerId] || 0),
            time: payload.time,
          });
        }}
      >
        {/* Área transparente de clique ampliada para facilitar o clique */}
        <circle cx={cx} cy={cy} r={14} fill="transparent" />

        {/* Ponto vermelho principal fixo (sem animação de piscar) com borda branca e sombra */}
        <circle
          cx={cx}
          cy={cy}
          r={isSelected ? 7.5 : 6}
          fill="#ef4444"
          stroke="#ffffff"
          strokeWidth={isSelected ? 2.5 : 1.8}
          style={{ filter: "drop-shadow(0 0 5px rgba(239, 68, 68, 0.8))" }}
        />

        {/* Miolo branco interno */}
        <circle cx={cx} cy={cy} r={2} fill="#ffffff" />
      </g>
    );
  };

  return (
    <div
      ref={containerRef}
      className="line-chart-wrap"
      aria-label="Gráfico de linha do ritmo em movimentos por hora"
      style={{ position: "relative" }}
      onClick={() => setSelectedStop(null)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 16, bottom: 2, left: -16 }}>
          <CartesianGrid stroke="rgba(158, 181, 199, 0.10)" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: "#71869a", fontSize: 10, fontFamily: "inherit" }}
            tickLine={false}
            axisLine={{ stroke: "rgba(158, 181, 199, 0.15)" }}
            interval={interval}
            minTickGap={24}
          />
          <YAxis
            domain={[0, 45]}
            ticks={[0, 10, 20, 27, 35, 45]}
            tick={{ fill: "#71869a", fontSize: 10, fontFamily: "inherit" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `${value}`}
          />
          <Tooltip
            cursor={{ stroke: "rgba(155, 180, 199, 0.24)", strokeDasharray: "3 3" }}
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              const pointData = payload[0]?.payload as LinePoint | undefined;
              const pointStops = pointData?.stops || {};
              const stopEntries = Object.entries(pointStops);

              return (
                <div className="custom-chart-tooltip">
                  <div className="tooltip-header">Horário · {label}</div>
                  <div className="tooltip-list">
                    {payload.map((entry) => (
                      <div key={entry.name} className="tooltip-item" style={{ color: entry.color }}>
                        <span>{entry.name}:</span>
                        <strong>{Number(entry.value).toFixed(1)} MPH</strong>
                      </div>
                    ))}
                  </div>

                  {stopEntries.length > 0 && (
                    <div className="tooltip-stops-section">
                      {stopEntries.map(([pId, st]) => (
                        <div key={pId} className="tooltip-stop-badge">
                          <span className="tooltip-stop-dot" />
                          <span>
                            <strong>{pId} Parado:</strong> {STOP_LABELS[st.type as StopType]}
                          </span>
                        </div>
                      ))}
                      <small className="tooltip-stop-hint">Clique no ponto vermelho para detalhes</small>
                    </div>
                  )}
                </div>
              );
            }}
          />
          <ReferenceLine
            y={TARGET_MOVES_PER_HOUR}
            stroke="#edbd68"
            strokeDasharray="5 5"
            strokeWidth={1.5}
            label={{ value: "PEDIDA 27 MPH", position: "insideTopRight", fill: "#edbd68", fontSize: 10 }}
          />
          {selected.map((id) => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              name={id}
              stroke={PORTAINER_META[id].color}
              strokeWidth={2.3}
              dot={(dotProps) => renderDot(dotProps, id)}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Popover interativo com detalhes da paralisação quando o ponto vermelho for clicado */}
      {selectedStop && (() => {
        const isEnded = selectedStop.stop.endAt !== null;
        const idleMinutes = isEnded
          ? Math.max(1, Math.round((selectedStop.stop.endAt! - selectedStop.stop.startAt) / MINUTE_MS))
          : Math.max(1, Math.round((now - selectedStop.stop.startAt) / MINUTE_MS));

        const idleFormatted = idleMinutes >= 60
          ? `${Math.floor(idleMinutes / 60)}h ${idleMinutes % 60}m`
          : `${idleMinutes} min`;

        return (
          <div
            className="stop-info-popover"
            style={{
              left: Math.max(8, Math.min(selectedStop.cx - 120, (containerRef.current?.clientWidth || 400) - 250)),
              top: selectedStop.cy > 135 ? Math.max(8, selectedStop.cy - 165) : selectedStop.cy + 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="stop-popover-header">
              <div className="stop-popover-badge">
                <span className="stop-pulse-dot" />
                <strong>PARADA REGISTRADA</strong>
              </div>
              <button
                type="button"
                className="stop-popover-close-btn"
                onClick={() => setSelectedStop(null)}
                aria-label="Fechar informações da parada"
              >
                <X size={12} />
              </button>
            </div>

            <div className="stop-popover-body">
              <div className="stop-popover-field">
                <span className="stop-popover-label">Portêiner:</span>
                <span className="stop-popover-crane">
                  <strong style={{ color: PORTAINER_META[selectedStop.portainerId]?.color }}>
                    {selectedStop.portainerId}
                  </strong>
                  {" · "}
                  {PORTAINER_META[selectedStop.portainerId]?.name}
                </span>
              </div>

              <div className="stop-popover-field">
                <span className="stop-popover-label">Tipo de Paralisação:</span>
                <strong className="stop-popover-type-name">
                  {STOP_LABELS[selectedStop.stop.type]}
                </strong>
              </div>

              <div className="stop-popover-field">
                <span className="stop-popover-label">Início da Parada:</span>
                <span className="stop-popover-time">
                  {formatTime(selectedStop.stop.startAt)}
                </span>
              </div>

              <div className="stop-popover-field">
                <span className="stop-popover-label">Tempo do Retorno:</span>
                <span className="stop-popover-time">
                  {isEnded
                    ? formatTime(selectedStop.stop.endAt!)
                    : "Aguardando retorno (em andamento)"}
                </span>
              </div>

              <div className="stop-popover-field">
                <span className="stop-popover-label">Tempo Ocioso (Total da Parada):</span>
                <strong className="stop-popover-idle-time">
                  {idleFormatted} {isEnded ? "" : "(em andamento)"}
                </strong>
              </div>

              <div className="stop-popover-field">
                <span className="stop-popover-label">Situação:</span>
                {!isEnded ? (
                  <span className="stop-status-pill stop-status-active">
                    ● Em andamento (Ativa)
                  </span>
                ) : (
                  <span className="stop-status-pill stop-status-ended">
                    Concluída
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

interface CandleChartProps {
  records: MinuteRecord[];
  selected: PortainerId[];
  now: number;
  rangeMinutes: number;
}

export function CandleChart({ records, selected, now, rangeMinutes }: CandleChartProps) {
  const candles = useMemo(
    () => makeCandles(records, selected, now, rangeMinutes),
    [records, selected, now, rangeMinutes],
  );

  if (candles.length === 0) {
    return <div className="chart-loading candle-chart-wrap">Sem dados para exibição no gráfico de velas.</div>;
  }

  const width = 760;
  const height = 232;
  const padding = { top: 14, right: 12, bottom: 30, left: 38 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const yMax = 45;
  const y = (value: number) => padding.top + plotHeight - (Math.max(0, Math.min(yMax, value)) / yMax) * plotHeight;
  const x = (index: number) => padding.left + ((index + 0.5) / Math.max(candles.length, 1)) * plotWidth;
  const candleWidth = Math.min(25, (plotWidth / Math.max(candles.length, 1)) * 0.48);
  const ticks = [0, 10, 20, 27, 35, 45];
  const targetY = y(TARGET_MOVES_PER_HOUR);

  return (
    <div className="candle-chart-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Gráfico de velas, com abertura, máxima, mínima e fechamento do ritmo em MPH, em janelas de cinco minutos"
        preserveAspectRatio="none"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke={tick === TARGET_MOVES_PER_HOUR ? "rgba(237, 189, 104, .55)" : "rgba(158, 181, 199, .10)"}
              strokeDasharray={tick === TARGET_MOVES_PER_HOUR ? "5 5" : undefined}
            />
            <text x={padding.left - 9} y={y(tick) + 3} textAnchor="end" className="candle-axis-label">
              {tick}
            </text>
          </g>
        ))}
        <text x={width - padding.right} y={targetY - 6} textAnchor="end" className="candle-target-label">
          PEDIDA · 27 MPH
        </text>
        {candles.map((candle, index) => {
          const center = x(index);
          const color = candle.close >= TARGET_MOVES_PER_HOUR ? "#57d8c5" : "#e6a96a";
          const bodyTop = Math.min(y(candle.open), y(candle.close));
          const bodyHeight = Math.max(3, Math.abs(y(candle.open) - y(candle.close)));
          return (
            <g key={candle.start}>
              <title>{`${candle.label} · abertura ${candle.open.toFixed(1)} · máxima ${candle.high.toFixed(1)} · mínima ${candle.low.toFixed(1)} · fechamento ${candle.close.toFixed(1)} MPH · ${candle.close >= TARGET_MOVES_PER_HOUR ? "acima da pedida" : "abaixo da pedida"}`}</title>
              <line x1={center} x2={center} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1.5" />
              <rect
                x={center - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={bodyHeight}
                rx="2"
                fill={color}
                fillOpacity=".82"
                stroke={color}
                strokeWidth="1"
              />
              <text x={center} y={height - 9} textAnchor="middle" className="candle-axis-label">
                {formatTime(candle.start)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="candle-legend">
        <span><i className="legend-swatch above" /> Fechamento ≥ 27</span>
        <span><i className="legend-swatch below" /> Fechamento &lt; 27</span>
      </div>
    </div>
  );
}
