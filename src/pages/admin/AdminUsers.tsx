import { useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/QueryState";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useAdminUsers, useSetRole } from "@/hooks/useAdmin";
import type { User } from "@/lib/types";

export default function AdminUsers() {
  const { user: me } = useAuth();
  const { data, isLoading, error, refetch } = useAdminUsers();
  const setRole = useSetRole();
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<User | null>(null);

  if (isLoading) return <div className="p-6"><LoadingState /></div>;
  if (error) return <div className="p-6"><ErrorState error={error} onRetry={refetch} /></div>;

  const users = data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = users.filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  const nextRole = (u: User) => (u.role === "ADMIN" ? "USER" : "ADMIN");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground">{users.length} registered · promote trusted users to admin</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell><Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>{u.role}</Badge></TableCell>
                  <TableCell className="text-right">
                    {u.id === me?.id ? (
                      <span className="text-xs text-muted-foreground">You</span>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setPending(u)}>
                        {u.role === "ADMIN" ? "Remove admin" : "Make admin"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending ? `${pending.role === "ADMIN" ? "Remove admin from" : "Make admin"} ${pending.name}?` : ""}
        description={pending?.role === "ADMIN"
          ? "They will lose access to the admin area immediately."
          : "Admins can create, edit and delete all tracks, lessons, problems and change user roles."}
        confirmLabel="Confirm"
        onConfirm={() => { if (pending) setRole.mutate({ id: pending.id, role: nextRole(pending) }); setPending(null); }}
      />
    </div>
  );
}
