import { describe, expect, it } from "vitest";
import { createProductivityReport } from "../domain/reports";
import { createSimulationState, registerStop } from "../domain/simulator";

describe("domain/reports", () => {
  it("generates a partial report scoped to last 60 minutes", () => {
    const state = createSimulationState();
    const report = createProductivityReport(state, "partial");

    expect(report.kind).toBe("partial");
    expect(report.periodMinutes).toBe(60);
    expect(report.cranes).toHaveLength(6);
    expect(report.totalMoves).toBeGreaterThanOrEqual(0);
    expect(report.totalTeu).toBeGreaterThanOrEqual(report.totalMoves);
    expect(report.text).toContain("PORTLINE — RELATÓRIO PARCIAL DE PRODUTIVIDADE");
    expect(report.text).toContain("RESUMO EXECUTIVO");
  });

  it("generates a final report scoped to full history", () => {
    const state = createSimulationState();
    const report = createProductivityReport(state, "final");

    expect(report.kind).toBe("final");
    expect(report.periodMinutes).toBe(120);
    expect(report.cranes).toHaveLength(6);
    expect(report.text).toContain("PORTLINE — RELATÓRIO FINAL DE PRODUTIVIDADE");
  });

  it("includes active stop events in stop details", () => {
    const state = createSimulationState();
    const stoppedState = registerStop(state, "P4", "vessel");
    const report = createProductivityReport(stoppedState, "partial");

    const p4ActiveStop = report.stopDetails.find(
      (d) => d.event.portainerId === "P4" && d.event.endAt === null,
    );
    expect(p4ActiveStop).toBeDefined();
    expect(p4ActiveStop?.event.type).toBe("vessel");
  });
});
