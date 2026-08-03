import { ExternalLink, MessageCircleQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";

export type ConfiguredSupportContact = {
  label: string;
  href: string;
};

export type StudentSupportContactState =
  | { state: "configured"; courseTitle: string; label: string; href: string }
  | { state: "missing"; courseTitle: string }
  | { state: "malformed"; courseTitle: string }
  | { state: "no_course" };

function safeSupportHref(value: string): string | null {
  const href = value.trim();
  if (
    !href ||
    href.length > 2048 ||
    href.startsWith("//") ||
    /[\u0000-\u001f\u007f]/u.test(href)
  ) {
    return null;
  }
  try {
    const url = new URL(href);
    if (url.username || url.password) return null;
    if (url.protocol === "https:") return href;
    if (
      url.protocol === "mailto:" &&
      !/%[0-9a-f]{2}/iu.test(url.pathname) &&
      /^[a-z0-9.!#$&'*+/=_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/iu.test(
        url.pathname,
      ) &&
      !url.search &&
      !url.hash
    ) {
      return href;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveStudentSupportContact({
  courseTitle,
  configuredContact,
}: {
  courseTitle: string | null;
  configuredContact: ConfiguredSupportContact | null;
}): StudentSupportContactState {
  if (!courseTitle) return { state: "no_course" };
  if (!configuredContact) return { state: "missing", courseTitle };
  const label = configuredContact.label.trim();
  const href = safeSupportHref(configuredContact.href);
  if (!label || label.length > 80 || !href) {
    return { state: "malformed", courseTitle };
  }
  return { state: "configured", courseTitle, label, href };
}

export function StudentSupportContact({
  courseTitle,
  configuredContact,
}: {
  courseTitle: string | null;
  configuredContact: ConfiguredSupportContact | null;
}) {
  const contact = resolveStudentSupportContact({ courseTitle, configuredContact });
  const description =
    contact.state === "no_course"
      ? "Если доступ к курсу должен быть открыт, ответьте в том канале, по которому получили приглашение в Neurokurs."
      : contact.state === "configured"
        ? `Канал поддержки курса «${contact.courseTitle}» задан преподавателем.`
        : contact.state === "malformed"
          ? `Контакт курса «${contact.courseTitle}» сейчас указан некорректно. Используйте уже известный вам канал преподавателя.`
          : `Преподаватель ещё не опубликовал контакт для курса «${contact.courseTitle}». Используйте уже известный вам канал курса.`;

  return (
    <section
      className="rounded-xl border bg-card p-5 sm:p-6"
      aria-labelledby="student-support-contact-title"
    >
      <div className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <MessageCircleQuestion className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="student-support-contact-title" className="font-display text-xl">
            Связь с преподавателем
          </h2>
          <p className="mt-2 break-words text-base leading-7 text-muted-foreground">
            {description}
          </p>
          {contact.state === "configured" ? (
            <Button
              asChild
              className="mt-5 h-auto min-h-12 max-w-full shrink justify-start whitespace-normal break-words px-4 py-3 text-left leading-5 [overflow-wrap:anywhere]"
            >
              <a href={contact.href} target="_blank" rel="noreferrer">
                {contact.label}
                <ExternalLink aria-hidden="true" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
