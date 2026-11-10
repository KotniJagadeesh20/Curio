import { Navigate, Route, Routes } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminRoute, ProtectedRoute } from "@/components/RouteGuards";
import Landing from "./pages/Landing";
import Tracks from "./pages/Tracks";
import TopicPage from "./pages/TopicPage";
import PracticePage from "./pages/PracticePage";
import SystemDesignPage from "./pages/SystemDesignPage";
import Problem from "./pages/Problem";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import Blog from "./pages/Blog";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminProblems from "./pages/admin/AdminProblems";
import AdminUsers from "./pages/admin/AdminUsers";
import {
  CollectionEditorPage,
  CreatorProfilePage,
  DiscoverPage,
  PageEditorPage,
  ProfileSettingsPage,
  PublicCollectionPage,
  PublicPageViewPage,
  WorkspacePage,
} from "./pages/creator/Placeholders";

/**
 * Every route of the app (the router itself lives in App.tsx so tests can mount this under a MemoryRouter).
 *
 * Creator URLs are "/@username/...". React Router 6 can't match "@:username" inside a segment, so they are matched
 * as ":handle" and each screen renders NotFound unless the segment is a valid "@handle" (`parseHandle`). Static
 * routes always outrank ":handle", and the backend reserves usernames such as create/settings/discover, so an
 * @-less handle can never shadow a real page.
 */
export const AppRoutes = () => (
  <Routes>
    {/* Admin routes - separate layout. ADMIN only (UX gate; the backend enforces it on every /api/admin call). */}
    <Route element={<AdminRoute />}>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        {/* Track management moved to the creator workspace (owner-checked); keep old bookmarks working. */}
        <Route path="tracks" element={<Navigate to="/create" replace />} />
        <Route path="problems" element={<AdminProblems />} />
        <Route path="users" element={<AdminUsers />} />
      </Route>
    </Route>

    {/* Public routes */}
    <Route
      path="*"
      element={
        <div className="min-h-screen flex flex-col">
          <Navbar />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/tracks" element={<Tracks />} />
              <Route path="/track/:trackId" element={<TopicPage />} />
              <Route path="/track/:trackId/:topicId" element={<TopicPage />} />
              <Route path="/practice" element={<PracticePage />} />
              <Route path="/system-design" element={<SystemDesignPage />} />
              <Route path="/problem/:problemId" element={<Problem />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/discover" element={<DiscoverPage />} />

              {/* Any logged-in user (the backend checks ownership per object on every call) */}
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/create" element={<WorkspacePage />} />
                <Route path="/create/collections/:id" element={<CollectionEditorPage />} />
                <Route path="/create/pages/:id" element={<PageEditorPage />} />
                <Route path="/settings/profile" element={<ProfileSettingsPage />} />
              </Route>

              {/* Public creator pages: "/@username[/collection[/module/page]]" (keep after the static routes) */}
              <Route path="/:handle" element={<CreatorProfilePage />} />
              <Route path="/:handle/:collectionSlug" element={<PublicCollectionPage />} />
              <Route path="/:handle/:collectionSlug/:moduleSlug/:pageSlug" element={<PublicPageViewPage />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
        </div>
      }
    />
  </Routes>
);
