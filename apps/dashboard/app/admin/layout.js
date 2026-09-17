import { AdminGate } from "@/components/admin-gate";

export default function AdminLayout({ children }) {
  return <AdminGate>{children}</AdminGate>;
}
