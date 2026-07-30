"use client";

import {
  Activity,
  History,
  ListChecks,
  Server,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { NavLink } from "./nav-link";

const infrastructure = [
  { href: "/admin/infrastructure", label: "Серверы", icon: Server },
  { href: "/admin/operations", label: "Операции", icon: ListChecks },
] as const;

export function AdminSidebar({ email }: { email: string }) {
  return (
    <Sidebar collapsible="icon" aria-label="Навигация администратора">
      <SidebarHeader className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ShieldCheck aria-hidden="true" className="size-4" />
              </span>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate font-semibold">Нейрокурс</span>
                <span className="truncate font-mono text-[0.66rem] uppercase tracking-[0.12em] text-muted-foreground">
                  Панель управления
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Управление</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {infrastructure.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <NavLink {...item} />
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <NavLink href="/admin/students" label="Ученики" icon={Users} />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavLink href="/admin/audit" label="Аудит" icon={History} />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavLink
                  href="/admin/settings"
                  label="Настройки"
                  icon={Settings2}
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip={email}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs font-semibold">
                A
              </span>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">Администратор</span>
                <span className="truncate text-xs text-muted-foreground">{email}</span>
              </span>
              <Activity
                aria-label="Сессия активна"
                className="ml-auto size-3.5 text-status-ready"
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <LogoutButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
