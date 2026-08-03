import { AdminHeader } from "@/components/shell/admin-header";
import { AdminSidebar } from "@/components/shell/admin-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireAdminPage } from "@/server/auth/page-access";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireAdminPage();

  return (
    <SidebarProvider className="bg-background">
      <AdminSidebar />
      <SidebarInset className="min-w-0 bg-background">
        <AdminHeader email={session.email} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
