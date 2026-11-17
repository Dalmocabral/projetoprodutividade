import { describe, expect, it } from "vitest";
import { buildProductivityPdf } from "../domain/pdf-export";
import { createProductivityReport } from "../domain/reports";
import { createSimulationState, registerStop } from "../domain/simulator";

describe("domain/pdf-export", () => {
  it("builds a PDF document with multiple pages without throwing errors", () => {
    let state = createSimulationState();
    state = registerStop(state, "P4", "vessel");
    state = registerStop(state, "P5", "truck");

    const report = createProductivityReport(state, "final");
    const doc = buildProductivityPdf(report);

    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  });
});

