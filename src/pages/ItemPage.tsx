import { APP_ITEM_ERROR_CODES, APP_LINK_ROLES, AppItemError } from "@haakco/custd-sdk/browser";
import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ItemFailed, Loading } from "../components/ItemStates";
import { WithData } from "../components/WithData";
import type { DoneWhenData, ItemAccess } from "../data";
import { useItemRead } from "../data/live";
import { itemKindOf, itemNameOf, KIND_PATH } from "../data/mappers";
import { rememberRecent } from "../lib/device";
import { ownerAccessFromHash } from "../lib/links";
import { CounterView } from "./CounterView";
import { DashboardView } from "./DashboardView";
import { MeetingView } from "./MeetingView";
import { ModelView } from "./ModelView";
import { ProjectView } from "./ProjectView";

/** `/c/<share token>`, `/p/…`, `/m/…`, `/meet/…`, `/d/…`: the read-only page. */
export function SharePage() {
  const { token = "" } = useParams();
  return <WithData>{({ data }) => <ItemPage data={data} access={token} route="share" />}</WithData>;
}

/** `/edit/<kind>#<owner token>`: the token stays in the fragment, so no server or page view sees it. */
export function OwnerPage() {
  const { hash } = useLocation();
  const access = ownerAccessFromHash(hash);
  if (access === null) return <ItemFailed error={new AppItemError(404, APP_ITEM_ERROR_CODES.notFound)} what="item" />;
  return <WithData>{({ data }) => <ItemPage data={data} access={access} route="owner" />}</WithData>;
}

type ItemPageProps = { data: DoneWhenData; access: ItemAccess; route: "owner" | "share" };

/** Reads the item and shows the page for its kind. The URL's kind segment is only a hint. */
function ItemPage({ data, access, route }: ItemPageProps) {
  const read = useItemRead(access);
  const navigate = useNavigate();
  const { kind: kindSegment } = useParams();
  const location = useLocation();
  const kind = read.status === "ready" ? itemKindOf(read.data) : null;
  const role = read.status === "ready" ? read.data.item.role : null;
  useEffect(() => {
    if (kind === null) return;
    const segment = KIND_PATH[kind];
    // An owner token pasted into a share path moves into the fragment at once.
    if (route === "share" && role === APP_LINK_ROLES.owner && typeof access === "string") {
      void navigate(`/edit/${segment}#${access}`, { replace: true });
    } else if (route === "share" && typeof access === "string" && !location.pathname.startsWith(`/${segment}/`)) {
      void navigate(`/${segment}/${access}`, { replace: true });
    } else if (route === "owner" && kindSegment !== segment) {
      void navigate(`/edit/${segment}${location.hash}`, { replace: true, state: location.state as unknown });
    }
  }, [kind, role, route, access, kindSegment, location, navigate]);

  const name = read.status === "ready" ? itemNameOf(read.data) : null;
  const itemUuid = read.status === "ready" ? read.data.item.itemUuid : null;
  useEffect(() => {
    if (kind === null || role === null || name === null || itemUuid === null) return;
    const segment = KIND_PATH[kind];
    const fragment = typeof access === "string" ? access : `item=${access.item}`;
    const path = role === APP_LINK_ROLES.owner ? `/edit/${segment}#${fragment}` : `/${segment}/${typeof access === "string" ? access : ""}`;
    rememberRecent({ itemUuid, kind, name, role, path, openedAt: new Date().toISOString() });
  }, [kind, role, name, itemUuid, access]);

  if (read.status === "loading") return <Loading what="item" />;
  if (read.status === "error") return <ItemFailed error={read.error} what="item" />;
  const view = { data, access, read: read.data, live: read, showOwnerTools: route === "owner" && role === APP_LINK_ROLES.owner, ownerRoute: route === "owner" };
  if (kind === "dashboard") return <DashboardView {...view} />;
  if (kind === "project") return <ProjectView {...view} />;
  if (kind === "model") return <ModelView {...view} />;
  if (kind === "meeting") return <MeetingView {...view} />;
  return <CounterView {...view} />;
}
