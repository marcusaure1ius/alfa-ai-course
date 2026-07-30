"use client";

import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({ inverse = false }: { inverse?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const csrfResponse = await fetch("/api/auth/csrf", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const csrf = (await csrfResponse.json()) as { csrfToken?: string };
      if (!csrf.csrfToken) throw new Error("Не удалось начать безопасный вход.");
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf.csrfToken,
        },
        body: JSON.stringify({
          email,
          password,
          ...(mfaCode ? { mfaCode } : {}),
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        code?: string;
        user?: { role?: "admin" | "student" };
      };
      if (!response.ok) {
        if (body.code === "MFA_REQUIRED") {
          setMfaRequired(true);
          setMfaCode("");
          return;
        }
        throw new Error(body.error ?? "Не удалось войти.");
      }
      router.push(
        body.user?.role === "student" ? "/student" : "/admin/infrastructure",
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Вход отклонён.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className={inverse ? "grid gap-5 text-white" : "grid gap-5"}
      onSubmit={submit}
      aria-busy={pending}
    >
      <label className="grid gap-2 text-sm font-medium">
        Email
        <Input
          type="email"
          autoComplete="username"
          placeholder="name@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
          required
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Пароль
        <Input
          type="password"
          autoComplete="current-password"
          placeholder="Введите пароль"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
          minLength={12}
          required
        />
      </label>
      {mfaRequired ? (
        <div
          className={
            inverse
              ? "grid gap-3 rounded-lg border border-white/35 bg-white/10 p-4"
              : "grid gap-3 rounded-lg border bg-muted/50 p-4"
          }
        >
          <div>
            <p className="text-sm font-medium">Подтвердите вход</p>
            <p
              className={
                inverse
                  ? "mt-1 text-xs leading-5 text-white/75"
                  : "mt-1 text-xs leading-5 text-muted-foreground"
              }
            >
              Введите шестизначный код из приложения-аутентификатора.
            </p>
          </div>
          <label className="grid gap-2 text-sm font-medium">
            Код подтверждения
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={mfaCode}
              onChange={(event) =>
                setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              disabled={pending}
              pattern="[0-9]{6}"
              placeholder="000000"
              required
            />
          </label>
        </div>
      ) : null}
      {error ? (
        <Alert
          variant="destructive"
          className={inverse ? "border-white/40 bg-white" : undefined}
          aria-live="polite"
        >
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="mt-2 w-full"
        disabled={pending || (mfaRequired && mfaCode.length !== 6)}
      >
        {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        {pending ? "Проверяем…" : mfaRequired ? "Подтвердить вход" : "Войти"}
      </Button>
    </form>
  );
}
