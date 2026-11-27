import { describe, expect, it } from "vitest";
import { blockTiming, clockPhase, signedClock, type AppMeeting, type AppMeetingBlock, durationWords, formatClock, formatDifference, formatLength, liveAgenda, meetingOutcome } from "./meeting";

const MIN = 60_000;
const START = Date.parse("2026-11-18T10:00:00Z");
const at = (minutes: number) => new Date(START + minutes * MIN).toISOString();

function block(position: number, title: string, minutes: number, change: Partial<AppMeetingBlock> = {}): AppMeetingBlock {
  return { blockUuid: `b${position}`, position, title, status: "pending", predictedMs: minutes * MIN, allocatedMs: minutes * MIN, actualMs: 0, ...change };
}

function meeting(status: AppMeeting["status"], blocks: AppMeetingBlock[], overrunMs = 0): AppMeeting {
  return {
    name: "Sync",
    status,
    startedAt: at(0),
    endsAt: at(blocks.reduce((sum, item) => sum + item.predictedMs, 0) / MIN),
    blocks,
    summary: { predictedMs: 0, finishedPredictedMs: 0, finishedActualMs: 0, finishedBlocks: 0, overrunMs },
  };
}

describe("liveAgenda", () => {
  const running = meeting("running", [block(1, "Check-in", 5, { status: "active", startedAt: at(0) }), block(2, "Demo", 10), block(3, "Plan", 30)]);

  it("counts the current block down and keeps the plan while it is on time", () => {
    const agenda = liveAgenda(running, START + 3 * MIN);
    expect(agenda.current).toMatchObject({ leftMs: 2 * MIN, overMs: 0 });
    expect(agenda.upcoming.map((item) => [item.lengthMs / MIN, item.startsAtMs])).toEqual([[10, START + 5 * MIN], [30, START + 15 * MIN]]);
    expect(agenda.endsAtMs).toBe(START + 45 * MIN);
  });

  it("takes an overrun from the later blocks in proportion to their length", () => {
    const agenda = liveAgenda(running, START + 9 * MIN);
    expect(agenda.current).toMatchObject({ leftMs: 0, overMs: 4 * MIN });
    expect(agenda.upcoming.map((item) => item.lengthMs / MIN)).toEqual([9, 27]);
    expect(agenda.upcoming[0]?.startsAtMs).toBe(START + 9 * MIN);
    expect(agenda.endsAtMs).toBe(START + 45 * MIN);
  });

  it("gives later blocks no time once the meeting is past its end", () => {
    const agenda = liveAgenda(running, START + 50 * MIN);
    expect(agenda.upcoming.map((item) => item.lengthMs)).toEqual([0, 0]);
    expect(agenda.endsAtMs).toBe(START + 50 * MIN);
  });

  it("lists the plan from zero before the meeting starts", () => {
    const ready = { ...meeting("ready", [block(1, "A", 5), block(2, "B", 10)]) };
    delete ready.startedAt;
    delete ready.endsAt;
    expect(liveAgenda(ready, START).upcoming.map((item) => item.startsAtMs)).toEqual([0, 5 * MIN]);
  });
});

describe("meetingOutcome", () => {
  it("says how far over it ran and which block took longest", () => {
    const done = meeting("completed", [
      block(1, "Check-in", 5, { status: "completed", actualMs: 6 * MIN, endedAt: at(6) }),
      block(2, "Demo", 10, { status: "completed", actualMs: 13 * MIN, endedAt: at(19) }),
    ]);
    const outcome = meetingOutcome(done);
    expect(outcome.sentence).toBe("Ran 4 minutes over; “Demo” took longest.");
    expect(outcome.rows.map((row) => row.differenceMs)).toEqual([MIN, 3 * MIN]);
    expect([outcome.predictedMs, outcome.actualMs]).toEqual([15 * MIN, 19 * MIN]);
  });

  it("counts blocks not reached and an early finish", () => {
    const ended = meeting("completed", [block(1, "Only", 10, { status: "completed", actualMs: 4 * MIN, endedAt: at(4) }), block(2, "Later", 10, { status: "not_run" })]);
    expect(meetingOutcome(ended).sentence).toBe("Finished 16 minutes early; “Only” took longest; 1 block not reached.");
  });
});

describe("formats", () => {
  it("writes clocks, lengths, sentences and differences", () => {
    expect([formatClock(245_000), formatClock(3_723_000), formatClock(-5)]).toEqual(["4:05", "1:02:03", "0:00"]);
    expect([formatLength(45_000), formatLength(10 * MIN), formatLength(65 * MIN), formatLength(120 * MIN)]).toEqual(["45 s", "10 min", "1 h 5 min", "2 h"]);
    expect([durationWords(30_000), durationWords(MIN), durationWords(65 * MIN)]).toEqual(["30 seconds", "1 minute", "1 hour 5 minutes"]);
    expect([formatDifference(2 * MIN), formatDifference(-MIN), formatDifference(10_000)]).toEqual(["+2 min", "−1 min", "on time"]);
  });
});

describe("meeting timing display", () => {
  it("distinguishes remaining, near, zero and over against the allocated duration", () => {
    const running = meeting("running", [block(1, "A", 2, { status: "active", startedAt: at(0) })]);
    const phases = [95_999, 96_000, 120_000, 121_000].map((elapsed) => {
      const { current } = liveAgenda(running, START + elapsed);
      if (!current) throw new Error("Expected an active block");
      return clockPhase(current);
    });
    expect(phases).toEqual(["remaining", "near", "zero", "over"]);
  });

  it("compares actual with the starting allocation and retains seconds in short changes", () => {
    const completed = block(2, "Demo", 5, { allocatedMs: 6 * MIN, allocatedAtStartMs: 6 * MIN, actualMs: 7 * MIN });
    expect(blockTiming(completed)).toBe("1:00 over");
    expect(blockTiming(block(3, "Old", 5))).toBe("Starting allocation unavailable");
    expect(signedClock(-10_000)).toBe("−0:10");
  });
});
