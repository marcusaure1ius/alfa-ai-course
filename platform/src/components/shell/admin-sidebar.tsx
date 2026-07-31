"use client";

import {
  BookOpenText,
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
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { NavLink } from "./nav-link";

const workspaceNavigation = [
  { href: "/admin/students", label: "Ученики", icon: Users },
  { href: "/admin/content", label: "Материалы", icon: BookOpenText },
  { href: "/admin/tools", label: "Инструменты", icon: Wrench },
] as const;

export function AdminSidebar({ email }: { email: string }) {
  return (
    <Sidebar collapsible="icon" aria-label="Навигация администратора">
      <SidebarHeader className="h-16 justify-center px-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex h-12 items-center gap-3 px-2">
              <NeurokursBrand compact />
              <NeurokursBrand className="group-data-[collapsible=icon]:hidden" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupLabel>Курс</SidebarGroupLabel>
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
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex h-12 items-center gap-3 px-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                {email.slice(0, 1).toUpperCase()}
              </span>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{email}</span>
                <span className="truncate text-xs text-muted-foreground">Аккаунт</span>
              </span>
            </div>
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
