// Meeting timing: the live agenda between Custd's reads, durations as people say them, and the
// one-sentence outcome. Custd rebalances on every step; between steps an overrunning block takes
// its extra time from the blocks after it in proportion to their length, as Custd's run engine
// does, so the agenda on screen matches what the next read will say.

import { APP_MEETING_BLOCK_STATUSES, APP_MEETING_STATUSES, type AppMeeting as SdkMeeting, type AppMeetingBlock as SdkMeetingBlock } from "@haakco/custd-sdk/browser";

export type MeetingAdjustment = {
  blockUuid: string;
  changes: { blockUuid: string; beforeMs: number; afterMs: number }[];
};

export type AppMeetingBlock = SdkMeetingBlock & { allocatedAtStartMs?: number };
export type AppMeeting = Omit<SdkMeeting, "blocks"> & { blocks: AppMeetingBlock[] | null; adjustments?: MeetingAdjustment[] };

const SECOND = 1000;
const MINUTE = 60 * SECOND;
/** Within this of the plan, a meeting finished on time. */
const ON_TIME_MS = 30 * SECOND;

/** The block that is on now. `leftMs` counts down to 0, then `overMs` counts up. */
export type CurrentBlock = { block: AppMeetingBlock; elapsedMs: number; leftMs: number; overMs: number };

/** A block still to come, with the time it has now and when it starts if the meeting keeps to it. */
export type UpcomingBlock = { block: AppMeetingBlock; lengthMs: number; startsAtMs: number };

export type LiveAgenda = {
  current: CurrentBlock | null;
  done: AppMeetingBlock[];
  upcoming: UpcomingBlock[];
  /** When the meeting ends if the rest keeps to time: the planned end, or later after an overrun. */
  endsAtMs: number | null;
};

const byPosition = (blocks: AppMeeting["blocks"]): AppMeetingBlock[] => [...(blocks ?? [])].sort((a, b) => a.position - b.position);

/** The agenda at `nowMs`, rebalanced for the current block's overrun so far. */
export function liveAgenda(meeting: AppMeeting, nowMs: number): LiveAgenda {
  const blocks = byPosition(meeting.blocks);
  const done = blocks.filter((block) => block.status === APP_MEETING_BLOCK_STATUSES.completed || block.status === APP_MEETING_BLOCK_STATUSES.skipped);
  const pending = blocks.filter((block) => block.status === APP_MEETING_BLOCK_STATUSES.pending);
  const active = blocks.find((block) => block.status === APP_MEETING_BLOCK_STATUSES.active);
  if (!active?.startedAt || !meeting.endsAt) {
    let startsAtMs = 0;
    const upcoming = pending.map((block) => {
      const next = { block, lengthMs: block.allocatedMs, startsAtMs };
      startsAtMs += block.allocatedMs;
      return next;
    });
    return { current: null, done, upcoming, endsAtMs: meeting.endsAt ? Date.parse(meeting.endsAt) : null };
  }
  const elapsedMs = Math.max(0, nowMs - Date.parse(active.startedAt));
  const current = { block: active, elapsedMs, leftMs: Math.max(0, active.allocatedMs - elapsedMs), overMs: Math.max(0, elapsedMs - active.allocatedMs) };
  const plannedEndMs = Date.parse(meeting.endsAt);
  const cursorMs = Date.parse(active.startedAt) + active.allocatedMs + current.overMs;
  const lengths = apportion(Math.max(0, plannedEndMs - cursorMs), pending.map((block) => block.allocatedMs));
  let startsAtMs = cursorMs;
  const upcoming = pending.map((block, index) => {
    const next = { block, lengthMs: lengths[index] ?? 0, startsAtMs };
    startsAtMs += next.lengthMs;
    return next;
  });
  return { current, done, upcoming, endsAtMs: Math.max(plannedEndMs, cursorMs) };
}

/** Splits `budgetMs` across the blocks in proportion to their lengths, to the whole second. */
function apportion(budgetMs: number, lengths: number[]): number[] {
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0) return lengths.map(() => 0);
  if (budgetMs >= total) return lengths;
  return lengths.map((length) => Math.floor((budgetMs * length) / total / SECOND) * SECOND);
}

/** A countdown: "4:05", "1:02:03". */
export function formatClock(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / SECOND);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export type ClockPhase = "remaining" | "near" | "zero" | "over";

export function clockPhase(current: CurrentBlock): ClockPhase {
  if (current.overMs > 0) return "over";
  if (current.leftMs === 0) return "zero";
  return current.leftMs <= Math.min(MINUTE, current.block.allocatedMs * 0.2) ? "near" : "remaining";
}

