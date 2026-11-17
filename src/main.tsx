import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { ItemNotFoundError } from "./data";
import "./styles/app.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("index.html is missing #root");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchIntervalInBackground: false,
      // A missing or expired link will not appear on retry; show the not-found state at once.
      retry: (failures, error) => !(error instanceof ItemNotFoundError) && failures < 3,
    },
  },
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
