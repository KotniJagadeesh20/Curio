CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    name          VARCHAR(120) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'USER',
    created_at    TIMESTAMP WITH TIME ZONE  NOT NULL DEFAULT now()
);

CREATE TABLE tracks (
    id              BIGSERIAL PRIMARY KEY,
    slug            VARCHAR(80)  NOT NULL UNIQUE,
    name            VARCHAR(160) NOT NULL,
    description     TEXT         NOT NULL DEFAULT '',
    icon            VARCHAR(60)  NOT NULL DEFAULT 'book-open',
    color           VARCHAR(120) NOT NULL DEFAULT 'from-primary to-accent',
    difficulty      VARCHAR(80)  NOT NULL DEFAULT 'Beginner',
    estimated_hours INT          NOT NULL DEFAULT 0,
    position        INT          NOT NULL DEFAULT 0,
    published       BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE sections (
    id       BIGSERIAL PRIMARY KEY,
    track_id BIGINT       NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    slug     VARCHAR(80)  NOT NULL,
    title    VARCHAR(160) NOT NULL,
    icon     VARCHAR(60)  NOT NULL DEFAULT 'book-open',
    position INT          NOT NULL DEFAULT 0,
    UNIQUE (track_id, slug)
);

CREATE TABLE lessons (
    id            BIGSERIAL PRIMARY KEY,
    section_id    BIGINT       NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    slug          VARCHAR(80)  NOT NULL,
    title         VARCHAR(200) NOT NULL,
    summary       TEXT         NOT NULL DEFAULT '',
    concept       TEXT         NOT NULL DEFAULT '',
    real_world    TEXT         NOT NULL DEFAULT '',
    common_mistakes   TEXT     NOT NULL DEFAULT '[]',
    best_practices    TEXT     NOT NULL DEFAULT '[]',
    interview_relevance TEXT   NOT NULL DEFAULT '',
    duration      VARCHAR(30),
    code_language VARCHAR(30),
    code_example  TEXT,
    position      INT          NOT NULL DEFAULT 0,
    published     BOOLEAN      NOT NULL DEFAULT TRUE,
    UNIQUE (section_id, slug)
);

CREATE TABLE problems (
    id           BIGSERIAL PRIMARY KEY,
    slug         VARCHAR(100) NOT NULL UNIQUE,
    track_id     BIGINT REFERENCES tracks(id) ON DELETE SET NULL,
    title        VARCHAR(200) NOT NULL,
    difficulty   VARCHAR(20)  NOT NULL,
    category     VARCHAR(120) NOT NULL DEFAULT '',
    concept      VARCHAR(120) NOT NULL DEFAULT '',
    description  TEXT         NOT NULL DEFAULT '',
    examples     TEXT         NOT NULL DEFAULT '[]',
    constraints  TEXT         NOT NULL DEFAULT '[]',
    hints        TEXT         NOT NULL DEFAULT '[]',
    solution     TEXT         NOT NULL DEFAULT '',
    language     VARCHAR(30)  NOT NULL DEFAULT 'java',
    starter_code TEXT         NOT NULL DEFAULT '',
    published    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMP WITH TIME ZONE  NOT NULL DEFAULT now()
);

CREATE TABLE lesson_progress (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id    BIGINT      NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, lesson_id)
);

CREATE TABLE submissions (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id BIGINT      NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    code       TEXT        NOT NULL,
    language   VARCHAR(30) NOT NULL,
    status     VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE comments (
    id         BIGSERIAL PRIMARY KEY,
    lesson_id  BIGINT      NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id  BIGINT      REFERENCES comments(id) ON DELETE CASCADE,
    body       TEXT        NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_sections_track ON sections(track_id);
CREATE INDEX idx_lessons_section ON lessons(section_id);
CREATE INDEX idx_problems_track ON problems(track_id);
CREATE INDEX idx_progress_user ON lesson_progress(user_id);
CREATE INDEX idx_submissions_user ON submissions(user_id);
CREATE INDEX idx_comments_lesson ON comments(lesson_id);
