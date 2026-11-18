import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ALERT_RULE_TYPES, type AlertRule, type AlertRuleSpec, type AlertRuleType, type AlertWebhookCreated } from "../data/alerts";
import type { DoneWhenData, ItemAccess, ItemKind } from "../data";
import { formatDate } from "../lib/dates";
import { percent } from "../lib/forecast-text";
import { CopyButton } from "./CopyButton";
import { Field } from "./Field";
import { Loading, WriteError } from "./ItemStates";
import { useSession } from "./Session";

const RULE_CHOICES: Record<ItemKind, AlertRuleType[]> = {
  counter: [ALERT_RULE_TYPES.targetReached, ALERT_RULE_TYPES.deadlineProbabilityBelow, ALERT_RULE_TYPES.forecastMovedInsideTarget],
  project: [ALERT_RULE_TYPES.estimateStale],
  model: [],
  dashboard: [],
};

const RULE_LABEL: Record<AlertRuleType, string> = {
  target_reached: "The target is reached",
  deadline_probability_below: "The chance of making the date drops below…",
  forecast_moved_inside_target: "The forecast moves inside the deadline",
  estimate_stale: "No new estimate for…",
};

export function ruleText(rule: AlertRuleSpec): string {
  if (rule.type === ALERT_RULE_TYPES.deadlineProbabilityBelow && rule.threshold !== undefined) {
    return `The chance of making the date drops below ${percent(rule.threshold)}`;
  }
  if (rule.type === ALERT_RULE_TYPES.estimateStale && rule.staleDays !== undefined) {
    return `No new estimate for ${rule.staleDays} days`;
  }
  return RULE_LABEL[rule.type];
}

type Props = { data: DoneWhenData; access: ItemAccess; kind: ItemKind };

