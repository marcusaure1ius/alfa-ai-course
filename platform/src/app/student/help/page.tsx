import { ShieldCheck } from "lucide-react";

import {
  StudentHelpTopics,
  type StudentHelpTopic,
} from "@/components/student/student-help-topics";
import { StudentSupportContact } from "@/components/student/student-support-contact";
import { requirePageSession } from "@/server/auth/page-access";
import { getStudentCourses } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

const topics: StudentHelpTopic[] = [
  {
    id: "course-access",
    title: "Курс ещё не открылся",
    description: "В разделе «Мои курсы» нет нужного курса.",
    steps: [
      "Обновите страницу «Мои курсы» один раз и проверьте, что вошли под адресом, на который получили приглашение.",
      "Если доступ выдавали недавно, выйдите из Neurokurs, войдите снова и откройте список курсов.",
    ],
    expected: "В списке появится карточка курса, из которой можно открыть программу.",
    fallback:
      "Подготовьте адрес аккаунта и название курса. Не присылайте пароль, код входа или cookie.",
    action: { href: "/student", label: "Проверить мои курсы" },
  },
  {
    id: "tool-expired",
    title: "Срок доступа к инструменту завершён",
    description: "Инструмент показывает состояние «Срок доступа завершён».",
    steps: [
      "Откройте каталог инструментов и ещё раз проверьте текст состояния нужного сервиса.",
      "Сохраните только собственные учебные результаты, которые доступны без передачи логинов или ключей.",
    ],
    expected:
      "После продления преподавателем карточка покажет новое состояние и доступное действие.",
    fallback:
      "Сообщите преподавателю название курса, инструмента и видимый текст состояния. Перенос среды не выполняется автоматически.",
    action: { href: "/student/tools", label: "Открыть инструменты" },
  },
  {
    id: "tool-problem",
    title: "Инструмент не открывается или сообщает об ошибке",
    description: "Ссылка недоступна, загрузка не заканчивается или сервис показывает ошибку.",
    steps: [
      "Вернитесь в карточку инструмента и запомните точный текст его состояния в Neurokurs.",
      "Повторите открытие один раз. Запишите последний успешный шаг и точный текст ошибки без секретов.",
    ],
    expected: "Инструмент откроется в отдельной вкладке или покажет понятное состояние ожидания.",
    fallback:
      "Используйте «Сообщить о проблеме» в карточке: диалог подготовит безопасное описание для известного канала преподавателя.",
    action: { href: "/student/tools", label: "Вернуться к инструментам" },
  },
  {
    id: "material-help",
    title: "Не получается выполнить шаг материала",
    description: "Инструкция непонятна или результат отличается от ожидаемого.",
    steps: [
      "Откройте программу и скопируйте точное название материала.",
      "Запишите заголовок раздела, ожидаемый результат и последний шаг, который сработал.",
    ],
    expected: "После повторения шага результат совпадёт с описанием в материале.",
    fallback:
      "Передайте преподавателю название материала и безопасное описание результата без рабочих данных и персональной информации.",
    action: { href: "/student", label: "Открыть мои курсы" },
  },
  {
    id: "student-error",
    title: "Neurokurs не загрузил страницу",
    description: "Появился экран «Не удалось загрузить данные» или ошибка повторяется.",
    steps: [
      "Нажмите «Повторить» один раз и дождитесь результата.",
      "Если ошибка осталась, запишите название экрана, точный текст и примерное время появления.",
    ],
    expected: "Страница загрузится без изменения вашего доступа и прогресса.",
    fallback:
      "Сообщите подготовленные данные преподавателю. Не прикладывайте cookie, токены, ключи или снимки с персональными данными.",
    action: { href: "/student", label: "Вернуться к моим курсам" },
  },
];

export default async function StudentHelpPage() {
  const session = await requirePageSession();
  // Название курса в контакте поддержки уместно только когда курс один:
  // при нескольких назначенных курсах любой выбранный вводил бы в заблуждение.
  const courses = await getStudentCourses(getDatabase(), session.userId);
  const courseTitle = courses.length === 1 ? courses[0].title : null;
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
        <div className="mt-8 flex max-w-3xl items-start gap-3 rounded-xl bg-brand-soft p-5">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Перед отправкой сообщения</h2>
            <p className="mt-1 text-base leading-7 text-muted-foreground">
              Не прикладывайте пароли, коды входа, API‑ключи, cookie, документы
              с персональными данными или рабочую информацию клиентов. Для
              диагностики достаточно названия экрана, видимого состояния и
              точного текста ошибки.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <StudentSupportContact
            courseTitle={courseTitle}
            configuredContact={null}
          />
        </div>

        <div className="mt-8">
          <h2 className="font-display text-2xl">Выберите ситуацию</h2>
          <p className="mt-2 max-w-2xl text-base leading-7 text-muted-foreground">
            Откройте подходящую тему и выполните шаги по порядку.
          </p>
          <div className="mt-5">
            <StudentHelpTopics topics={topics} />
          </div>
        </div>
      </div>
    </div>
  );
}
