import { AdminNav } from "@/components/AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-8">
      <AdminNav />
      {children}
    </div>
  );
}
