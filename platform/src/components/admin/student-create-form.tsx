"use client";

import { Eye, EyeOff, Loader2, TriangleAlert, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AdminCourseOption } from "@/server/admin/workspace";

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = (await response.json()) as { csrfToken?: string };
  if (!body.csrfToken) throw new Error("Не удалось подготовить защищённый запрос.");
  return body.csrfToken;
}

export function StudentCreateForm({ courses }: { courses: AdminCourseOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [courseId, setCourseId] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const selectedCourse = courses.find((course) => course.id === courseId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmailError = !email.trim()
      ? "Введите email ученика."
      : !/^\S+@\S+\.\S+$/.test(email)
        ? "Проверьте формат email."
        : null;
    const nextPasswordError = password.length < 12
      ? "Нужно не меньше 12 символов."
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
      const csrf = await csrfToken();
      const response = await fetch("/api/admin/students", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json().catch(() => null)) as
        | { studentId?: string; error?: { message?: string } }
        | null;
      if (!response.ok || !body?.studentId) {
        throw new Error(body?.error?.message ?? "Не удалось создать ученика.");
      }
      if (courseId) {
        const accessResponse = await fetch(
          `/api/admin/students/${body.studentId}/access`,
          {
            method: "PUT",
            credentials: "same-origin",
            headers: {
              "content-type": "application/json",
              "x-csrf-token": csrf,
            },
            body: JSON.stringify({ courseId, granted: true }),
          },
        );
        if (!accessResponse.ok) {
          throw new Error(
            "Ученик создан, но курс не назначен. Откройте его карточку и повторите назначение.",
          );
        }
      }
      setOpen(false);
      router.push(`/admin/students/${body.studentId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать ученика.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button type="button">
          <UserPlus aria-hidden="true" />
          Добавить ученика
        </Button>
      </DialogTrigger>
      <DialogContent onOpenAutoFocus={(event) => {
        event.preventDefault();
        emailRef.current?.focus();
      }}>
        <DialogHeader>
          <DialogTitle>Добавить ученика</DialogTitle>
          <DialogDescription>
            Создайте закрытый аккаунт и при необходимости сразу назначьте курс.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <Field>
            <FieldLabel htmlFor="student-email">Email ученика</FieldLabel>
            <Input
              ref={emailRef}
              id="student-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (emailError) setEmailError(null);
              }}
              disabled={pending}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? "student-email-error" : undefined}
            />
            {emailError ? <FieldError id="student-email-error">{emailError}</FieldError> : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="student-password">Временный пароль</FieldLabel>
            <div className="relative">
              <Input
                ref={passwordRef}
                id="student-password"
                type={passwordVisible ? "text" : "password"}
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                disabled={pending}
                className="pr-12"
                aria-invalid={Boolean(passwordError)}
                aria-describedby={
                  passwordError
                    ? "student-password-help student-password-error"
                    : "student-password-help"
                }
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => setPasswordVisible((value) => !value)}
                aria-label={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
                disabled={pending}
              >
                {passwordVisible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              </button>
            </div>
            <FieldDescription id="student-password-help">
              Минимум 12 символов. Передайте пароль безопасным каналом — повторно он не показывается.
            </FieldDescription>
            {passwordError ? <FieldError id="student-password-error">{passwordError}</FieldError> : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="student-course">Курс</FieldLabel>
            <select
              id="student-course"
              className="h-12 w-full rounded-md border border-input bg-card px-3.5 text-base outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              disabled={pending || courses.length === 0}
              aria-describedby={
                selectedCourse?.status === "draft"
                  ? "student-course-help student-course-draft-warning"
                  : "student-course-help"
              }
            >
              <option value="">Назначить позже</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}{course.status === "draft" ? " — черновик" : ""}
                </option>
              ))}
            </select>
            <FieldDescription id="student-course-help">
              Доступ к инструментам и срок выдаются отдельно в карточке ученика.
            </FieldDescription>
            {selectedCourse?.status === "draft" ? (
              <div
                id="student-course-draft-warning"
                role="status"
                aria-live="polite"
                className="flex items-start gap-2.5 rounded-md border bg-muted px-3 py-2.5 text-sm leading-5 text-foreground"
              >
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0 text-brand"
                  aria-hidden="true"
                />
                <p>
                  <span className="font-medium">Курс ещё не опубликован.</span>{" "}
                  Аккаунт создастся, но ученик не увидит программу и материалы,
                  пока вы не опубликуете курс.
                </p>
              </div>
            ) : null}
          </Field>

          {error ? <FieldError aria-live="polite">{error}</FieldError> : null}

          <DialogFooter className="pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>Отмена</Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
              {pending ? "Создаём…" : "Создать ученика"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
