import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ExpiryField } from "../components/ExpiryField";
import { Field } from "../components/Field";
import { data, type ProjectDraft } from "../data";
import { DEFAULT_EXPIRY_SECONDS } from "../lib/expiry";
import { itemPath } from "../lib/links";

export function NewProjectPage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ProjectDraft>({ name: "", definitionOfDone: "", deliveryTarget: "", expiresAfterSeconds: DEFAULT_EXPIRY_SECONDS });
  const create = useMutation({
    mutationFn: (next: ProjectDraft) => data.createProject(next),
    onSuccess: (created) => navigate(itemPath("project", "owner", created.links.ownerToken)),
  });
  return (
    <>
      <h1>New project</h1>
      <p className="lede">Write down what done means, promise a date, and watch your estimates close in.</p>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(draft);
        }}
      >
        <Field label="Project name">
          {(control) => <input {...control} required value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); }} />}
        </Field>
        <Field label="Done when…" hint="The definition of done everyone can check.">
          {(control) => (
            <textarea {...control} required value={draft.definitionOfDone} onChange={(event) => { setDraft({ ...draft, definitionOfDone: event.target.value }); }} />
          )}
        </Field>
        <Field label="Delivery target" hint="The date you have told people.">
          {(control) => (
            <input {...control} type="date" required value={draft.deliveryTarget} onChange={(event) => { setDraft({ ...draft, deliveryTarget: event.target.value }); }} />
          )}
        </Field>
        <ExpiryField value={draft.expiresAfterSeconds} onChange={(expiresAfterSeconds) => { setDraft({ ...draft, expiresAfterSeconds }); }} />
        {create.error ? <p className="field__error" role="alert">{create.error.message}</p> : null}
        <div className="button-row">
          <button type="submit" className="button button--primary" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
    </>
  );
}