export function signedClock(ms: number): string {
  return `${ms < 0 ? "−" : "+"}${formatClock(Math.round(Math.abs(ms) / SECOND) * SECOND)}`;
}

export function blockTiming(block: AppMeetingBlock): string {
  const allowance = block.allocatedAtStartMs;
  if (allowance === undefined) return "Starting allocation unavailable";
  const variance = block.actualMs - allowance;
  if (Math.abs(variance) < SECOND) return "On time";
  return `${formatClock(Math.abs(variance))} ${variance < 0 ? "early" : "over"}`;
}

/** A short length for lists: "45 s", "10 min", "1 h 5 min". */
export function formatLength(ms: number): string {
  if (ms < MINUTE) return `${Math.round(ms / SECOND)} s`;
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

/** A length in a sentence: "30 seconds", "4 minutes", "1 hour 5 minutes". */
export function durationWords(ms: number): string {
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  if (ms < MINUTE) return plural(Math.round(ms / SECOND), "second");
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? plural(hours, "hour") : `${plural(hours, "hour")} ${plural(minutes % 60, "minute")}`;
}

/** A block's actual time against its plan: "+2 min", "−1 min", "on time". */
export function formatDifference(ms: number): string {
  if (Math.abs(ms) < ON_TIME_MS) return "on time";
  return `${ms > 0 ? "+" : "−"}${formatLength(Math.abs(ms))}`;
}

export type OutcomeRow = { block: AppMeetingBlock; actualMs: number | null; differenceMs: number | null };

export type MeetingOutcome = {
  rows: OutcomeRow[];
  predictedMs: number;
  actualMs: number;
  /** When the meeting ended against its planned end; positive ran over. */
  differenceMs: number;
  notReached: number;
  sentence: string;
};

/** Planned against actual per block and in total, and one sentence saying how it went. */
export function meetingOutcome(meeting: AppMeeting): MeetingOutcome {
  const rows = byPosition(meeting.blocks).map((block): OutcomeRow => {
    const ran = block.status === APP_MEETING_BLOCK_STATUSES.completed || block.status === APP_MEETING_BLOCK_STATUSES.active;
    return { block, actualMs: ran ? block.actualMs : null, differenceMs: ran ? block.actualMs - block.predictedMs : null };
  });
  const predictedMs = rows.reduce((sum, row) => sum + row.block.predictedMs, 0);
  const actualMs = rows.reduce((sum, row) => sum + (row.actualMs ?? 0), 0);
  const notReached = rows.filter((row) => row.actualMs === null).length;
  const endedAt = Math.max(...rows.map((row) => (row.block.endedAt ? Date.parse(row.block.endedAt) : Number.NaN)).filter(Number.isFinite));
  // The meeting's end against its planned end; without the times, the blocks' sum against the plan.
  const differenceMs = meeting.endsAt && Number.isFinite(endedAt) ? endedAt - Date.parse(meeting.endsAt) : actualMs - predictedMs;
  return { rows, predictedMs, actualMs, differenceMs, notReached, sentence: outcomeSentence(rows, differenceMs, notReached) };
}

function outcomeSentence(rows: OutcomeRow[], differenceMs: number, notReached: number): string {
  let overall = "Finished on time";
  if (differenceMs >= ON_TIME_MS) overall = `Ran ${durationWords(differenceMs)} over`;
  else if (differenceMs <= -ON_TIME_MS) overall = `Finished ${durationWords(-differenceMs)} early`;
  const parts = [overall];
  const longest = rows.reduce<OutcomeRow | null>((best, row) => (row.actualMs !== null && (best === null || row.actualMs > (best.actualMs ?? 0)) ? row : best), null);
  if (longest && rows.length > 1) parts.push(`“${longest.block.title}” took longest`);
  if (notReached > 0) parts.push(`${notReached} block${notReached === 1 ? "" : "s"} not reached`);
  return `${parts.join("; ")}.`;
}

/** A meeting in one line for a tile or a download: what is on now, the plan, or how it went. */
export function meetingLine(meeting: AppMeeting, nowMs: number): { headline: string; detail: string | null } {
  if (meeting.status === APP_MEETING_STATUSES.ready) {
    const count = meeting.blocks?.length ?? 0;
    return { headline: `${formatLength(meeting.summary.predictedMs)} planned`, detail: `${count} block${count === 1 ? "" : "s"}, not started.` };
  }
  const current = liveAgenda(meeting, nowMs).current;
  if (meeting.status === APP_MEETING_STATUSES.running && current) {
    const time = current.overMs > 0 ? `${formatClock(current.overMs)} over` : `${formatClock(current.leftMs)} left`;
    return { headline: `Now: ${current.block.title}`, detail: time };
  }
  return { headline: meetingOutcome(meeting).sentence, detail: null };
}
