ALTER TABLE course_sections
  ADD CONSTRAINT course_sections_course_id_id_unique
  UNIQUE (course_id, id);

ALTER TABLE course_materials
  DROP CONSTRAINT course_materials_section_id_fkey;

ALTER TABLE course_materials
  ADD CONSTRAINT course_materials_course_section_fkey
  FOREIGN KEY (course_id, section_id)
  REFERENCES course_sections (course_id, id)
  ON DELETE CASCADE;
