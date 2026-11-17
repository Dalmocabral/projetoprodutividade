import React from "react";
import {
  Mail,
  X,
  Clock3,
  Ship,
  CheckCircle2,
  TrendingUp,
  Send,
  Users,
} from "lucide-react";

interface EmailPromptModalProps {
  isOpen: boolean;
  kind: "partial" | "final";
  vesselName?: string;
  periodMinutes?: number;
  moves?: number;
  teu?: number;
  averageMph?: number;
  recipients: string[];
  onConfirm: () => void;
  onDismiss: () => void;
}

export const EmailPromptModal: React.FC<EmailPromptModalProps> = ({
  isOpen,
  kind,
  vesselName,
  periodMinutes = 30,
  moves = 0,
  teu = 0,
  averageMph = 0,
  recipients,
  onConfirm,
  onDismiss,
}) => {
  if (!isOpen) return null;

  const isPartial = kind === "partial";

  return (
    <div
      className="modal-backdrop prompt-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        className="email-prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-modal-title"
      >
        <div className="dialog-header">
          <div className={`dialog-icon ${isPartial ? "icon-bg-cyan" : "icon-bg-emerald"}`}>
            {isPartial ? <Clock3 size={18} /> : <CheckCircle2 size={18} />}
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onDismiss}
            aria-label="Dispensar aviso"
          >
            <X size={18} />
          </button>
        </div>

        <div className="dialog-kicker">
          {isPartial
            ? `INTERVALO DE ${periodMinutes} MINUTOS CONCLUÍDO`
            : "FAINA 100% CONCLUÍDA · SALDO ZERADO"}
        </div>

        <h2 id="prompt-modal-title">
          {isPartial
            ? "Deseja enviar o Relatório Parcial agora?"
            : `Faina encerrada! Deseja enviar o Relatório Final?`}
        </h2>

        <p className="dialog-desc">
          {isPartial
            ? `Os dados dos últimos ${periodMinutes} minutos foram compilados. Deseja preparar o e-mail corporativo para os gestores cadastrados?`
            : `Todos os movimentos programados ${vesselName ? `do navio ${vesselName}` : "da operação"} foram concluídos com sucesso no cais.`}
        </p>

        {/* Resumo rápido de métricas */}
        <div className="prompt-metrics-box">
          {vesselName && (
            <div className="prompt-metric-item">
              <span className="prompt-metric-label"><Ship size={12} /> Navio</span>
              <strong className="prompt-metric-val">{vesselName}</strong>
            </div>
          )}
          <div className="prompt-metric-item">
            <span className="prompt-metric-label"><Clock3 size={12} /> Período</span>
            <strong className="prompt-metric-val">{isPartial ? `${periodMinutes} min recentes` : "Faina completa"}</strong>
          </div>
          <div className="prompt-metric-item">
            <span className="prompt-metric-label"><TrendingUp size={12} /> Ritmo Médio</span>
            <strong className="prompt-metric-val text-accent-cyan">{averageMph.toFixed(1)} MPH</strong>
          </div>
          <div className="prompt-metric-item">
            <span className="prompt-metric-label">Movimentos / TEU</span>
            <strong className="prompt-metric-val">{moves} mov · {teu} TEU</strong>
          </div>
        </div>

        {/* Destinatários */}
        <div className="prompt-recipients-box">
          <div className="prompt-recipients-header">
            <Users size={12} />
            <span>Destinatários cadastrados ({recipients.length}):</span>
          </div>
          <div className="prompt-recipients-list">
            {recipients.length > 0 ? (
              recipients.map((email) => (
                <span key={email} className="prompt-recipient-pill">
                  {email}
                </span>
              ))
            ) : (
              <span className="text-muted-italics">Nenhum e-mail cadastrado na configuração.</span>
            )}
          </div>
        </div>

        <div className="dialog-actions prompt-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={onDismiss}
          >
            Agora não / Fechar
          </button>
          <button
            type="button"
            className="button button-primary prompt-confirm-btn"
            onClick={onConfirm}
            disabled={recipients.length === 0}
          >
            <Send size={14} />
            {isPartial ? "Enviar Relatório Parcial" : "Enviar Relatório Final"}
          </button>
        </div>
      </div>
    </div>
  );
};

