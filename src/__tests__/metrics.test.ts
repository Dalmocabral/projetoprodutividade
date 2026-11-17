import { describe, expect, it } from "vitest";
import {
  getPortainerMetrics,
  getSelectedIds,
  getTotalMoves,
  getTotalTeu,
  TARGET_MOVES_PER_HOUR,
} from "../domain/metrics";
import { MINUTE_MS, type MinuteRecord, type StopEvent } from "../domain/model";

describe("domain/metrics", () => {
  it("has target moves per hour equal to 27", () => {
    expect(TARGET_MOVES_PER_HOUR).toBe(27);
  });

  it("resolves selected ids correctly", () => {
    expect(getSelectedIds("ALL")).toEqual(["P4", "P5", "P6", "P7", "P8", "P9"]);
    expect(getSelectedIds("P5")).toEqual(["P5"]);
  });

  it("calculates moves and TEUs distinctly according to operational port rules", () => {
    const now = 1_000_000 * MINUTE_MS;
    // P4: twin lift (1 move, 2 TEU)
    // P5: single 40ft (1 move, 2 TEU)
    // P6: single 20ft (1 move, 1 TEU)
    // P7: stopped (0 moves, 0 TEU)
    const record: MinuteRecord = {
      timestamp: now,
      byPortainer: {
        P4: { moves: 1, teu: 2, liftMode: "twin-lift-20ft", stop: null },
        P5: { moves: 1, teu: 2, liftMode: "single-40ft", stop: null },
        P6: { moves: 1, teu: 1, liftMode: "single-20ft", stop: null },
        P7: { moves: 0, teu: 0, liftMode: null, stop: "plug" },
        P8: { moves: 0, teu: 0, liftMode: null, stop: null },
        P9: { moves: 0, teu: 0, liftMode: null, stop: null },
      },
    };

    expect(getTotalMoves([record], now, 60, ["P4", "P5", "P6", "P7"])).toBe(3);
    expect(getTotalTeu([record], now, 60, ["P4", "P5", "P6", "P7"])).toBe(5);
  });

  it("calculates portainer rate and availability in rolling 15-minute window", () => {
    const now = 100 * MINUTE_MS;
    const records: MinuteRecord[] = [];

    // Create 15 records: P4 has 1 move every minute (15 moves in 15 min = 60 MPH)
    // P5 has 1 move every 2 minutes (7 moves in 15 min = 28 MPH -> on target >= 27)
    // P6 has 0 moves (0 MPH)
    for (let i = 14; i >= 0; i--) {
      const ts = now - i * MINUTE_MS;
      records.push({
        timestamp: ts,
        byPortainer: {
          P4: { moves: 1, teu: 2, liftMode: "single-40ft", stop: null },
          P5: { moves: i % 2 === 0 ? 1 : 0, teu: 1, liftMode: "single-20ft", stop: null },
          P6: { moves: 0, teu: 0, liftMode: null, stop: "vessel" },
          P7: { moves: 0, teu: 0, liftMode: null, stop: null },
          P8: { moves: 0, teu: 0, liftMode: null, stop: null },
          P9: { moves: 0, teu: 0, liftMode: null, stop: null },
        },
      });
    }

    const events: StopEvent[] = [
      { id: "e1", portainerId: "P6", type: "vessel", startAt: now - 30 * MINUTE_MS, endAt: null },
    ];

    const metrics = getPortainerMetrics(records, events, now, ["P4", "P5", "P6"]);

    const p4 = metrics.find((m) => m.id === "P4")!;
    expect(p4.rateMovesPerHour).toBe(60);
    expect(p4.isOnTarget).toBe(true);
    expect(p4.availabilityPercent).toBe(100);

    const p5 = metrics.find((m) => m.id === "P5")!;
    expect(p5.rateMovesPerHour).toBe(32); // 8 moves in 15 min * 4 = 32 MPH
    expect(p5.isOnTarget).toBe(true);

    const p6 = metrics.find((m) => m.id === "P6")!;
    expect(p6.rateMovesPerHour).toBe(0);
    expect(p6.isOnTarget).toBe(false);
    expect(p6.activeStop).toBeDefined();
    expect(p6.activeStop?.type).toBe("vessel");
  });

  it("handles empty records without division by zero or NaN", () => {
    const metrics = getPortainerMetrics([], [], Date.now(), ["P4", "P5"]);
    expect(metrics).toHaveLength(2);
    expect(metrics[0].rateMovesPerHour).toBe(0);
    expect(metrics[0].availabilityPercent).toBe(0);
    expect(metrics[0].isOnTarget).toBe(false);
  });

  it("calculates countdown of remaining moves, progress, and ETC based on work plans", () => {
    const now = 100 * MINUTE_MS;
    const records: MinuteRecord[] = [];

    // Create 15 records with 1 move every minute for P4 (15 moves done)
    for (let i = 14; i >= 0; i--) {
      records.push({
        timestamp: now - i * MINUTE_MS,
        byPortainer: {
          P4: { moves: 1, teu: 2, liftMode: "single-40ft", stop: null },
          P5: { moves: 0, teu: 0, liftMode: null, stop: null },
          P6: { moves: 0, teu: 0, liftMode: null, stop: null },
          P7: { moves: 0, teu: 0, liftMode: null, stop: null },
          P8: { moves: 0, teu: 0, liftMode: null, stop: null },
          P9: { moves: 0, teu: 0, liftMode: null, stop: null },
        },
      });
    }

    const customPlans = {
      P4: { portainerId: "P4" as const, vesselId: "vessel-1", targetMoves: 500, initialExecutedMoves: 85 },
      P5: { portainerId: "P5" as const, vesselId: "vessel-1", targetMoves: 600, initialExecutedMoves: 0 },
      P6: { portainerId: "P6" as const, vesselId: "vessel-2", targetMoves: 450, initialExecutedMoves: 0 },
      P7: { portainerId: "P7" as const, vesselId: "vessel-2", targetMoves: 500, initialExecutedMoves: 0 },
      P8: { portainerId: "P8" as const, vesselId: null, targetMoves: 400, initialExecutedMoves: 0 },
      P9: { portainerId: "P9" as const, vesselId: null, targetMoves: 350, initialExecutedMoves: 0 },
    };

    const metrics = getPortainerMetrics(records, [], now, ["P4", "P5", "P8"], customPlans);

    const p4 = metrics.find((m) => m.id === "P4")!;
    // Total executed: 85 initial + 15 in records = 100 moves
    expect(p4.totalExecutedMoves).toBe(100);
    // Remaining moves: 500 - 100 = 400
    expect(p4.remainingMoves).toBe(400);
    // Progress: 100 / 500 * 100 = 20%
    expect(p4.progressPercent).toBe(20);
    expect(p4.vesselId).toBe("vessel-1");
    // Rate is 60 MPH -> 400 remaining moves at 60 MPH = 400 minutes (~6h 40min)
    expect(p4.estimatedRemainingMinutes).toBe(400);
    expect(p4.estimatedCompletionAt).toBe(now + 400 * MINUTE_MS);

    const p8 = metrics.find((m) => m.id === "P8")!;
    expect(p8.vesselId).toBeNull();
    expect(p8.remainingMoves).toBe(400);
  });

  it("immediately drops rate to 0 MPH and pauses ETC when an active stop occurs", () => {
    const now = 100 * MINUTE_MS;
    const records: MinuteRecord[] = [];

    // Crane P4 has 1 move every minute (normally 60 MPH)
    for (let i = 14; i >= 0; i--) {
      records.push({
        timestamp: now - i * MINUTE_MS,
        byPortainer: {
          P4: { moves: 1, teu: 2, liftMode: "single-40ft", stop: null },
          P5: { moves: 0, teu: 0, liftMode: null, stop: null },
          P6: { moves: 0, teu: 0, liftMode: null, stop: null },
          P7: { moves: 0, teu: 0, liftMode: null, stop: null },
          P8: { moves: 0, teu: 0, liftMode: null, stop: null },
          P9: { moves: 0, teu: 0, liftMode: null, stop: null },
        },
      });
    }

    // Now P4 has an active stoppage
    const activeEvents: StopEvent[] = [
      { id: "active-p4-plug", portainerId: "P4", type: "plug", startAt: now, endAt: null },
    ];

    const metrics = getPortainerMetrics(records, activeEvents, now, ["P4"]);
    const p4 = metrics.find((m) => m.id === "P4")!;

    expect(p4.rateMovesPerHour).toBe(0);
    expect(p4.isOnTarget).toBe(false);
    expect(p4.activeStop).toBeDefined();
    expect(p4.activeStop?.type).toBe("plug");
    expect(p4.estimatedRemainingMinutes).toBeNull();
  });
});

