"use client";

import { useAuth } from "@/components/auth-provider";
import { AdminShell } from "@/components/admin-shell";
import { NotFoundView } from "@/components/not-found-view";

const ADMIN_ROLES = new Set([
  "super_admin",
  "operations_admin",
  "billing_admin",
  "support_admin",
  "security_admin",
  "auditor",
]);

export function AdminGate({ children }) {
  const auth = useAuth();
  const role = auth?.account?.platformRole;
  const isAdmin = Boolean(role && ADMIN_ROLES.has(role));

  // Deliberately render the same public 404 first. AuthProvider validates the
  // signed-in session in the background; only a verified platform admin ever
  // gets the admin shell mounted.
  if (auth.loading || !isAdmin) return <NotFoundView />;

  return <AdminShell>{children}</AdminShell>;
}
