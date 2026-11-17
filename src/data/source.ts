import type {
  Counter,
  CounterDraft,
  CreatedItem,
  Dashboard,
  DashboardDraft,
  EstimateDraft,
  ItemView,
  Measurement,
  MyItem,
  Project,
  ProjectDraft,
  SignInCompletion,
  SignInState,
} from "./types";

/**
 * Every read and write the app makes. Pages only talk to this interface; the placeholder source
 * implements it today and a Custd SDK source (A4 link routes, A8 sign-in) replaces it.
 * Each token is an owner or share token; the source reports which access it grants.
 */
export type DoneWhenData = {
  createCounter(draft: CounterDraft): Promise<CreatedItem>;
  getCounter(token: string): Promise<ItemView<Counter>>;
  addMeasurements(ownerToken: string, measurements: Measurement[]): Promise<void>;
  setCounterStatus(ownerToken: string, status: Counter["status"]): Promise<void>;

  createProject(draft: ProjectDraft): Promise<CreatedItem>;
  getProject(token: string): Promise<ItemView<Project>>;
  addEstimate(ownerToken: string, estimate: EstimateDraft): Promise<void>;
  completeProject(ownerToken: string, completedOn: string): Promise<void>;
  cancelProject(ownerToken: string): Promise<void>;

  createDashboard(draft: DashboardDraft): Promise<CreatedItem>;
  getDashboard(token: string): Promise<ItemView<Dashboard>>;
  addDashboardEntry(ownerToken: string, entryRef: string): Promise<void>;
  removeDashboardEntry(ownerToken: string, shareToken: string): Promise<void>;

  getSignInState(): Promise<SignInState>;
  completeSignIn(callbackUrl: string): Promise<SignInCompletion>;
  listMyItems(): Promise<MyItem[]>;
};

export class ItemNotFoundError extends Error {
  constructor(token: string) {
    super(`No item for link ${token}`);
    this.name = "ItemNotFoundError";
  }
}

export class ReadOnlyLinkError extends Error {
  constructor() {
    super("This is a read-only share link");
    this.name = "ReadOnlyLinkError";
  }
}
