import { useLocation } from "react-router";
import { CounterForm, type CounterFormValues } from "../components/CounterForm";
import { WithData } from "../components/WithData";

/** Router state that pre-fills the form, e.g. when starting a new run from a counter. */
export type NewRunState = { newRun: CounterFormValues };

export function NewCounterPage() {
  const location = useLocation();
  const newRun = (location.state as Partial<NewRunState> | null)?.newRun;
  return (
    <>
      <h1>{newRun ? `New run: ${newRun.name}` : "New counter"}</h1>
      <p className="lede">Count your way to a target and see when you will get there.</p>
      <WithData>{({ data }) => <CounterForm data={data} moreOpen {...(newRun ? { initial: newRun } : {})} />}</WithData>
    </>
  );
}
