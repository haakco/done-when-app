import { useAppMeeting } from "@haakco/custd-react";
import { APP_MEETING_BLOCK_STATUSES, APP_MEETING_STATUSES, type AppMeeting, type AppMeetingAdjustment } from "@haakco/custd-sdk/browser";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DownloadMenu } from "../components/DownloadMenu";
import { ItemHeader } from "../components/ItemHeader";
import { ReadOnlyNotice, WriteError } from "../components/ItemStates";
import { LiveLine } from "../components/LiveLine";
import { KeepInMyItems, LinksAndExpiry } from "../components/OwnerSettings";
import { StatusBadge } from "../components/StatusBadge";
import { isStaleMeetingStep, type DoneWhenData, type ItemAccess } from "../data";
import { meetingOf } from "../data/live";
import { formatTime } from "../lib/dates";
import { meetingWorkbook } from "../lib/exports";
import { blockTiming, clockPhase, formatClock, formatLength, liveAgenda, meetingOutcome, signedClock, type ClockPhase, type CurrentBlock, type LiveAgenda } from "../lib/meeting";
import { useNow } from "../lib/use-now";
import "../styles/meeting.css";
import { MeetingMinutes } from "./MeetingMinutes";
import type { ItemViewProps } from "./view-props";

export function MeetingView({ data, access, read, live, showOwnerTools, ownerRoute }: ItemViewProps) {
  const item = meetingOf(read);
  // The SDK's meeting read shares the item page's poller: a share link follows the meeting live.
  const watched = useAppMeeting(access);
  const meeting = "data" in watched ? watched.data : item.meeting;
  const running = meeting.status === APP_MEETING_STATUSES.running;
  const now = useNow(running);
  const agenda = liveAgenda(meeting, now);
  const article = useRef<HTMLElement>(null);
  const previousStatus = useRef(meeting.status);
  useEffect(() => {
    if (showOwnerTools && document.activeElement === document.body) {
      if (previousStatus.current === APP_MEETING_STATUSES.ready && running) {
        article.current?.querySelector<HTMLHeadingElement>("#now-title")?.focus();
      }
      if (previousStatus.current === APP_MEETING_STATUSES.running && meeting.status === APP_MEETING_STATUSES.completed) {
        article.current?.querySelector<HTMLHeadingElement>("#outcome-heading")?.focus();
      }
    }
    previousStatus.current = meeting.status;
  }, [meeting.status, running, showOwnerTools]);
  return (
    <article ref={article} aria-labelledby="item-name" className="item meeting">
      <ItemHeader
        data={data}
        access={access}
        kind="meeting"
        meta={item}
        title={meeting.name}
        owner={showOwnerTools}
        actions={<DownloadMenu name={meeting.name} build={() => meetingWorkbook(meeting, new Date())} />}
      >
        <MeetingStatus meeting={meeting} />
      </ItemHeader>
      {meeting.status === APP_MEETING_STATUSES.ready ? <ReadySummary meeting={meeting} data={data} access={access} owner={showOwnerTools} /> : null}
      {running && agenda.current ? <NowSummary meeting={meeting} current={agenda.current} agenda={agenda} data={data} access={access} owner={showOwnerTools} refresh={live.refresh} /> : null}
      {meeting.status === APP_MEETING_STATUSES.completed || meeting.status === APP_MEETING_STATUSES.cancelled ? <MeetingOutcomeView meeting={meeting} /> : null}
      {meeting.status === APP_MEETING_STATUSES.completed || meeting.status === APP_MEETING_STATUSES.cancelled ? null : <MeetingAgenda agenda={agenda} meeting={meeting} running={running} />}
      <LiveLine freshness={live.freshness} lastUpdatedAt={live.lastUpdatedAt} />
      {showOwnerTools ? <MeetingMinutes saved={read.meetingMinutes} revision={read.item.version} save={async (update) => {
        await data.updateMeetingMinutes(access, update);
        live.refresh();
      }} /> : null}
      {ownerRoute && !showOwnerTools ? <ReadOnlyNotice /> : null}
      {showOwnerTools ? (
        <details className="more section">
          <summary>Links, expiry and my items</summary>
          <div className="more__body">
            <KeepInMyItems data={data} access={access} kind="meeting" meta={item} />
            <LinksAndExpiry data={data} access={access} kind="meeting" meta={item} />
          </div>
        </details>
      ) : null}
    </article>
  );
}

