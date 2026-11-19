import type { AppMeetingAction, AppMeetingMinutes, AppMeetingMinutesUpdate } from "@haakco/custd-sdk/browser";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Field } from "../components/Field";
import { WriteError } from "../components/ItemStates";
import { useItemRead } from "../data/live";
import { itemNameOf } from "../data/mappers";
import { recentItems, savedShareToken } from "../lib/device";
import { tokenFromPaste } from "../lib/links";

type MinutesProps = {
  saved: AppMeetingMinutes | undefined;
  revision: number;
  save: (update: AppMeetingMinutesUpdate) => Promise<void>;
};

export function MeetingMinutes({ saved, revision, save }: MinutesProps) {
  const [minutes, setMinutes] = useState(saved?.minutes ?? "");
  const [decisions, setDecisions] = useState(saved?.decisions ?? "");
  const [actions, setActions] = useState<AppMeetingAction[]>(saved?.actions ?? []);
  const [plan, setPlan] = useState(saved?.planUuid ?? "");
  const update = useMutation({ mutationFn: save });
  const choices = recentItems().flatMap((item) => {
    if (item.kind !== "plan") return [];
    const token = savedShareToken(item.itemUuid) ?? (item.role === "share" ? tokenFromPaste(item.path) : null);
    return token ? [{ id: item.itemUuid, name: item.name, token }] : [];
  });
  const selected = choices.find((choice) => choice.id === plan);
  const planRead = useItemRead(selected?.token ?? null);
  const parts = planRead.status === "ready" ? planRead.data.plan?.parts ?? [] : [];

  function switchPlan(id: string) {
    setPlan(id);
    setActions(actions.map(({ description }) => ({ description })));
  }

  return (
    <details className="more section">
      <summary>Private meeting minutes</summary>
      <form className="form more__body" onSubmit={(event) => {
        event.preventDefault();
        update.mutate({
          expectedRevision: revision,
          minutes,
          decisions,
          actions,
          ...(plan ? { planUuid: plan } : {}),
          ...(selected && plan !== saved?.planUuid ? { planLinkToken: selected.token } : {}),
        });
      }}>
        <Field label="Minutes">
          {(control) => <textarea {...control} maxLength={8000} value={minutes} onChange={(event) => { setMinutes(event.target.value); }} />}
        </Field>
        <Field label="Decisions">
          {(control) => <textarea {...control} maxLength={8000} value={decisions} onChange={(event) => { setDecisions(event.target.value); }} />}
        </Field>
        <Field label="Related plan">
          {(control) => (
            <select {...control} value={plan} onChange={(event) => { switchPlan(event.target.value); }}>
              <option value="">No plan</option>
              {plan && !selected ? <option value={plan}>Linked plan</option> : null}
              {choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
            </select>
          )}
        </Field>
        {actions.map((action, index) => (
          <fieldset key={index}>
            <legend>Action {index + 1}</legend>
            <label>
              Description
              <input value={action.description} required maxLength={500} onChange={(event) => {
                setActions(actions.map((entry, position) => position === index ? { ...entry, description: event.target.value } : entry));
              }} />
            </label>
            {parts.length > 0 && selected ? (
              <label>
                Plan part
                <select value={action.partUuid ?? ""} onChange={(event) => {
                  const { value } = event.target;
                  setActions(actions.map((entry, position) => position === index
                    ? { description: entry.description, ...(value ? { partUuid: value } : {}) }
                    : entry));
                }}>
                  <option value="">No part</option>
                  {parts.map((part) => (
                    <PartOption key={part.itemUuid} token={selected.token} id={part.itemUuid} />
                  ))}
                </select>
              </label>
            ) : null}
            <button type="button" className="button button--quiet" onClick={() => {
              setActions(actions.filter((_, position) => position !== index));
            }}>Remove action {index + 1}</button>
          </fieldset>
        ))}
        <button type="button" className="button" disabled={actions.length >= 40} onClick={() => {
          setActions([...actions, { description: "" }]);
        }}>Add action</button>
        <WriteError error={update.error} />
        <button type="submit" className="button button--primary" disabled={update.isPending}>Save minutes</button>
        {update.isSuccess ? <p role="status">Minutes saved.</p> : null}
      </form>
    </details>
  );
}

function PartOption({ token, id }: { token: string; id: string }) {
  const read = useItemRead(token, { item: id });
  return <option value={id} disabled={read.status !== "ready"}>
    {read.status === "ready" ? itemNameOf(read.data) : "Loading part…"}
  </option>;
}
