"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";

export type StudentHelpTopic = {
  id: string;
  title: string;
  description: string;
  steps: string[];
  expected: string;
  fallback: string;
  action: { href: string; label: string };
};

const HELP_LOCATION_EVENT = "student-help-location";

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  window.addEventListener(HELP_LOCATION_EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener(HELP_LOCATION_EVENT, onChange);
  };
}

function currentHash(): string {
  return window.location.hash.slice(1);
}

export function StudentHelpTopics({ topics }: { topics: StudentHelpTopic[] }) {
  const topicIds = useMemo(() => topics.map((topic) => topic.id), [topics]);
  const hash = useSyncExternalStore(subscribeToHash, currentHash, () => "");
  const activeId = topicIds.includes(hash) ? hash : null;

  useEffect(() => {
    if (activeId) {
      window.requestAnimationFrame(() => {
        document.getElementById(activeId)?.focus({ preventScroll: true });
      });
    }
  }, [activeId]);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {topics.map((topic, index) => {
        const open = activeId === topic.id;
        const panelId = `${topic.id}-panel`;
        return (
          <section
            key={topic.id}
            className={index > 0 ? "border-t" : undefined}
          >
            <h2>
              <button
                id={topic.id}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                className="group flex min-h-20 w-full scroll-mt-24 items-center gap-3 px-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:gap-4 sm:px-7"
                onClick={() => {
                  const nextHash = open ? "" : `#${topic.id}`;
                  window.history.replaceState(
                    null,
                    "",
                    `${window.location.pathname}${window.location.search}${nextHash}`,
                  );
                  window.dispatchEvent(new Event(HELP_LOCATION_EVENT));
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="font-display block break-words text-lg leading-6">
                    {topic.title}
                  </span>
                  <span className="mt-1 block break-words text-base leading-6 text-muted-foreground">
                    {topic.description}
                  </span>
                </span>
                <ChevronDown
                  className={`size-5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
            </h2>
            {open ? (
              <div
                id={panelId}
                className="border-t bg-muted/30 px-5 py-5 sm:px-7 sm:py-6"
              >
                <div className="max-w-3xl text-base leading-7">
                  <h3 className="font-semibold">Что проверить</h3>
                  <ol className="mt-2 list-decimal space-y-2 pl-5 marker:font-medium">
                    {topic.steps.map((step) => (
                      <li className="pl-1" key={step}>
                        {step}
                      </li>
                    ))}
                  </ol>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <h3 className="font-semibold">Ожидаемый результат</h3>
                      <p className="mt-1 text-muted-foreground">{topic.expected}</p>
                    </div>
                    <div>
                      <h3 className="font-semibold">Если не помогло</h3>
                      <p className="mt-1 text-muted-foreground">{topic.fallback}</p>
                    </div>
                  </div>
                  <Link
                    href={topic.action.href}
                    className="mt-5 inline-flex min-h-11 items-center rounded-md font-medium underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {topic.action.label}
                  </Link>
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
