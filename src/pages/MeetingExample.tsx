import { useState } from "react";
import { Link } from "react-router";
import { MEETING_EXAMPLE_START, meetingExample, meetingExampleSteps, type MeetingExampleStep } from "../data/meeting-example";
import { formatClock, formatLength, liveAgenda, meetingOutcome } from "../lib/meeting";
import { MeetingAgenda, MeetingOutcomeView, MeetingStatus } from "./MeetingView";

const MINUTE = 60_000;
const nextStep = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 0 } as const;

export default function MeetingExample() {
  const [step, setStep] = useState<MeetingExampleStep>(0);
  const [readOnly, setReadOnly] = useState(false);
  const meeting = meetingExample(step);
  const { minute, action } = meetingExampleSteps[step];
  const agenda = liveAgenda(meeting, MEETING_EXAMPLE_START + minute * MINUTE);
  const ended = step === 4;

  const projected = agenda.endsAtMs === null ? null : formatLength(agenda.endsAtMs - MEETING_EXAMPLE_START);
  const stageDescription = ended ? meetingOutcome(meeting).sentence
    : agenda.current && projected ? `${agenda.current.block.title}. Projected finish: ${projected} after start.`
    : "Ready to start.";

  return (
    <article className="item meeting" aria-labelledby="sample-meeting-title">
      <p className="small muted">Sample meeting · Fictional agenda</p>
      <h1 id="sample-meeting-title">{meeting.name}</h1>
      <p>Step through a 10-minute launch review. Each step advances the sample clock.</p>
      <div className="button-row">
        {!readOnly ? (
          <button type="button" className="button button--primary" onClick={() => { setStep(nextStep[step]); }}>
            {action}
          </button>
        ) : null}
        <button type="button" className="button" aria-pressed={readOnly} onClick={() => { setReadOnly(!readOnly); }}>
          Show read-only view
        </button>
      </div>
      <p className="visually-hidden" role="status">{stageDescription}</p>
      {readOnly ? <p className="notice">Read-only view. Viewers can follow the agenda and results.</p> : null}
      <MeetingStatus meeting={meeting} />
      {agenda.current && projected ? (
        <section className="summary meeting-now" aria-labelledby="sample-current">
          <h2 id="sample-current">{agenda.current.block.title}</h2>
          <p className="meeting-now__clock numeric" role="timer" aria-label="Sample meeting elapsed">{formatClock(minute * MINUTE)} elapsed</p>
          <p>
            {agenda.current.overMs > 0
              ? `${formatLength(agenda.current.overMs)} over the allocated time.`
              : `${formatLength(agenda.current.leftMs)} left in this block (originally ${formatLength(agenda.current.block.predictedMs)} planned).`}
            {" "}Projected finish: {projected} after start.
          </p>
        </section>
      ) : null}
      {step === 2 ? <p>Review finished 2 min early. Decisions now have 7 min.</p> : null}
      {ended ? (
        <>
          <MeetingOutcomeView meeting={meeting} />
          <section className="section" aria-labelledby="sample-follow-up">
            <h2 id="sample-follow-up">Follow-up</h2>
            <p>Decision: Keep the launch date.</p>
            <p>Action: <Link to="/examples/plan#example-part-pages">Finish editing the remaining pages</Link>.</p>
          </section>
        </>
      ) : <MeetingAgenda agenda={agenda} running={step !== 0} />}
      <div className="button-row section">
        <Link className="button button--primary" to="/new/meeting">Start your own meeting</Link>
        <Link className="button" to="/examples/dashboard">See the sample dashboard</Link>
      </div>
    </article>
  );
}