/** Running, ended or not started, in words with a glyph. */
export function MeetingStatus({ meeting }: { meeting: AppMeeting }) {
  if (meeting.status === APP_MEETING_STATUSES.running) return <StatusBadge status="active" label="Running" />;
  if (meeting.status === APP_MEETING_STATUSES.completed) return <StatusBadge status="completed" label="Ended" />;
  if (meeting.status === APP_MEETING_STATUSES.cancelled) return <StatusBadge status="canceled" />;
  return <span className="small muted">Not started</span>;
}

type StepProps = { meeting: AppMeeting; data: DoneWhenData; access: ItemAccess; owner: boolean };

function ReadySummary({ meeting, data, access, owner }: StepProps) {
  const start = useMutation({ mutationFn: () => data.startMeeting(access) });
  const count = meeting.blocks?.length ?? 0;
  return (
    <section className="summary" aria-label="Summary">
      <p className="summary__headline">{formatLength(meeting.summary.predictedMs)} planned</p>
      <p className="summary__detail">
        {count} block{count === 1 ? "" : "s"}. {owner ? "Press Start when everyone is here; the clock runs from then." : "The clock starts when the owner presses Start."}
      </p>
      {owner ? (
        <div className="button-row">
          <button type="button" className="button button--primary button--big" disabled={start.isPending} onClick={() => { start.mutate(); }}>
            {start.isPending ? "Starting…" : "Start meeting"}
          </button>
          <WriteError error={isStaleMeetingStep(start.error) ? null : start.error} />
        </div>
      ) : null}
    </section>
  );
}

type NowProps = StepProps & { current: CurrentBlock; agenda: LiveAgenda; refresh: () => void };

function NowSummary({ meeting, current, agenda, data, access, owner, refresh }: NowProps) {
  const nextTitle = agenda.upcoming.find((block) => block.lengthMs > 0)?.block.title;
  return (
    <MeetingClock meeting={meeting} current={current} endsAtMs={agenda.endsAtMs}>
      {owner ? <StepButtons data={data} access={access} blockUuid={current.block.blockUuid} nextTitle={nextTitle ?? null} refresh={refresh} /> : null}
    </MeetingClock>
  );
}

const phaseLabel: Record<ClockPhase, string> = {
  remaining: "Time left",
  near: "Nearly out of time",
  zero: "Time’s up",
  over: "Over by",
};

export function MeetingClock({ meeting, current, endsAtMs, children }: {
  meeting: AppMeeting; current: CurrentBlock; endsAtMs: number | null; children?: ReactNode;
}) {
  const phase = clockPhase(current);
  const { block } = current;
  const previous = meeting.adjustments?.at(-1);
  const changedBlock = meeting.blocks?.find(({ blockUuid }) => blockUuid === previous?.blockUuid);
  const affected = previous?.changes.filter((change) => change.beforeMs !== change.afterMs) ?? [];
  const movedMs = affected.reduce((total, change) => total + change.afterMs - change.beforeMs, 0);
  const total = block.allocatedAtStartMs ?? block.allocatedMs;
  const baselineChange = total - block.predictedMs;
  const lastChange = affected.find((change) => change.blockUuid === block.blockUuid);
  const lastDelta = lastChange ? lastChange.afterMs - lastChange.beforeMs : 0;
  const announcement = changedBlock && affected.length > 0
    ? `${changedBlock.title} finished${changedBlock.allocatedAtStartMs === undefined ? "" : ` ${blockTiming(changedBlock).toLowerCase()}`} · ${formatClock(Math.abs(movedMs))} ${movedMs > 0 ? "added to" : "removed from"} ${affected.length} upcoming ${affected.length === 1 ? "block" : "blocks"}.`
    : null;
  const late = endsAtMs !== null && meeting.endsAt && endsAtMs > Date.parse(meeting.endsAt);
  return (
    <section className={`summary meeting-now meeting-now--${phase}`} aria-labelledby="now-title">
      <p className="meeting-now__label small">Now · block {block.position} of {meeting.blocks?.length ?? 0}</p>
      <h2 id="now-title" tabIndex={-1} className="meeting-now__title">{block.title}</h2>
      <div className="meeting-now__reading" role="timer" aria-live="off">
        <span className="meeting-now__phase">{phaseLabel[phase]}</span>
        <span className="meeting-now__clock numeric">{formatClock(phase === "over" ? current.overMs : Math.ceil(current.leftMs / 1000) * 1000)}</span>
      </div>
      <div className="meeting-now__track" aria-hidden="true">
        <span style={{ width: `${total > 0 ? 100 * current.leftMs / total : 0}%` }} />
      </div>
      <p className="meeting-now__detail numeric">
        {formatClock(total)} allocated{baselineChange !== 0 ? ` · ${signedClock(baselineChange)} vs original ${formatClock(block.predictedMs)}` : ""}
        {lastDelta !== 0 && lastDelta !== baselineChange ? ` · ${baselineChange === 0 ? "Back to plan · " : ""}${signedClock(lastDelta)} last step` : ""}
      </p>
      {endsAtMs === null ? null : <p className="meeting-now__finish">{late ? "Projected finish" : "Meeting ends"} {formatTime(new Date(endsAtMs))}{late && meeting.endsAt ? ` · planned ${formatTime(new Date(meeting.endsAt))}` : ""}</p>}
      <p className="visually-hidden" role="status">{block.title} · {phaseLabel[phase]}</p>
      <p className={announcement ? "meeting-now__movement numeric" : "visually-hidden"} role="status">{announcement}</p>
      {children}
    </section>
  );
}

