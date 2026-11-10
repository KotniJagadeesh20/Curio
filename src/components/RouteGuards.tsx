import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Requires a logged-in user. Remembers where they were headed. */
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** UX gate only; the backend enforces ADMIN on every /api/admin call. */
export function AdminRoute() {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: "/admin" }} />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
