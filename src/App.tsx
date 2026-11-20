import { NewPlanPage } from "./pages/NewPlanPage";
import { Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { ApiPage } from "./pages/ApiPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { HomePage } from "./pages/HomePage";
import { ModelEmbedPage, OwnerPage, SharePage } from "./pages/ItemPage";
import { MyItemsPage } from "./pages/MyItemsPage";
import { NewCounterPage } from "./pages/NewCounterPage";
import { NewDashboardPage } from "./pages/NewDashboardPage";
import { NewMeetingPage } from "./pages/NewMeetingPage";
import { NewModelPage } from "./pages/NewModelPage";
import { NewProjectPage } from "./pages/NewProjectPage";
import { NotFoundPage } from "./pages/NotFoundPage";

/** Every app route. Keep public/custd-app.json's SPA fallbacks and shareable routes in step. */
export function App() {
  return (
    <Routes>
      <Route path="embed/model/:token" element={<ModelEmbedPage />} />
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="new/counter" element={<NewCounterPage />} />
        <Route path="new/project" element={<NewProjectPage />} />
        <Route path="new/model" element={<NewModelPage />} />
        <Route path="new/meeting" element={<NewMeetingPage />} />
        <Route path="new/plan" element={<NewPlanPage />} />
        <Route path="plan/:token" element={<SharePage />} />
        <Route path="new/dashboard" element={<NewDashboardPage />} />
        <Route path="c/:token" element={<SharePage />} />
        <Route path="p/:token" element={<SharePage />} />
        <Route path="m/:token" element={<SharePage />} />
        <Route path="meet/:token" element={<SharePage />} />
        <Route path="d/:token" element={<SharePage />} />
        <Route path="edit/:kind" element={<OwnerPage />} />
        <Route path="mine" element={<MyItemsPage />} />
        <Route path="api" element={<ApiPage />} />
        <Route path="auth/callback" element={<AuthCallbackPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
