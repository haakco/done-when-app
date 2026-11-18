import { CustdHostedAppProvider } from "@haakco/custd-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useNavigate } from "react-router";
import { App } from "./App";
import "./styles/app.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("index.html is missing #root");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchIntervalInBackground: false, retry: 1 },
    mutations: { retry: false },
  },
});

/** Starts the hosted app once; a finished sign-in returns to the page it began on. */
function HostedApp({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <CustdHostedAppProvider
      onSignInComplete={(returnTo) => {
        void navigate(returnTo, { replace: true });
      }}
    >
      {children}
    </CustdHostedAppProvider>
  );
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <HostedApp>
          <App />
        </HostedApp>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
