"use client";

import { forwardRef, useState } from "react";
import type { ComponentProps } from "react";
import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LogoutButtonProps = Omit<ComponentProps<typeof Button>, "children">;

export const LogoutButton = forwardRef<HTMLButtonElement, LogoutButtonProps>(
  function LogoutButton(
    { className, disabled, onClick, ...props },
    ref,
  ) {
    const router = useRouter();
    const [pending, setPending] = useState(false);

    async function logout() {
      setPending(true);
      try {
        const csrfResponse = await fetch("/api/auth/csrf", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const csrf = (await csrfResponse.json()) as { csrfToken?: string };
        if (!csrf.csrfToken) return;
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          headers: { "x-csrf-token": csrf.csrfToken },
        });
        router.replace("/login");
        router.refresh();
      } finally {
        setPending(false);
      }
    }

    return (
      <Button
        ref={ref}
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "min-h-11 w-full justify-start group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:min-h-8 group-data-[collapsible=icon]:px-2",
          className,
        )}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) void logout();
        }}
        disabled={pending || disabled}
        {...props}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <LogOut aria-hidden="true" />
        )}
        <span className="group-data-[collapsible=icon]:hidden">Выйти</span>
      </Button>
    );
  },
);
