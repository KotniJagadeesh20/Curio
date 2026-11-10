import { Link } from "react-router-dom";
import { Users, BookOpen, Code2, FileText, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/QueryState";
import { useAdminProblems, useAdminUsers } from "@/hooks/useAdmin";
import { useMyCollections } from "@/hooks/useContent";
import { paths } from "@/lib/paths";

function Stat({ title, value, sub, icon: Icon }: { title: string; value: number; sub?: string; icon: LucideIcon }) {
  return (
    <Card className="border-border">
      <CardContent className="p-5 flex items-center gap-4">
        <div className="p-3 rounded-xl bg-primary/10"><Icon className="h-5 w-5 text-primary" /></div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-sm text-muted-foreground">{title}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  // Admins don't list other creators' content (that is moderation, a later step): these are the admin's OWN collections,
  // which include the seeded AlgoQuest tracks.
  const tracksQ = useMyCollections();
  const problemsQ = useAdminProblems();
  const usersQ = useAdminUsers();

  const error = tracksQ.error ?? problemsQ.error ?? usersQ.error;
  if (tracksQ.isLoading || problemsQ.isLoading || usersQ.isLoading) return <div className="p-6"><LoadingState /></div>;
  if (error) return <div className="p-6"><ErrorState error={error} onRetry={() => { tracksQ.refetch(); problemsQ.refetch(); usersQ.refetch(); }} /></div>;

  const tracks = tracksQ.data ?? [];
  const problems = problemsQ.data ?? [];
  const users = usersQ.data ?? [];
  const published = tracks.filter((t) => t.status === "PUBLISHED").length;
  const lessons = tracks.reduce((n, t) => n + t.publishedPageCount, 0);
  const newest = [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of problems, users and your own collections</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat title="Users" value={users.length} sub={`${users.filter((u) => u.role === "ADMIN").length} admin`} icon={Users} />
        <Stat title="Your collections" value={tracks.length} sub={`${published} published, ${tracks.length - published} other`} icon={BookOpen} />
        <Stat title="Your published pages" value={lessons} icon={FileText} />
        <Stat title="Problems" value={problems.length} sub={`${problems.filter((p) => p.published).length} published`} icon={Code2} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Your collections</CardTitle>
            <Link to={paths.workspace()}><Button variant="outline" size="sm">Manage</Button></Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {tracks.length === 0 && <p className="text-sm text-muted-foreground">No collections yet.</p>}
            {tracks.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{t.title}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-muted-foreground">{t.pageCount} pages</span>
                  <Badge variant={t.status === "PUBLISHED" ? "default" : "secondary"}>{t.status === "PUBLISHED" ? "Published" : t.status === "UNLISTED" ? "Unlisted" : "Draft"}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Newest users</CardTitle>
            <Link to="/admin/users"><Button variant="outline" size="sm">All users</Button></Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {newest.map((u) => (
              <div key={u.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{new Date(u.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
