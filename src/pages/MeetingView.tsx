import { useAppMeeting } from "@haakco/custd-react";
import { APP_MEETING_BLOCK_STATUSES, APP_MEETING_STATUSES, type AppMeeting } from "@haakco/custd-sdk/browser";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
import { formatClock, formatDifference, formatLength, liveAgenda, meetingOutcome, type CurrentBlock, type LiveAgenda } from "../lib/meeting";
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
  return (
    <article aria-labelledby="item-name" className="item meeting">
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
      {meeting.status === APP_MEETING_STATUSES.completed || meeting.status === APP_MEETING_STATUSES.cancelled ? <Outcome meeting={meeting} /> : null}
      {meeting.status === APP_MEETING_STATUSES.completed || meeting.status === APP_MEETING_STATUSES.cancelled ? null : <Agenda agenda={agenda} running={running} />}
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
  const over = current.overMs > 0;
  const nextTitle = agenda.upcoming.find((block) => block.lengthMs > 0)?.block.title;
  const late = agenda.endsAtMs !== null && meeting.endsAt ? agenda.endsAtMs - Date.parse(meeting.endsAt) : 0;
  return (
    <section className={`summary meeting-now${over ? " meeting-now--over" : ""}`} aria-labelledby="now-title">
      <p className="meeting-now__label small">
        Now · block {current.block.position} of {meeting.blocks?.length ?? 0}
      </p>
      <h2 id="now-title" className="meeting-now__title">
        {current.block.title}
      </h2>
      <p className="meeting-now__clock numeric" role="timer" aria-live="off">
        {over ? (
          <>
            <span aria-hidden="true">! </span>
            {formatClock(current.overMs)} over
          </>
        ) : (
          <>{formatClock(current.leftMs)} left</>
        )}
      </p>
      <p className="summary__detail meeting-now__detail">
        {over ? "Over time. The blocks after this one are shrinking to fit." : `Planned ${formatLength(current.block.allocatedMs)}.`}{" "}
        {meeting.endsAt && agenda.endsAtMs !== null && late !== 0 ? `Originally planned to end at ${formatTime(new Date(meeting.endsAt))}. ` : ""}
        {agenda.endsAtMs !== null ? `Ends ${late >= 60_000 ? `late, at ${formatTime(new Date(agenda.endsAtMs))}` : `at ${formatTime(new Date(agenda.endsAtMs))}`}.` : ""}
      </p>
      <OverrunAnnouncer title={current.block.title} over={over} />
      {owner ? <StepButtons data={data} access={access} blockUuid={current.block.blockUuid} nextTitle={nextTitle ?? null} refresh={refresh} /> : null}
    </section>
  );
}

/** Says once, politely, when the block changes and when it runs over; the clock itself stays quiet. */
function OverrunAnnouncer({ title, over }: { title: string; over: boolean }) {
  const [message, setMessage] = useState("");
  const said = useRef({ title: "", over: false });
  useEffect(() => {
    if (said.current.title !== title) setMessage(`Now: ${title}.`);
    else if (over && !said.current.over) setMessage(`${title} is over time.`);
    said.current = { title, over };
  }, [title, over]);
  return (
    <span className="visually-hidden" role="status">
      {message}
    </span>
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
  const waiting = advance.isPending || sentFor === blockUuid;
  const error = [advance.error, end.error].find((candidate) => candidate && !isStaleMeetingStep(candidate)) ?? null;
  return (
    <>
      <div className="button-row meeting-now__steps">
        <button
          type="button"
          className="button button--primary button--big"
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

function Agenda({ agenda, running }: { agenda: LiveAgenda; running: boolean }) {
  return (
    <section className="section" aria-labelledby="agenda-heading">
      <h2 id="agenda-heading">{running ? "Rest of the agenda" : "Agenda"}</h2>
      <ol className="agenda">
        {agenda.done.map((block) => (
          <li key={block.blockUuid} className="agenda__row agenda__row--done">
            <span className="agenda__title">
              <span aria-hidden="true">✓ </span>
              {block.title}
            </span>
            <span className="agenda__time numeric">
              {block.status === APP_MEETING_BLOCK_STATUSES.skipped ? "Skipped" : `Took ${formatLength(block.actualMs)} (planned ${formatLength(block.predictedMs)})`}
            </span>
          </li>
        ))}
        {agenda.current ? (
          <li className="agenda__row agenda__row--now">
            <span className="agenda__title">
              <span aria-hidden="true">● </span>
              {agenda.current.block.title}
            </span>
            <span className="agenda__time numeric">On now</span>
          </li>
        ) : null}
        {agenda.upcoming.map(({ block, lengthMs, startsAtMs }) => {
          const changed = Math.abs(lengthMs - block.predictedMs) >= 1000;
          return (
            <li key={block.blockUuid} className="agenda__row">
              <span className="agenda__title">{block.title}</span>
              <span className="agenda__time numeric">
                {lengthMs === 0 ? (
                  "No time left"
                ) : (
                  <>
                    {formatLength(lengthMs)}
                    {changed ? <span className="agenda__was"> (was {formatLength(block.predictedMs)})</span> : null}
                    {running ? ` · from ${formatTime(new Date(startsAtMs))}` : startsAtMs === 0 ? " · first" : ` · starts ${formatLength(startsAtMs)} in`}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Outcome({ meeting }: { meeting: AppMeeting }) {
  const outcome = meetingOutcome(meeting);
  return (
    <>
      <section className="summary" aria-label="Summary">
        <p className="summary__headline">{outcome.sentence}</p>
        <p className="summary__detail numeric">
          Planned {formatLength(outcome.predictedMs)}, took {formatLength(outcome.actualMs)}.
        </p>
      </section>
      <section className="section" aria-labelledby="outcome-heading">
        <h2 id="outcome-heading">Planned and actual</h2>
        <div className="table-scroll">
          <table className="estimates outcome-table numeric">
            <thead>
              <tr>
                <th scope="col">Block</th>
                <th scope="col">Planned</th>
                <th scope="col">Actual</th>
                <th scope="col">Difference</th>
              </tr>
            </thead>
            <tbody>
              {outcome.rows.map((row) => (
                <tr key={row.block.blockUuid}>
                  <th scope="row">{row.block.title}</th>
                  <td>{formatLength(row.block.predictedMs)}</td>
                  <td>{row.actualMs === null ? "Not reached" : formatLength(row.actualMs)}</td>
                  <td>{row.differenceMs === null ? "—" : formatDifference(row.differenceMs)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td>{formatLength(outcome.predictedMs)}</td>
                <td>{formatLength(outcome.actualMs)}</td>
                <td>{formatDifference(outcome.differenceMs)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}
