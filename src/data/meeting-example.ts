import { APP_MEETING_BLOCK_STATUSES as BLOCK, APP_MEETING_STATUSES as MEETING, type AppMeeting, type AppMeetingBlock, type AppMeetingAdjustment } from "@haakco/custd-sdk/browser";

export const MEETING_EXAMPLE_START = Date.parse("2026-12-01T10:00:00");
const MINUTE = 60_000;
const timeAt = (minute: number) => new Date(MEETING_EXAMPLE_START + minute * MINUTE).toISOString();

export const meetingExampleSteps = [
  { minute: 0, action: "Start sample meeting" },
  { minute: 0, action: "Finish check-in after 3 min" },
  { minute: 3, action: "Run decisions to 7 min" },
  { minute: 10, action: "Finish decisions and confirm the timing" },
  { minute: 10, action: "Finish follow-up after 5 min" },
  { minute: 15, action: "Reset sample meeting" },
] as const;

export type MeetingExampleStep = 0 | 1 | 2 | 3 | 4 | 5;
export const LAST_MEETING_EXAMPLE_STEP = 5;

export function meetingExampleStep(value: string | null, fallback: MeetingExampleStep = 0): MeetingExampleStep {
  if (value === null || !/^[0-5]$/.test(value)) return fallback;
  return Number(value) as MeetingExampleStep;
}

export const sampleMeetingAgenda = [
  { blockUuid: "sample-review", title: "Check-in", minutes: 5, started: 0, ended: 3, activeStep: 1, completedStep: 2 },
  { blockUuid: "sample-decisions", title: "Decide next steps", minutes: 5, started: 3, ended: 10, activeStep: 2, completedStep: 4 },
  { blockUuid: "sample-follow-up", title: "Assign follow-up", minutes: 5, started: 10, ended: 15, activeStep: 4, completedStep: 5 },
] as const;

export function meetingExample(step: MeetingExampleStep): AppMeeting {
  const ready = step === 0;
  const ended = step === LAST_MEETING_EXAMPLE_STEP;
  const blocks: AppMeetingBlock[] = sampleMeetingAgenda.map((block, index) => {
    const started = block.activeStep <= step;
    const completed = block.completedStep <= step;
    const allocatedMs = (block.minutes + (index === 1 && step >= 2 || index === 2 && (step === 2 || step === 3) ? 1 : 0)) * MINUTE;
    return {
      blockUuid: block.blockUuid,
      position: index + 1,
      title: block.title,
      status: completed ? BLOCK.completed : started ? BLOCK.active : BLOCK.pending,
      predictedMs: block.minutes * MINUTE,
      allocatedMs,
      actualMs: completed ? (block.ended - block.started) * MINUTE : 0,
      ...(started ? { startedAt: timeAt(block.started), allocatedAtStartMs: allocatedMs } : {}),
      ...(completed ? { endedAt: timeAt(block.ended) } : {}),
    };
  });
  const finished = blocks.filter(({ status }) => status === BLOCK.completed);
  const adjustments: AppMeetingAdjustment[] = [];
  if (step >= 2) adjustments.push({
    blockUuid: sampleMeetingAgenda[0].blockUuid,
    changes: sampleMeetingAgenda.slice(1).map(({ blockUuid }) => ({ blockUuid, beforeMs: 5 * MINUTE, afterMs: 6 * MINUTE })),
  });
  if (step >= 4) adjustments.push({
    blockUuid: sampleMeetingAgenda[1].blockUuid,
    changes: [{ blockUuid: sampleMeetingAgenda[2].blockUuid, beforeMs: 6 * MINUTE, afterMs: 5 * MINUTE }],
  });
  return {
    name: "Launch review",
    status: ready ? MEETING.ready : ended ? MEETING.completed : MEETING.running,
    ...(ready ? {} : { startedAt: timeAt(0), endsAt: timeAt(15) }),
    blocks,
    adjustments,
    summary: {
      predictedMs: 15 * MINUTE,
      finishedPredictedMs: finished.length * 5 * MINUTE,
      finishedActualMs: finished.reduce((total, block) => total + block.actualMs, 0),
      finishedBlocks: finished.length,
      overrunMs: 0,
    },
  };
}
