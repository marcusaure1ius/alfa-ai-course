"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import {
  SidebarMenuButton,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";

type NavLinkProps = {
  href: string;
  label: string;
  icon?: LucideIcon;
  nested?: boolean;
};

export function NavLink({
  href,
  label,
  icon: Icon,
  nested = false,
}: NavLinkProps) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const link = (
    <Link href={href} onClick={() => setOpenMobile(false)}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      <span>{label}</span>
    </Link>
  );

  return nested ? (
    <SidebarMenuSubButton
      asChild
      isActive={active}
      className="min-h-11 md:min-h-7"
    >
      {link}
    </SidebarMenuSubButton>
  ) : (
    <SidebarMenuButton
      asChild
      isActive={active}
      tooltip={label}
      className="min-h-11 md:min-h-8"
    >
      {link}
    </SidebarMenuButton>
  );
}
