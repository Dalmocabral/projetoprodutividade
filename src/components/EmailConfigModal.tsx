import React, { useState, useEffect } from "react";
import {
  Mail,
  Plus,
  X,
  Check,
  AlertCircle,
  Clock3,
  Ship,
  Bell,
  Power,
  Send,
} from "lucide-react";
import {
  isValidEmail,
  parseEmailList,
  PARTIAL_INTERVAL_OPTIONS,
  type EmailNotificationConfig,
  type EmailSendMode,
} from "../domain/email-config";

interface EmailConfigModalProps {
  isOpen: boolean;
  config: EmailNotificationConfig;
  onClose: () => void;
  onSave: (newConfig: EmailNotificationConfig) => void;
  onTestEmail?: (recipients: string[]) => void;
}

export const EmailConfigModal: React.FC<EmailConfigModalProps> = ({
  isOpen,
  config,
  onClose,
  onSave,
  onTestEmail,
}) => {
  const [enabled, setEnabled] = useState(config.enabled);
  const [recipients, setRecipients] = useState<string[]>(config.recipients);
  const [partialMode, setPartialMode] = useState<EmailSendMode>(config.partialMode);
  const [partialInterval, setPartialInterval] = useState<number>(config.partialIntervalMinutes);
  const [finalMode, setFinalMode] = useState<EmailSendMode>(config.finalMode);

  const [inputEmail, setInputEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEnabled(config.enabled);
      setRecipients(config.recipients);
      setPartialMode(config.partialMode);
      setPartialInterval(config.partialIntervalMinutes);
      setFinalMode(config.finalMode);
      setInputEmail("");
      setErrorMsg(null);
      setSaveSuccess(false);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  function handleAddEmail() {
    setErrorMsg(null);
    const parsed = parseEmailList(inputEmail);
    if (parsed.length === 0) return;

    const invalid = parsed.filter((e) => !isValidEmail(e));
    if (invalid.length > 0) {
      setErrorMsg(`E-mail inválido: "${invalid[0]}". Verifique o formato com @ e domínio.`);
      return;
    }

    const uniqueNew = parsed.filter((e) => !recipients.includes(e));
    if (uniqueNew.length === 0) {
      setErrorMsg("O(s) e-mail(s) informado(s) já constam na lista cadastrada.");
      return;
    }

    setRecipients((prev) => [...prev, ...uniqueNew]);
    setInputEmail("");
  }

  function handleRemoveEmail(emailToRemove: string) {
    setRecipients((prev) => prev.filter((e) => e !== emailToRemove));
  }

  function handleSave() {
    if (enabled && (partialMode !== "disabled" || finalMode !== "disabled") && recipients.length === 0) {
      setErrorMsg("Cadastre pelo menos 1 endereço de e-mail para habilitar os relatórios.");
      return;
    }

    const updated: EmailNotificationConfig = {
      enabled,
      recipients,
      partialMode,
      partialIntervalMinutes: partialInterval,
      finalMode,
    };

    onSave(updated);
    setSaveSuccess(true);
    setTimeout(() => {
      onClose();
    }, 450);
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="email-config-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-config-title"
      >
        <div className="dialog-header">
          <div className="dialog-icon email-dialog-icon">
            <Mail size={18} />
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Fechar configurações"
          >
            <X size={18} />
          </button>
        </div>

        <div className="dialog-kicker">AUTOMAÇÃO & COMUNICAÇÃO CORPORATIVA</div>
        <h2 id="email-config-title">Configurações de E-mails Operacionais</h2>
        <p className="dialog-desc">
          Cadastre a lista de gestores e defina a periodicidade de envio dos relatórios parciais e finais.
          O e-mail é gerado diretamente pelo seu cliente corporativo (sem necessidade de servidor SMTP).
        </p>

        {/* 1. STATUS GERAL / DESATIVADO */}
        <div className="config-card config-card-toggle">
          <div className="config-card-info">
            <div className="config-card-title-row">
              <Power size={15} className={enabled ? "icon-accent-cyan" : "icon-muted"} />
              <strong>Automações de E-mail</strong>
              <span className={`config-badge ${enabled ? "badge-active" : "badge-inactive"}`}>
                {enabled ? "ATIVADO" : "TUDO DESATIVADO"}
              </span>
            </div>
            <p>
              {enabled
                ? "O sistema realizará o envio ou aviso dos relatórios conforme as regras abaixo."
                : "Tudo desativado: nenhum aviso ou disparo de e-mail será emitido durante a operação."}
            </p>
          </div>
          <label className="switch-toggle" title="Ativar ou desativar todas as automações de e-mail">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="slider round" />
          </label>
        </div>

        {enabled && (
          <>
            {/* 2. LISTA DE E-MAILS CADASTRADOS */}
            <div className="config-card">
              <div className="config-card-header">
                <div>
                  <strong>Lista de E-mails Cadastrados ({recipients.length})</strong>
                  <span>Destinatários corporativos que receberão os relatórios da operação</span>
                </div>
                {recipients.length > 0 && onTestEmail && (
                  <button
                    type="button"
                    className="button-link-accent"
                    onClick={() => onTestEmail(recipients)}
                    title="Testar rascunho de e-mail corporativo com esta lista"
                  >
                    <Send size={12} /> Testar e-mail agora
                  </button>
                )}
              </div>

              <div className="email-add-row">
                <input
                  type="email"
                  className="config-text-input"
                  placeholder="ex: gestao@terminal.com.br, coordenador@terminal.com.br"
                  value={inputEmail}
                  onChange={(e) => {
                    setInputEmail(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddEmail();
                    }
                  }}
                />
                <button
                  type="button"
                  className="button button-primary email-add-btn"
                  onClick={handleAddEmail}
                  disabled={!inputEmail.trim()}
                >
                  <Plus size={14} /> Adicionar
                </button>
              </div>

              {errorMsg && (
                <div className="config-error-banner" role="alert">
                  <AlertCircle size={14} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="email-chips-container">
                {recipients.length === 0 ? (
                  <div className="email-chips-empty">
                    Nenhum e-mail cadastrado. Adicione pelo menos um e-mail para receber os relatórios.
                  </div>
                ) : (
                  recipients.map((email) => (
                    <span key={email} className="email-chip">
                      <Mail size={12} />
                      <span className="email-chip-text">{email}</span>
                      <button
                        type="button"
                        className="email-chip-remove"
                        onClick={() => handleRemoveEmail(email)}
                        aria-label={`Remover ${email}`}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* 3. RELATÓRIO PARCIAL */}
            <div className="config-card">
              <div className="config-card-header">
                <div>
                  <div className="card-title-flex">
                    <Clock3 size={15} className="icon-accent-cyan" />
                    <strong>Relatório Parcial (Acompanhamento Periódico)</strong>
                  </div>
                  <span>Envia o resumo do ritmo (MPH), movimentos e paradas recentes em intervalos regulares</span>
                </div>
              </div>

              <div className="config-subrow">
                <label className="config-field-label">Intervalo de disparo:</label>
                <div className="pill-selector-group">
                  {PARTIAL_INTERVAL_OPTIONS.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      className={`pill-selector-btn ${partialInterval === mins ? "is-active" : ""}`}
                      onClick={() => setPartialInterval(mins)}
                    >
                      {mins} minutos {mins === 30 && "(Padrão)"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="config-mode-options">
                <label className={`mode-option-card ${partialMode === "manual" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="partialMode"
                    value="manual"
                    checked={partialMode === "manual"}
                    onChange={() => setPartialMode("manual")}
                  />
                  <div className="mode-option-text">
                    <div className="mode-option-title">
                      <Bell size={14} />
                      <strong>Manual com Confirmação (Recomendado)</strong>
                    </div>
                    <p>A cada {partialInterval} min, abre um aviso na tela perguntando se deseja enviar o relatório parcial.</p>
                  </div>
                </label>

                <label className={`mode-option-card ${partialMode === "automatic" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="partialMode"
                    value="automatic"
                    checked={partialMode === "automatic"}
                    onChange={() => setPartialMode("automatic")}
                  />
                  <div className="mode-option-text">
                    <div className="mode-option-title">
                      <Send size={14} />
                      <strong>Automático Direto</strong>
                    </div>
                    <p>A cada {partialInterval} min, abre o e-mail corporativo pronto com os dados sem perguntar.</p>
                  </div>
                </label>

                <label className={`mode-option-card ${partialMode === "disabled" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="partialMode"
                    value="disabled"
                    checked={partialMode === "disabled"}
                    onChange={() => setPartialMode("disabled")}
                  />
                  <div className="mode-option-text">
                    <div className="mode-option-title">
                      <Power size={14} />
                      <strong>Desativado</strong>
                    </div>
                    <p>Não gera nem envia relatórios parciais automaticamente.</p>
                  </div>
                </label>
              </div>
            </div>

            {/* 4. RELATÓRIO FINAL */}
            <div className="config-card">
              <div className="config-card-header">
                <div>
                  <div className="card-title-flex">
                    <Ship size={15} className="icon-accent-cyan" />
                    <strong>Relatório Final (Fechamento da Faina)</strong>
                  </div>
                  <span>Gatilho: disparado automaticamente quando todos os movimentos programados forem zerados (100% faina)</span>
                </div>
              </div>

              <div className="config-mode-options">
                <label className={`mode-option-card ${finalMode === "manual" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="finalMode"
                    value="manual"
                    checked={finalMode === "manual"}
                    onChange={() => setFinalMode("manual")}
                  />
                  <div className="mode-option-text">
                    <div className="mode-option-title">
                      <Bell size={14} />
                      <strong>Manual com Confirmação (Recomendado)</strong>
                    </div>
                    <p>Ao zerar todos os movimentos do navio, abre uma tela parabenizando e perguntando se deseja enviar o fechamento.</p>
                  </div>
                </label>

                <label className={`mode-option-card ${finalMode === "automatic" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="finalMode"
                    value="automatic"
                    checked={finalMode === "automatic"}
                    onChange={() => setFinalMode("automatic")}
                  />
                  <div className="mode-option-text">
                    <div className="mode-option-title">
                      <Send size={14} />
                      <strong>Automático Direto</strong>
                    </div>
                    <p>Ao zerar o trabalho, abre o e-mail corporativo imediatamente com o relatório final consolidado.</p>
                  </div>
                </label>

                <label className={`mode-option-card ${finalMode === "disabled" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="finalMode"
                    value="disabled"
                    checked={finalMode === "disabled"}
                    onChange={() => setFinalMode("disabled")}
                  />
                  <div className="mode-option-text">
                    <div className="mode-option-title">
                      <Power size={14} />
                      <strong>Desativado</strong>
                    </div>
                    <p>Não envia nem sugere relatório final ao zerar o saldo de movimentos.</p>
                  </div>
                </label>
              </div>
            </div>
          </>
        )}

        <div className="dialog-actions email-config-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="button button-primary save-config-btn"
            onClick={handleSave}
          >
            {saveSuccess ? (
              <>
                <Check size={14} /> Salvo com sucesso!
              </>
            ) : (
              "Salvar Configurações"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