type StepButtonsProps = { data: DoneWhenData; access: ItemAccess; blockUuid: string; nextTitle: string | null; refresh: () => void };

function StepButtons({ data, access, blockUuid, nextTitle, refresh }: StepButtonsProps) {
  const [confirming, setConfirming] = useState(false);
  // A second press before the page shows the next block would name the same block: Custd treats
  // that as a repeat, and this guard does not even send it.
  const [sentFor, setSentFor] = useState<string | null>(null);
  const advance = useMutation({
    mutationFn: (block: string) => data.advanceMeeting(access, block),
    onError: (error) => { if (isStaleMeetingStep(error)) refresh(); },
  });
  const end = useMutation({
    mutationFn: () => data.endMeeting(access),
    onError: (error) => { if (isStaleMeetingStep(error)) refresh(); },
  });
  const stepButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (sentFor !== null && sentFor !== blockUuid && document.activeElement === document.body && !advance.isPending) stepButton.current?.focus();
  }, [advance.isPending, blockUuid, sentFor]);
  const waiting = advance.isPending || sentFor === blockUuid;
  const error = [advance.error, end.error].find((candidate) => candidate && !isStaleMeetingStep(candidate)) ?? null;
  return (
    <>
      <div className="button-row meeting-now__steps">
        <button
          type="button"
          className="button button--primary button--big"
          ref={stepButton}
          disabled={waiting || end.isPending}
          onClick={() => {
            if (sentFor === blockUuid) return;
            setSentFor(blockUuid);
            advance.mutate(blockUuid, { onError: () => { setSentFor(null); } });
          }}
        >
          {nextTitle ? `Next block: ${nextTitle}` : "Finish last block"}
        </button>
        {confirming ? null : (
          <button type="button" className="button" disabled={end.isPending} onClick={() => { setConfirming(true); }}>
            End meeting
          </button>
        )}
      </div>
      {confirming ? (
        <div className="notice meeting-now__confirm" role="group" aria-labelledby="end-question">
          <p id="end-question">End the meeting now? Blocks not reached are kept as not run.</p>
          <div className="button-row">
            <button type="button" className="button button--primary" disabled={end.isPending} onClick={() => { end.mutate(); }}>
              {end.isPending ? "Ending…" : "End now"}
            </button>
            <button type="button" className="button" onClick={() => { setConfirming(false); }}>
              Keep going
            </button>
          </div>
        </div>
      ) : null}
      <WriteError error={error} />
    </>
  );
}

