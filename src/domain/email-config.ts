export type EmailSendMode = "disabled" | "manual" | "automatic";

export interface EmailNotificationConfig {
  enabled: boolean;
  recipients: string[];
  partialMode: EmailSendMode;
  partialIntervalMinutes: number; // 15, 30, 45, 60
  finalMode: EmailSendMode;
}

export const DEFAULT_EMAIL_CONFIG: EmailNotificationConfig = {
  enabled: true,
  recipients: ["gestao.operacao@terminal.com.br", "planejamento.cais@terminal.com.br"],
  partialMode: "manual",
  partialIntervalMinutes: 30,
  finalMode: "manual",
};

export const PARTIAL_INTERVAL_OPTIONS = [15, 30, 45, 60] as const;

export function isValidEmail(email: string): boolean {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email.trim());
}

export function parseEmailList(input: string): string[] {
  return input
    .split(/[;, \n]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

const STORAGE_KEY = "portline_email_config";

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis && (globalThis as any).localStorage) {
      return (globalThis as any).localStorage;
    }
    return null;
  } catch {
    return null;
  }
}

export function loadEmailConfig(): EmailNotificationConfig {
  try {
    const storage = getStorage();
    const raw = storage ? storage.getItem(STORAGE_KEY) : null;
    if (!raw) return { ...DEFAULT_EMAIL_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_EMAIL_CONFIG.enabled,
      recipients: Array.isArray(parsed.recipients) && parsed.recipients.length > 0
        ? parsed.recipients.filter(isValidEmail)
        : [...DEFAULT_EMAIL_CONFIG.recipients],
      partialMode: ["disabled", "manual", "automatic"].includes(parsed.partialMode)
        ? parsed.partialMode
        : DEFAULT_EMAIL_CONFIG.partialMode,
      partialIntervalMinutes: [15, 30, 45, 60].includes(parsed.partialIntervalMinutes)
        ? parsed.partialIntervalMinutes
        : DEFAULT_EMAIL_CONFIG.partialIntervalMinutes,
      finalMode: ["disabled", "manual", "automatic"].includes(parsed.finalMode)
        ? parsed.finalMode
        : DEFAULT_EMAIL_CONFIG.finalMode,
    };
  } catch {
    return { ...DEFAULT_EMAIL_CONFIG };
  }
}

export function saveEmailConfig(config: EmailNotificationConfig): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  } catch (err) {
    console.error("Falha ao salvar configurações de e-mail:", err);
  }
}
