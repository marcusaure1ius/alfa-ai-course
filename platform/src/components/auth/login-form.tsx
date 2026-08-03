"use client";

import { FormEvent, useRef, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm({ inverse = false }: { inverse?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [credentialsUnlocked, setCredentialsUnlocked] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmailError = !email.trim()
      ? "Введите email."
      : !/^\S+@\S+\.\S+$/.test(email)
        ? "Проверьте формат email."
        : null;
    const nextPasswordError = !password
      ? "Введите пароль."
      : password.length < 12
        ? "Пароль должен содержать не меньше 12 символов."
        : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) {
      (nextEmailError ? emailRef : passwordRef).current?.focus();
      return;
    }
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
        body.user?.role === "student" ? "/student" : "/admin/tools",
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
      onFocusCapture={() => setCredentialsUnlocked(true)}
      onPointerDownCapture={() => setCredentialsUnlocked(true)}
      aria-busy={pending}
      noValidate
    >
      <Field className="login-field-enter">
        <FieldLabel htmlFor="login-email">Email</FieldLabel>
        <Input
          ref={emailRef}
          id="login-email"
          type="email"
          name="username"
          autoComplete="username"
          placeholder="name@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (emailError) setEmailError(null);
          }}
          readOnly={!credentialsUnlocked}
          disabled={pending}
          required
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? "login-email-error" : undefined}
        />
        {emailError ? (
          <FieldError id="login-email-error">{emailError}</FieldError>
        ) : null}
      </Field>
      <Field className="login-field-enter login-field-enter-delay">
        <FieldLabel htmlFor="login-password">Пароль</FieldLabel>
        <div className="relative">
          <Input
            ref={passwordRef}
            id="login-password"
            type={passwordVisible ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            placeholder="Введите пароль"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (passwordError) setPasswordError(null);
            }}
            readOnly={!credentialsUnlocked}
            disabled={pending}
            minLength={12}
            required
            className="pr-12"
            aria-invalid={Boolean(passwordError)}
            aria-describedby={
              passwordError ? "login-password-error" : undefined
            }
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => setPasswordVisible((value) => !value)}
            aria-label={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
            disabled={pending}
          >
            {passwordVisible ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
        {passwordError ? (
          <FieldError id="login-password-error">{passwordError}</FieldError>
        ) : null}
      </Field>
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