export function MeetingAgenda({ agenda, meeting, running }: { agenda: LiveAgenda; meeting: AppMeeting; running: boolean }) {
  const latest = new Map(meeting.adjustments?.at(-1)?.changes.map((change) => [change.blockUuid, change]));
  const scale = Math.max(1, ...agenda.upcoming.map(({ block, lengthMs }) => Math.max(
    block.predictedMs, block.allocatedMs, lengthMs, latest.get(block.blockUuid)?.beforeMs ?? 0,
  )));
  return (
    <>
      {agenda.upcoming.length > 0 ? (
        <section className="section" aria-labelledby="agenda-heading">
          <h2 id="agenda-heading">{running ? "Up next" : "Agenda"}</h2>
          <ol className="agenda">
            {agenda.upcoming.map(({ block, lengthMs, startsAtMs }) => {
              const original = block.predictedMs;
              const delta = lengthMs - original;
              const change = latest.get(block.blockUuid);
              const stepDelta = change ? change.afterMs - change.beforeMs : 0;
              const projected = running && lengthMs !== block.allocatedMs;
              const projectionDelta = lengthMs - block.allocatedMs;
              const latestDelta = projected ? projectionDelta : stepDelta;
              const visualDelta = delta === 0 && latestDelta < 0 ? latestDelta : delta;
              const visualStart = Math.min(lengthMs, original);
              return (
                <li key={block.blockUuid} className="agenda__row">
                  <span className="agenda__title">{block.title}</span>
                  <span className="agenda__time numeric">
                    {projected ? "Projected · " : ""}
                    <strong>{lengthMs === 0 ? "No time left" : formatClock(lengthMs)}</strong>
                    {delta !== 0 || stepDelta !== 0 ? ` · original ${formatClock(original)}` : ""}
                  </span>
                  <div className="agenda__track" aria-hidden="true">
                    <span className="agenda__allocation" style={{ width: `${100 * visualStart / scale}%` }} />
                    <span className={`agenda__delta agenda__delta--${visualDelta < 0 ? "loss" : "gain"}`} style={{ left: `${100 * visualStart / scale}%`, width: `${100 * Math.abs(visualDelta) / scale}%` }} />
                    <span className="agenda__original" style={{ left: `${100 * original / scale}%` }} />
                  </div>
                  <div className="agenda__meta small numeric">
                    {delta !== 0 ? <span className={delta < 0 ? "agenda__loss" : "agenda__gain"}>{signedClock(delta)} {delta < 0 ? "removed" : "added"}</span> : null}
                    {projected && projectionDelta !== delta ? <span className="agenda__loss">{signedClock(projectionDelta)} from overrun</span> : null}
                    {!projected && stepDelta !== 0 && stepDelta !== delta ? <span>{delta === 0 ? "Back to plan · " : ""}{signedClock(stepDelta)} last step</span> : null}
                    <span>{running ? `From ${formatTime(new Date(startsAtMs))}` : startsAtMs === 0 ? "First" : `Starts ${formatLength(startsAtMs)} in`}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
      {running && agenda.done.length > 0 ? <MeetingHistory blocks={agenda.done} meeting={meeting} /> : null}
    </>
  );
}

function MeetingHistory({ blocks, meeting }: { blocks: NonNullable<AppMeeting["blocks"]>; meeting: AppMeeting }) {
  const names = new Map(meeting.blocks?.map((block) => [block.blockUuid, block.title]));
  const adjustments = new Map(meeting.adjustments?.map((step) => [step.blockUuid, step]));
  return (
    <section className="section" aria-labelledby="outcome-heading">
      <h2 id="outcome-heading" tabIndex={-1}>Meeting history</h2>
      <ol className="agenda">
        {blocks.map((block) => {
          const ran = block.status === APP_MEETING_BLOCK_STATUSES.completed;
          const allowance = block.allocatedAtStartMs;
          const adjustment: AppMeetingAdjustment | undefined = adjustments.get(block.blockUuid);
          const changes = adjustment?.changes.filter((change) => change.beforeMs !== change.afterMs) ?? [];
          return (
            <li key={block.blockUuid} className="agenda__row">
              <span className="agenda__title">{block.title}</span>
              <strong className="numeric">{ran ? blockTiming(block) : block.status === APP_MEETING_BLOCK_STATUSES.skipped ? "Skipped" : "Not reached"}</strong>
              <div className="agenda__meta small numeric">
                <span>Original {formatClock(block.predictedMs)}</span>
                {allowance !== undefined && allowance !== block.predictedMs ? <span>Started with {formatClock(allowance)}</span> : null}
                {ran ? <span>Actual {formatClock(block.actualMs)}</span> : null}
              </div>
              {changes.length > 0 ? (
                <details className="more agenda__receipt">
                  <summary>Time changes for {changes.length} {changes.length === 1 ? "block" : "blocks"}</summary>
                  <ul className="more__body numeric">
                    {changes.map((change) => <li key={change.blockUuid}>{names.get(change.blockUuid)} · {formatClock(change.beforeMs)} → {formatClock(change.afterMs)} ({signedClock(change.afterMs - change.beforeMs)})</li>)}
                  </ul>
                </details>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function MeetingOutcomeView({ meeting }: { meeting: AppMeeting }) {
  const outcome = meetingOutcome(meeting);
  return (
    <>
      <section className="summary" aria-label="Summary">
        <p className="summary__headline">{outcome.sentence}</p>
        <p className="summary__detail numeric">
          Planned {formatLength(outcome.predictedMs)}, took {formatLength(outcome.actualMs)}.
        </p>
      </section>
      <MeetingHistory blocks={outcome.rows.map(({ block }) => block)} meeting={meeting} />
    </>
  );
}
