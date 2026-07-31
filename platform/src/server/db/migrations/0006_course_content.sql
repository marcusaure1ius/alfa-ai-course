CREATE TABLE courses (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  updated_by_user_id uuid NOT NULL REFERENCES users(id),
  published_by_user_id uuid REFERENCES users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT courses_slug_normalized
    CHECK (slug = lower(btrim(slug)) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT courses_publication_consistent
    CHECK (
      (status = 'draft' AND published_at IS NULL AND published_by_user_id IS NULL)
      OR
      (status = 'published' AND published_at IS NOT NULL AND published_by_user_id IS NOT NULL)
    )
);

CREATE TABLE course_sections (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  updated_by_user_id uuid NOT NULL REFERENCES users(id),
  published_by_user_id uuid REFERENCES users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, slug),
  UNIQUE (course_id, position),
  CONSTRAINT course_sections_slug_normalized
    CHECK (slug = lower(btrim(slug)) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT course_sections_publication_consistent
    CHECK (
      (status = 'draft' AND published_at IS NULL AND published_by_user_id IS NULL)
      OR
      (status = 'published' AND published_at IS NOT NULL AND published_by_user_id IS NOT NULL)
    )
);

CREATE TABLE course_materials (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  slug text NOT NULL,
  kind text NOT NULL DEFAULT 'article'
    CHECK (kind IN ('article', 'practice')),
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  body_markdown text NOT NULL DEFAULT '',
  position integer NOT NULL CHECK (position >= 0),
  estimated_minutes integer CHECK (estimated_minutes > 0 AND estimated_minutes <= 1440),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  updated_by_user_id uuid NOT NULL REFERENCES users(id),
  published_by_user_id uuid REFERENCES users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, slug),
  UNIQUE (section_id, position),
  CONSTRAINT course_materials_slug_normalized
    CHECK (slug = lower(btrim(slug)) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT course_materials_body_bounded
    CHECK (length(body_markdown) <= 200000),
  CONSTRAINT course_materials_publication_consistent
    CHECK (
      (status = 'draft' AND published_at IS NULL AND published_by_user_id IS NULL)
      OR
      (status = 'published' AND published_at IS NOT NULL AND published_by_user_id IS NOT NULL)
    )
);

CREATE INDEX course_materials_student_catalog
  ON course_materials (course_id, section_id, position)
  WHERE status = 'published';

CREATE TABLE course_memberships (
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  granted_by_user_id uuid NOT NULL REFERENCES users(id),
  revoked_by_user_id uuid REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, user_id),
  CONSTRAINT course_memberships_revocation_consistent
    CHECK (
      (status = 'active' AND revoked_at IS NULL AND revoked_by_user_id IS NULL)
      OR
      (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)
    )
);

CREATE INDEX course_memberships_active_user
  ON course_memberships (user_id, course_id)
  WHERE status = 'active';

CREATE TABLE material_progress (
  material_id uuid NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_position text,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (material_id, user_id),
  CONSTRAINT material_progress_position_bounded
    CHECK (last_position IS NULL OR length(last_position) <= 160)
);
