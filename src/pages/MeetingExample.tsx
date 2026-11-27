import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { LAST_MEETING_EXAMPLE_STEP, MEETING_EXAMPLE_START, meetingExample, meetingExampleStep, meetingExampleSteps } from "../data/meeting-example";
import { liveAgenda } from "../lib/meeting";
import { MeetingAgenda, MeetingClock, MeetingOutcomeView, MeetingStatus } from "./MeetingView";

const MINUTE = 60_000;

export default function MeetingExample() {
  const [params, setParams] = useSearchParams();
  const [readOnly, setReadOnly] = useState(false);
  const step = meetingExampleStep(params.get("meetingStep"));
  const meeting = meetingExample(step);
  const { minute, action } = meetingExampleSteps[step];
  const agenda = liveAgenda(meeting, MEETING_EXAMPLE_START + minute * MINUTE);
  const ended = step === LAST_MEETING_EXAMPLE_STEP;

  function advance() {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("meetingStep", String(ended ? 0 : step + 1));
      return next;
    }, { replace: true });
  }

  const controls = (
    <div className="button-row meeting-example__steps">
      {!readOnly ? <button type="button" className="button button--primary" onClick={advance}>{action}</button> : null}
      <button type="button" className="button" aria-pressed={readOnly} onClick={() => { setReadOnly(!readOnly); }}>
        Show read-only view
      </button>
    </div>
  );

  return (
    <article className="item meeting" aria-labelledby="sample-meeting-title">
      <p className="small muted">Sample meeting · Fictional agenda</p>
      <h1 id="sample-meeting-title">{meeting.name}</h1>
      <p>Step through a 15-minute launch review. Each step advances the sample clock.</p>
      {readOnly ? <p className="notice">Read-only view. Viewers can follow the agenda and results.</p> : null}
      <MeetingStatus meeting={meeting} />
      {agenda.current ? <MeetingClock meeting={meeting} current={agenda.current} endsAtMs={agenda.endsAtMs} /> : null}
      {controls}
      {ended ? (
        <>
          <MeetingOutcomeView meeting={meeting} />
          <section className="section" aria-labelledby="sample-follow-up">
            <h2 id="sample-follow-up">Follow-up</h2>
            <p>Decision: Keep the launch date.</p>
            <p>Action: <Link to={{ pathname: "/examples/plan", search: params.toString(), hash: "#example-part-pages" }}>Finish editing the remaining pages</Link>.</p>
          </section>
        </>
      ) : <MeetingAgenda agenda={agenda} meeting={meeting} running={step !== 0} />}
      <div className="button-row section">
        <Link className="button button--primary" to="/new/meeting?example=launch-review">Use this agenda</Link>
        <Link to="/new/meeting">Start a blank meeting</Link>
        <Link to={{ pathname: "/examples/dashboard", search: params.toString() }}>See the sample dashboard</Link>
      </div>
    </article>
  );
}
