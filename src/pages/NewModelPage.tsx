import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ExpiryField } from "../components/ExpiryField";
import { Field } from "../components/Field";
import { WriteError } from "../components/ItemStates";
import { WithData } from "../components/WithData";
import type { DoneWhenData, ModelDraft } from "../data";
import { DEFAULT_EXPIRY_SECONDS } from "../lib/expiry";
import { ownerPath } from "../lib/links";

export function NewModelPage() {
  return (
    <>
      <h1>New model</h1>
      <p className="lede">Write down what you are unsure of as ranges, combine them with formulas, and see the range of the answer.</p>
      <WithData>{({ data }) => <ModelForm data={data} />}</WithData>
    </>
  );
}

function ModelForm({ data }: { data: DoneWhenData }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [expiry, setExpiry] = useState(DEFAULT_EXPIRY_SECONDS);
  const create = useMutation({
    mutationFn: (draft: ModelDraft) => data.createModel(draft),
    onSuccess: (created) => navigate(ownerPath("model", created.ownerToken)),
  });
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate({ name: name.trim(), description: description.trim(), expiresAfterSeconds: expiry });
      }}
    >
      <Field label="What are you working out?" hint="For example: monthly hosting cost, people needed for launch.">
        {(control) => <input {...control} required maxLength={255} value={name} onChange={(event) => { setName(event.target.value); }} />}
      </Field>
      <details className="more">
        <summary>More options: description, expiry</summary>
        <div className="more__body">
          <Field label="Description" hint="Optional">
            {(control) => <textarea {...control} value={description} onChange={(event) => { setDescription(event.target.value); }} />}
          </Field>
          <ExpiryField value={expiry} onChange={setExpiry} />
        </div>
      </details>
      <WriteError error={create.error} />
      <div className="button-row">
        <button type="submit" className="button button--primary button--big" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create model"}
        </button>
      </div>
    </form>
  );
}
