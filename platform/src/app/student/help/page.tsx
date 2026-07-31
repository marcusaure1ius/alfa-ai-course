import { ChevronDown, CircleHelp } from "lucide-react";

const topics = [
  {
    title: "Не открывается n8n",
    description: "Проверьте состояние доступа и сообщите, что видите на экране.",
    steps: "Откройте «Инструменты → n8n», сверьте текст состояния и используйте кнопку «Сообщить о проблеме».",
  },
  {
    title: "Не получается выполнить шаг",
    description: "Укажите материал и место, на котором возник вопрос.",
    steps: "Скопируйте название материала, опишите ожидаемый результат и последний шаг, который сработал.",
  },
  {
    title: "Материал пропал из программы",
    description: "Доступ или публикация могли измениться — это проверит преподаватель.",
    steps: "Обновите страницу программы. Если материал не появился, сообщите название курса и отсутствующего шага.",
  },
  {
    title: "Другой вопрос",
    description: "Опишите ожидаемый результат и то, что уже попробовали.",
    steps: "Не прикладывайте логины, пароли и ключи. Добавьте название экрана, точный текст ошибки и время, когда она появилась.",
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
        <div className="mt-9 overflow-hidden rounded-xl border bg-card">
          {topics.map((topic, index) => (
            <details
              key={topic.title}
              className={
                "group px-5 py-5 sm:px-7 " +
                (index > 0 ? "border-t" : "")
              }
            >
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <CircleHelp className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-display block text-lg">{topic.title}</span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                  {topic.description}
                </span>
              </span>
              <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="ml-14 max-w-2xl border-l pl-4 text-sm leading-6 text-foreground/80">{topic.steps}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-sm leading-6 text-muted-foreground">
          Если нужна помощь, свяжитесь с преподавателем тем способом, который
          указан для вашего курса.
        </p>
      </div>
    </div>
  );
}
