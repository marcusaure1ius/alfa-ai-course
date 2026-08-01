"use client";

import {
  LibraryBig,
  ListTree,
  Wrench,
  Users,
} from "lucide-react";

import { NeurokursBrand } from "@/components/brand/neurokurs-brand";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NavLink } from "./nav-link";

const courseNavigation = [
  { href: "/admin/courses", label: "Курсы", icon: LibraryBig },
  { href: "/admin/program", label: "Разделы", icon: ListTree },
] as const;

const workspaceNavigation = [
  { href: "/admin/students", label: "Ученики", icon: Users },
  { href: "/admin/tools", label: "Инструменты", icon: Wrench },
] as const;

export function AdminSidebar() {
  return (
    <Sidebar collapsible="icon" aria-label="Навигация администратора">
      <SidebarHeader className="h-16 justify-center border-b px-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex h-12 items-center gap-3 px-2 group-data-[collapsible=icon]:hidden">
              <NeurokursBrand />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupLabel>Курсы</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {courseNavigation.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <NavLink {...item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Управление</SidebarGroupLabel>
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
      <SidebarRail />
    </Sidebar>
  );
}
