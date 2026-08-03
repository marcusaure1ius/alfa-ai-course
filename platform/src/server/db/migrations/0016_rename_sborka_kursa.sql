-- T-0109: replace the internal working title with a student-facing course name.
-- The exact predicate keeps this data correction idempotent and scoped to the
-- production course seeded by T-0108. Fresh installations safely perform no-op.

UPDATE courses
SET
  title = 'ИИ-агенты: от идеи до первого рабочего сценария',
  description = 'Практический курс: выберите подходящий процесс, соберите первого ИИ-агента и подготовьте его к презентации.',
  version = version + 1,
  updated_at = now()
WHERE slug = 'sborka-kursa'
  AND title = 'Сборка курса'
  AND description = 'Подготовка к интенсиву, выбор процесса, сборка первого агента, типичные ошибки и подведение итогов.';
