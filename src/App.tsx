import { Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { ApiPage } from "./pages/ApiPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { CounterPage } from "./pages/CounterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HomePage } from "./pages/HomePage";
import { MyItemsPage } from "./pages/MyItemsPage";
import { NewCounterPage } from "./pages/NewCounterPage";
import { NewDashboardPage } from "./pages/NewDashboardPage";
import { NewProjectPage } from "./pages/NewProjectPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProjectPage } from "./pages/ProjectPage";

/** Every app route. Keep public/custd-app.json's SPA fallbacks and shareable routes in step. */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="new/counter" element={<NewCounterPage />} />
        <Route path="new/project" element={<NewProjectPage />} />
        <Route path="new/dashboard" element={<NewDashboardPage />} />
        <Route path="c/:token" element={<CounterPage mode="share" />} />
        <Route path="edit/c/:token" element={<CounterPage mode="owner" />} />
        <Route path="p/:token" element={<ProjectPage mode="share" />} />
        <Route path="edit/p/:token" element={<ProjectPage mode="owner" />} />
        <Route path="d/:token" element={<DashboardPage mode="share" />} />
        <Route path="edit/d/:token" element={<DashboardPage mode="owner" />} />
        <Route path="mine" element={<MyItemsPage />} />
        <Route path="api" element={<ApiPage />} />
        <Route path="auth/callback" element={<AuthCallbackPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
