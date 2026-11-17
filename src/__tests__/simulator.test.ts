import { describe, expect, it } from "vitest";
import {
  advanceOneMinute,
  createSimulationState,
  registerStop,
  resumePortainer,
} from "../domain/simulator";
import { MINUTE_MS } from "../domain/model";

describe("domain/simulator", () => {
  it("initializes state with 120 minutes history and initial events", () => {
    const now = 1000 * MINUTE_MS;
    const state = createSimulationState(now);

    expect(state.now).toBe(now);
    expect(state.running).toBe(true);
    expect(state.records).toHaveLength(120);
    expect(state.events).toHaveLength(0);
  });

  it("advances simulation by one minute keeping sliding history", () => {
    const now = 1000 * MINUTE_MS;
    const state = createSimulationState(now);
    const nextState = advanceOneMinute(state);

    expect(nextState.now).toBe(now + MINUTE_MS);
    expect(nextState.records).toHaveLength(120);
    expect(nextState.records[nextState.records.length - 1].timestamp).toBe(now + MINUTE_MS);
  });

  it("synchronizes current minute record immediately when a stop is registered", () => {
    const now = 1000 * MINUTE_MS;
    const state = createSimulationState(now);

    // Register a stop on P4
    const stoppedState = registerStop(state, "P4", "plug");
    expect(stoppedState.events.some((e) => e.portainerId === "P4" && e.endAt === null)).toBe(true);

    // The record for state.now must immediately reflect the stop
    const currentRecord = stoppedState.records.find((r) => r.timestamp === now);
    expect(currentRecord).toBeDefined();
    expect(currentRecord?.byPortainer.P4.stop).toBe("plug");
    expect(currentRecord?.byPortainer.P4.moves).toBe(0);
  });

  it("synchronizes current minute record immediately when a portainer is resumed", () => {
    const now = 1000 * MINUTE_MS;
    const state = createSimulationState(now);
    const stoppedState = registerStop(state, "P5", "truck");

    // Resume P5
    const resumedState = resumePortainer(stoppedState, "P5");
    const activeStop = resumedState.events.find((e) => e.portainerId === "P5" && e.endAt === null);
    expect(activeStop).toBeUndefined();

    // The record for state.now must no longer be stopped
    const currentRecord = resumedState.records.find((r) => r.timestamp === now);
    expect(currentRecord).toBeDefined();
    expect(currentRecord?.byPortainer.P5.stop).toBeNull();
  });

  it("does not register duplicate active stops for the same portainer", () => {
    const state = createSimulationState();
    const stoppedState = registerStop(state, "P4", "plug");
    const reStopped = registerStop(stoppedState, "P4", "vessel");

    const p4Active = reStopped.events.filter((e) => e.portainerId === "P4" && e.endAt === null);
    expect(p4Active).toHaveLength(1);
    expect(p4Active[0].type).toBe("plug");
  });
});

