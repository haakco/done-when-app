import { CounterForm } from "../components/CounterForm";
import { WithData } from "../components/WithData";

export function NewCounterPage() {
  return (
    <>
      <h1>New counter</h1>
      <p className="lede">Count your way to a target and see when you will get there.</p>
      <WithData>{({ data }) => <CounterForm data={data} moreOpen />}</WithData>
    </>
  );
}
