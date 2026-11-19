import process from "node:process";

type AppSignIn = { issuer: string; authorizationEndpoint: string; tokenEndpoint: string; redirectUri: string };
type AppDiscovery = { signIn?: AppSignIn };
type ProviderDiscovery = { issuer: string; authorization_endpoint: string; token_endpoint: string };

const appOrigin = new URL(process.argv[2] ?? "https://done-when.custd.dev").origin;

async function fetchMetadata<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`metadata request returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

try {
  const { signIn } = await fetchMetadata<AppDiscovery>(`${appOrigin}/.well-known/custd.json`);
  if (!signIn) throw new Error("the app has no sign-in configuration");
  const issuer = new URL(signIn.issuer);
  if (issuer.protocol !== "https:") throw new Error("the issuer must use HTTPS");
  const provider = await fetchMetadata<ProviderDiscovery>(`${issuer.href.replace(/\/$/, "")}/.well-known/openid-configuration`);
  if (signIn.issuer !== provider.issuer) {
    throw new Error("the app and provider advertise different issuer identifiers");
  }
  if (signIn.authorizationEndpoint !== provider.authorization_endpoint || signIn.tokenEndpoint !== provider.token_endpoint) {
    throw new Error("the app and provider advertise different OAuth endpoints");
  }
  if (new URL(signIn.redirectUri).origin !== appOrigin) {
    throw new Error("the callback must return to the app origin");
  }
  console.log(`Sign-in discovery matches its identity provider for ${appOrigin}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not verify sign-in discovery");
  process.exitCode = 1;
}
