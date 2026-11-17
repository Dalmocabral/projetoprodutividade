import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_EMAIL_CONFIG,
  isValidEmail,
  loadEmailConfig,
  parseEmailList,
  saveEmailConfig,
  type EmailNotificationConfig,
} from "../domain/email-config";

describe("domain/email-config", () => {
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};
    (globalThis as any).localStorage = {
      getItem: (key: string) => mockStore[key] ?? null,
      setItem: (key: string, val: string) => { mockStore[key] = val; },
      removeItem: (key: string) => { delete mockStore[key]; },
      clear: () => { mockStore = {}; },
    };
  });

  it("validates email addresses correctly", () => {
    expect(isValidEmail("gestao@terminal.com.br")).toBe(true);
    expect(isValidEmail("user.name+tag@sub.domain.org")).toBe(true);
    expect(isValidEmail("invalid-email")).toBe(false);
    expect(isValidEmail("@semusuario.com")).toBe(false);
    expect(isValidEmail("semdominio@")).toBe(false);
  });

  it("parses email lists separated by commas, semicolons, or spaces", () => {
    const list = parseEmailList("gestao@terminal.com.br; planejamento@terminal.com.br, turno@terminal.com.br");
    expect(list).toEqual([
      "gestao@terminal.com.br",
      "planejamento@terminal.com.br",
      "turno@terminal.com.br",
    ]);
  });

  it("loads default configuration when localStorage is empty", () => {
    const config = loadEmailConfig();
    expect(config.enabled).toBe(true);
    expect(config.partialMode).toBe("manual");
    expect(config.partialIntervalMinutes).toBe(30);
    expect(config.finalMode).toBe("manual");
    expect(config.recipients.length).toBeGreaterThan(0);
  });

  it("saves and loads custom configuration correctly", () => {
    const custom: EmailNotificationConfig = {
      enabled: true,
      recipients: ["coordenador@empresa.com.br"],
      partialMode: "automatic",
      partialIntervalMinutes: 45,
      finalMode: "disabled",
    };

    saveEmailConfig(custom);
    const loaded = loadEmailConfig();
    expect(loaded.enabled).toBe(true);
    expect(loaded.recipients).toEqual(["coordenador@empresa.com.br"]);
    expect(loaded.partialMode).toBe("automatic");
    expect(loaded.partialIntervalMinutes).toBe(45);
    expect(loaded.finalMode).toBe("disabled");
  });

  it("supports completely disabled mode", () => {
    const disabled: EmailNotificationConfig = {
      ...DEFAULT_EMAIL_CONFIG,
      enabled: false,
      partialMode: "disabled",
      finalMode: "disabled",
    };

    saveEmailConfig(disabled);
    const loaded = loadEmailConfig();
    expect(loaded.enabled).toBe(false);
    expect(loaded.partialMode).toBe("disabled");
    expect(loaded.finalMode).toBe("disabled");
  });
});
