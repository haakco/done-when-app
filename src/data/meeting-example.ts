import { APP_MEETING_BLOCK_STATUSES, APP_MEETING_STATUSES, type AppMeeting, type AppMeetingBlock } from "@haakco/custd-sdk/browser";

export const MEETING_EXAMPLE_START = Date.parse("2026-12-01T10:00:00");
const MINUTE = 60_000;
const timeAt = (minute: number) => new Date(MEETING_EXAMPLE_START + minute * MINUTE).toISOString();
const plannedMinutes = 5;
const reviewMinutes = 3;
const decisionMinutes = 8;
const totalMinutes = reviewMinutes + decisionMinutes;

export const meetingExampleSteps = [
  { minute: 0, action: "Start sample meeting" },
  { minute: 0, action: "Finish review after 3 min" },
  { minute: reviewMinutes, action: "Run decisions to 8 min" },
  { minute: totalMinutes, action: "Finish sample meeting" },
  { minute: totalMinutes, action: "Reset sample meeting" },
] as const;

export type MeetingExampleStep = 0 | 1 | 2 | 3 | 4;

export function meetingExample(step: MeetingExampleStep): AppMeeting {
  const ready = step === 0;
  const reviewDone = step >= 2;
  const meetingDone = step === 4;
  const review: AppMeetingBlock = {
    blockUuid: "sample-review",
    position: 1,
    title: "Review progress",
    status: ready ? APP_MEETING_BLOCK_STATUSES.pending : reviewDone ? APP_MEETING_BLOCK_STATUSES.completed : APP_MEETING_BLOCK_STATUSES.active,
    predictedMs: plannedMinutes * MINUTE,
    allocatedMs: plannedMinutes * MINUTE,
    actualMs: reviewDone ? reviewMinutes * MINUTE : 0,
    ...(ready ? {} : { startedAt: timeAt(0) }),
    ...(reviewDone ? { endedAt: timeAt(reviewMinutes) } : {}),
  };
  const decisions: AppMeetingBlock = {
    blockUuid: "sample-decisions",
    position: 2,
    title: "Decide next steps",
    status: meetingDone ? APP_MEETING_BLOCK_STATUSES.completed : reviewDone ? APP_MEETING_BLOCK_STATUSES.active : APP_MEETING_BLOCK_STATUSES.pending,
    predictedMs: plannedMinutes * MINUTE,
    allocatedMs: (reviewDone ? 2 * plannedMinutes - reviewMinutes : plannedMinutes) * MINUTE,
    actualMs: meetingDone ? decisionMinutes * MINUTE : 0,
    ...(reviewDone ? { startedAt: timeAt(reviewMinutes) } : {}),
    ...(meetingDone ? { endedAt: timeAt(totalMinutes) } : {}),
  };
  return {
    name: "Launch review",
    status: ready ? APP_MEETING_STATUSES.ready : meetingDone ? APP_MEETING_STATUSES.completed : APP_MEETING_STATUSES.running,
    ...(ready ? {} : { startedAt: timeAt(0), endsAt: timeAt(2 * plannedMinutes) }),
    blocks: [review, decisions],
    summary: {
      predictedMs: 2 * plannedMinutes * MINUTE,
      finishedPredictedMs: (meetingDone ? 2 : reviewDone ? 1 : 0) * plannedMinutes * MINUTE,
      finishedActualMs: (meetingDone ? totalMinutes : reviewDone ? reviewMinutes : 0) * MINUTE,
      finishedBlocks: meetingDone ? 2 : reviewDone ? 1 : 0,
      overrunMs: Math.max(0, meetingExampleSteps[step].minute - 2 * plannedMinutes) * MINUTE,
    },
  };
}
