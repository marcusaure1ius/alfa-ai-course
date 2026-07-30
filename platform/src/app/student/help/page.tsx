import { CircleHelp } from "lucide-react";

const topics = [
  {
    title: "Не открывается n8n",
    description: "Проверьте состояние доступа и сообщите, что видите на экране.",
  },
  {
    title: "Не получается выполнить шаг",
    description: "Укажите материал и место, на котором возник вопрос.",
  },
  {
    title: "Материал пропал из программы",
    description: "Доступ или публикация могли измениться — это проверит преподаватель.",
  },
  {
    title: "Другой вопрос",
    description: "Опишите ожидаемый результат и то, что уже попробовали.",
  },
];

export default function StudentHelpPage() {
  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-12">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-muted-foreground">Помощь</p>
        <h1 className="font-display mt-2 text-3xl leading-tight sm:text-4xl">
          Если что-то не работает
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
          Короткая памятка: что проверить и какую информацию подготовить.
        </p>
        <div className="mt-9 overflow-hidden rounded-2xl border bg-card">
          {topics.map((topic, index) => (
            <div
              key={topic.title}
              className={
                "flex min-h-24 items-center gap-4 px-5 py-5 sm:px-7 " +
                (index > 0 ? "border-t" : "")
              }
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <CircleHelp className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-display block text-lg">{topic.title}</span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                  {topic.description}
                </span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm leading-6 text-muted-foreground">
          Канал связи с преподавателем будет подключён отдельно. Сейчас эта
          страница ничего не отправляет.
        </p>
      </div>
    </div>
  );
}
