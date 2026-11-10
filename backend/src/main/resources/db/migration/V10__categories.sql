-- Platform-wide topics a collection can be filed under (managed by admins).
CREATE TABLE categories (
    id       BIGSERIAL PRIMARY KEY,
    slug     VARCHAR(60) NOT NULL UNIQUE,
    name     VARCHAR(80) NOT NULL,
    icon     VARCHAR(60) NOT NULL DEFAULT 'folder',
    position INT         NOT NULL DEFAULT 0
);

INSERT INTO categories (slug, name, icon, position) VALUES ('programming', 'Programming', 'code', 1);
INSERT INTO categories (slug, name, icon, position) VALUES ('travel', 'Travel', 'plane', 2);
INSERT INTO categories (slug, name, icon, position) VALUES ('food', 'Food & Recipes', 'utensils', 3);
INSERT INTO categories (slug, name, icon, position) VALUES ('personal-experience', 'Personal Experience', 'notebook-pen', 4);
INSERT INTO categories (slug, name, icon, position) VALUES ('creative', 'Creative', 'palette', 5);
INSERT INTO categories (slug, name, icon, position) VALUES ('other', 'Other', 'folder', 6);
