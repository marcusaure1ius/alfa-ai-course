"use client";

import {
  Activity,
  Cable,
  Globe2,
  History,
  ListChecks,
  Server,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
  { href: "/admin/domains", label: "Домены и DNS", icon: Globe2 },
  { href: "/admin/timeweb", label: "Подключение Timeweb", icon: Cable },
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
                  Control plane
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Инфраструктура</SidebarGroupLabel>
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
        <SidebarGroup>
          <SidebarGroupLabel>Граница системы</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="mx-2 grid gap-2 rounded-md border bg-sidebar-accent/50 p-3 group-data-[collapsible=icon]:hidden">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Cable aria-hidden="true" className="size-3.5 text-primary" />
                Fake provider
                <Badge variant="outline" className="ml-auto">
                  local
                </Badge>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Облачные credentials и платные действия отключены.
              </p>
            </div>
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
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
