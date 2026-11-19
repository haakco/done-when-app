import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Field } from "../components/Field";
import { WriteError } from "../components/ItemStates";
import { WithData } from "../components/WithData";
import type { DoneWhenData } from "../data";
import { ownerPath } from "../lib/links";

export function NewPlanPage() {
  return (
    <>
      <h1>New plan</h1>
      <p className="lede">Connect the work that needs to finish and forecast when it will all be done.</p>
      <WithData>{({ data }) => <PlanForm data={data} />}</WithData>
    </>
  );
}

function PlanForm({ data }: { data: DoneWhenData }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => data.createPlan(name.trim()),
    onSuccess: (created) => navigate(ownerPath("plan", created.ownerToken)),
  });
  return (
    <form className="form" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
      <Field label="Plan name">
        {(control) => <input {...control} required maxLength={255} value={name} onChange={(event) => { setName(event.target.value); }} />}
      </Field>
      <WriteError error={create.error} />
      <button type="submit" className="button button--primary" disabled={create.isPending || !name.trim()}>
        {create.isPending ? "Creating…" : "Create plan"}
      </button>
    </form>
  );
}
