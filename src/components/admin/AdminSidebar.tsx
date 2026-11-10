import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Code2,
  FolderKanban,
  Users,
  ChevronLeft,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

const adminLinks = [
  { name: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { name: "Problems", path: "/admin/problems", icon: FolderKanban },
  { name: "Users", path: "/admin/users", icon: Users },
];

export function AdminSidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 min-h-screen border-r border-border bg-sidebar-background flex flex-col">
      <div className="p-4 border-b border-border">
        <Link to="/admin" className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground">Admin Panel</span>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {adminLinks.map((link) => {
          const isActive =
            location.pathname === link.path ||
            (link.path !== "/admin" && location.pathname.startsWith(link.path));
          return (
            <Link
              key={link.path}
              to={link.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative",
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="admin-sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-primary"
                />
              )}
              <link.icon className="h-4 w-4" />
              {link.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        <Link
          to="/"
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to App
        </Link>
      </div>
    </aside>
  );
}