/** Alert rules and where they go: a signed webhook, or email for a signed-in owner. */
export function AlertsPanel({ data, access, kind }: Props) {
  const key = ["alerts", typeof access === "string" ? access : access.item] as const;
  const client = useQueryClient();
  const settings = useQuery({ queryKey: key, queryFn: () => data.alertSettings(access) });
  const deliveries = useQuery({ queryKey: [...key, "deliveries"], queryFn: () => data.alertDeliveries(access), refetchInterval: 5_000 });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  if (settings.isPending) return <Loading what="alerts" />;
  if (settings.isError) return <WriteError error={settings.error} />;
  const rules = settings.data.rules ?? [];
  const webhooks = settings.data.webhooks ?? [];
  return (
    <div className="stack">
      {!settings.data.deliveryAvailable ? (
        <p className="notice notice--warn">Alerts are saved, but this Done When cannot send them yet.</p>
      ) : null}
      <RuleList data={data} access={access} rules={rules} onChange={refresh} />
      <AddRuleForm data={data} access={access} kind={kind} onAdded={refresh} />
      <h3>Where alerts go</h3>
      {webhooks.length === 0 ? <p className="small muted">No webhooks yet.</p> : null}
      <ul className="plain-list">
        {webhooks.map((webhook) => (
          <WebhookRow key={webhook.webhookUuid} endpoint={webhook.endpoint} onRemove={() => data.removeWebhook(access, webhook.webhookUuid).then(refresh)} />
        ))}
      </ul>
      <AddWebhookForm data={data} access={access} onAdded={refresh} />
      <EmailChoice data={data} access={access} subscribed={settings.data.subscription !== undefined} onChange={refresh} />
      {(deliveries.data?.deliveries ?? []).length > 0 ? (
        <>
          <h3>Recent alerts</h3>
          <ul className="plain-list small">
            {(deliveries.data?.deliveries ?? []).map((delivery) => (
              <li key={delivery.deliveryUuid}>
                {RULE_LABEL[delivery.ruleType]} · {delivery.channel === "webhook" ? "webhook" : "email"} ·{" "}
                <strong>{delivery.outcome === "sent" ? "sent" : delivery.outcome === "failed" ? "failed" : "sending"}</strong> ·{" "}
                {formatDate(delivery.createdAt)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function RuleList({ data, access, rules, onChange }: { data: DoneWhenData; access: ItemAccess; rules: AlertRule[]; onChange: () => unknown }) {
  const remove = useMutation({ mutationFn: (ruleUuid: string) => data.removeAlertRule(access, ruleUuid), onSuccess: onChange });
  if (rules.length === 0) return <p className="small muted">No alerts yet. Pick one below.</p>;
  return (
    <>
    <ul className="plain-list">
      {rules.map((rule) => (
        <li key={rule.ruleUuid} className="row-between">
          <span>
            {ruleText(rule)}
            {rule.crossings > 0 ? <span className="small muted"> · fired {rule.crossings}×</span> : null}
          </span>
          <button type="button" className="button button--quiet" disabled={remove.isPending} onClick={() => { remove.mutate(rule.ruleUuid); }}>
            Remove<span className="visually-hidden"> alert: {ruleText(rule)}</span>
          </button>
        </li>
      ))}
    </ul>
    <WriteError error={remove.error} />
    </>
  );
}

function AddRuleForm({ data, access, kind, onAdded }: Props & { onAdded: () => unknown }) {
  const choices = RULE_CHOICES[kind];
  const [type, setType] = useState<AlertRuleType>(choices[0] ?? ALERT_RULE_TYPES.targetReached);
  const [threshold, setThreshold] = useState("50");
  const [staleDays, setStaleDays] = useState("14");
  const add = useMutation({ mutationFn: (rule: AlertRuleSpec) => data.addAlertRule(access, rule), onSuccess: onAdded });
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        const rule: AlertRuleSpec = { type };
        if (type === ALERT_RULE_TYPES.deadlineProbabilityBelow) rule.threshold = Number(threshold) / 100;
        if (type === ALERT_RULE_TYPES.estimateStale) rule.staleDays = Number(staleDays);
        add.mutate(rule);
      }}
    >
      <Field label="Alert me when">
        {(control) => (
          <select {...control} value={type} onChange={(event) => { setType(event.target.value as AlertRuleType); }}>
            {choices.map((choice) => (
              <option key={choice} value={choice}>
                {RULE_LABEL[choice]}
              </option>
            ))}
          </select>
        )}
      </Field>
      {type === ALERT_RULE_TYPES.deadlineProbabilityBelow ? (
        <Field label="Chance (%)">
          {(control) => <input {...control} type="number" min={1} max={99} required value={threshold} onChange={(event) => { setThreshold(event.target.value); }} />}
        </Field>
      ) : null}
      {type === ALERT_RULE_TYPES.estimateStale ? (
        <Field label="Days">
          {(control) => <input {...control} type="number" min={1} max={365} required value={staleDays} onChange={(event) => { setStaleDays(event.target.value); }} />}
        </Field>
      ) : null}
      <div className="button-row">
        <button type="submit" className="button" disabled={add.isPending}>
          {add.isPending ? "Adding…" : "Add alert"}
        </button>
      </div>
      <WriteError error={add.error} />
    </form>
  );
}

function WebhookRow({ endpoint, onRemove }: { endpoint: string; onRemove: () => Promise<unknown> }) {
  const remove = useMutation({ mutationFn: onRemove });
  return (
    <li className="row-between">
      <code className="link-text">{endpoint}</code>
      <button type="button" className="button button--quiet" disabled={remove.isPending} onClick={() => { remove.mutate(); }}>
        Remove<span className="visually-hidden"> webhook {endpoint}</span>
      </button>
      <WriteError error={remove.error} />
    </li>
  );
}

function AddWebhookForm({ data, access, onAdded }: { data: DoneWhenData; access: ItemAccess; onAdded: () => unknown }) {
  const [endpoint, setEndpoint] = useState("");
  const [created, setCreated] = useState<AlertWebhookCreated | null>(null);
  const add = useMutation({
    mutationFn: (url: string) => data.addWebhook(access, url),
    onSuccess: (result) => {
      setCreated(result);
      setEndpoint("");
      void onAdded();
    },
  });
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate(endpoint.trim());
      }}
    >
      <Field label="Webhook URL" hint="An https:// address. Each alert is a signed POST; Slack and similar tools accept them.">
        {(control) => <input {...control} type="url" required placeholder="https://" value={endpoint} onChange={(event) => { setEndpoint(event.target.value); }} />}
      </Field>
      <div className="button-row">
        <button type="submit" className="button" disabled={add.isPending}>
          {add.isPending ? "Adding…" : "Add webhook"}
        </button>
      </div>
      <WriteError error={add.error} />
      {created ? (
        <div className="notice" role="status">
          <p>
            Webhook added. Its signing secret is shown only now: use it to check the <code>X-Custd-Signature</code> header.
          </p>
          <CopyButton label="Copy signing secret" text={created.signingSecret} />
        </div>
      ) : null}
    </form>
  );
}

function EmailChoice({ data, access, subscribed, onChange }: { data: DoneWhenData; access: ItemAccess; subscribed: boolean; onChange: () => unknown }) {
  const session = useSession();
  const toggle = useMutation({
    mutationFn: async () => {
      if (subscribed) await data.unsubscribeEmail(access);
      else await data.subscribeEmail(access);
    },
    onSuccess: onChange,
  });
  if (!session.available) return null;
  if (!session.signedIn) {
    return (
      <div className="inline-action">
        <p className="small">Email alerts need sign-in, so they only go to your own verified address.</p>
        <button type="button" className="button" onClick={() => { session.signIn(); }}>
          Sign in for email alerts
        </button>
      </div>
    );
  }
  return (
    <div className="inline-action">
      <p className="small">{subscribed ? "Alerts are emailed to your verified address." : "Get these alerts by email too."}</p>
      <button type="button" className="button" disabled={toggle.isPending} onClick={() => { toggle.mutate(); }}>
        {subscribed ? "Stop emails" : "Email me"}
      </button>
      <WriteError error={toggle.error} />
    </div>
  );
}
