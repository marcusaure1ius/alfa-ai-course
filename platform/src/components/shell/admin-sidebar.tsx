"use client";

import {
  BookOpenText,
  History,
  LayoutDashboard,
  ListChecks,
  Settings2,
  Wrench,
  Users,
} from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { NeurokursBrand } from "@/components/brand/neurokurs-brand";
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

const workspaceNavigation = [
  { href: "/admin", label: "Обзор", icon: LayoutDashboard },
  { href: "/admin/students", label: "Ученики", icon: Users },
  { href: "/admin/content", label: "Контент", icon: BookOpenText },
  { href: "/admin/infrastructure", label: "Инструменты", icon: Wrench },
] as const;

const systemNavigation = [
  { href: "/admin/operations", label: "Операции", icon: ListChecks },
  { href: "/admin/audit", label: "История", icon: History },
  { href: "/admin/settings", label: "Настройки", icon: Settings2 },
] as const;

export function AdminSidebar({ email }: { email: string }) {
  return (
    <Sidebar collapsible="icon" aria-label="Навигация администратора">
      <SidebarHeader className="h-16 justify-center px-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="pointer-events-none gap-3 hover:bg-transparent data-[state=open]:bg-transparent"
            >
              <NeurokursBrand compact />
              <NeurokursBrand className="group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupLabel>Работа</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceNavigation.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <NavLink {...item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Система</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemNavigation.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <NavLink {...item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip={email}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                {email.slice(0, 1).toUpperCase()}
              </span>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{email}</span>
                <span className="truncate text-xs text-muted-foreground">Аккаунт</span>
              </span>
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
