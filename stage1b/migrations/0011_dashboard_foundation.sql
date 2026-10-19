-- Isolated Stage 1B dashboard foundation. Durable records have no foreign key to
-- the 30-day customers or sessions tables, so legacy expiry cannot delete them.
CREATE TABLE dashboard_owners (
  id TEXT PRIMARY KEY,
  ownership_kind TEXT NOT NULL CHECK (ownership_kind = 'staging_anonymous'),
  created_at TEXT NOT NULL
);

CREATE TABLE dashboard_recipe_versions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES dashboard_owners(id),
  kind TEXT NOT NULL CHECK (kind = 'accepted'),
  meal TEXT NOT NULL,
  servings INTEGER NOT NULL CHECK (servings > 0),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  source_session_id TEXT NOT NULL,
  source_meal_revision INTEGER NOT NULL,
  source_turn_id TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  UNIQUE (source_session_id, source_meal_revision)
);
CREATE INDEX dashboard_recipe_owner_time ON dashboard_recipe_versions(owner_id, accepted_at DESC);

CREATE TRIGGER dashboard_recipe_immutable
BEFORE UPDATE ON dashboard_recipe_versions
BEGIN
  SELECT RAISE(ABORT, 'IMMUTABLE_RECIPE_VERSION');
END;

CREATE TABLE dashboard_cooks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES dashboard_owners(id),
  source_session_id TEXT NOT NULL UNIQUE,
  current_recipe_version_id TEXT NOT NULL REFERENCES dashboard_recipe_versions(id),
  selected_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'selected' CHECK (status IN ('selected','confirmed_cooked')),
  progress_snapshot_json TEXT,
  progress_revision INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX dashboard_cooks_owner_time ON dashboard_cooks(owner_id, selected_at DESC);

CREATE TABLE dashboard_selection_history (
  owner_id TEXT NOT NULL REFERENCES dashboard_owners(id),
  cook_id TEXT NOT NULL REFERENCES dashboard_cooks(id),
  recipe_version_id TEXT NOT NULL REFERENCES dashboard_recipe_versions(id),
  selected_at TEXT NOT NULL,
  PRIMARY KEY (cook_id, recipe_version_id)
);

CREATE TABLE dashboard_collections (
  owner_id TEXT NOT NULL REFERENCES dashboard_owners(id),
  recipe_version_id TEXT NOT NULL REFERENCES dashboard_recipe_versions(id),
  collection TEXT NOT NULL CHECK (collection IN ('future','favorite')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, recipe_version_id, collection)
);

CREATE TABLE dashboard_settings (
  owner_id TEXT PRIMARY KEY REFERENCES dashboard_owners(id),
  timezone TEXT,
  reset_time TEXT,
  revision INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE dashboard_operations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES dashboard_owners(id),
  kind TEXT NOT NULL,
  source_session_id TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  UNIQUE (owner_id, kind, source_session_id, source_revision)
);

-- A successfully accepted complete package is the single source for a durable
-- recipe version. The trigger runs within the existing conditional D1 update;
-- rejected, stale, and duplicate proposals cannot create history.
CREATE TRIGGER dashboard_accepted_package
AFTER UPDATE OF meal_plan_json ON sessions
WHEN NEW.customer_id IS NOT NULL
  AND NEW.meal_revision > OLD.meal_revision
  AND NEW.meal_accepted_at IS NOT NULL
  AND NEW.meal_source_turn_id IS NOT NULL
  AND NEW.meal_plan_json IS NOT NULL
  AND json_valid(NEW.meal_plan_json)
  AND json_type(NEW.meal_plan_json, '$.full_plan') = 'array'
BEGIN
  INSERT OR IGNORE INTO dashboard_owners (id, ownership_kind, created_at)
  VALUES (NEW.customer_id, 'staging_anonymous', NEW.meal_accepted_at);

  INSERT OR IGNORE INTO dashboard_recipe_versions
    (id, owner_id, kind, meal, servings, content_json, source_session_id,
     source_meal_revision, source_turn_id, accepted_at)
  VALUES (
    lower(hex(randomblob(16))), NEW.customer_id, 'accepted',
    json_extract(NEW.meal_plan_json, '$.meal'),
    json_extract(NEW.meal_plan_json, '$.servings'), NEW.meal_plan_json,
    NEW.id, NEW.meal_revision, NEW.meal_source_turn_id, NEW.meal_accepted_at
  );

  INSERT OR IGNORE INTO dashboard_cooks
    (id, owner_id, source_session_id, current_recipe_version_id, selected_at,
     progress_snapshot_json, progress_revision)
  SELECT NEW.id, NEW.customer_id, NEW.id, r.id, NEW.meal_accepted_at,
    NEW.cooking_progress_json, NEW.cooking_revision
  FROM dashboard_recipe_versions r
  WHERE r.source_session_id = NEW.id AND r.source_meal_revision = NEW.meal_revision;

  UPDATE dashboard_cooks SET
    current_recipe_version_id = (SELECT id FROM dashboard_recipe_versions
      WHERE source_session_id = NEW.id AND source_meal_revision = NEW.meal_revision),
    selected_at = NEW.meal_accepted_at,
    progress_snapshot_json = NEW.cooking_progress_json,
    progress_revision = NEW.cooking_revision
  WHERE source_session_id = NEW.id AND owner_id = NEW.customer_id;

  INSERT OR IGNORE INTO dashboard_selection_history
    (owner_id, cook_id, recipe_version_id, selected_at)
  SELECT NEW.customer_id, NEW.id, r.id, NEW.meal_accepted_at
  FROM dashboard_recipe_versions r
  WHERE r.source_session_id = NEW.id AND r.source_meal_revision = NEW.meal_revision;

  INSERT OR IGNORE INTO dashboard_settings (owner_id) VALUES (NEW.customer_id);
  INSERT OR IGNORE INTO dashboard_operations
    (id, owner_id, kind, source_session_id, source_revision, completed_at)
  VALUES (lower(hex(randomblob(16))), NEW.customer_id, 'accept_package',
    NEW.id, NEW.meal_revision, NEW.meal_accepted_at);
END;

-- The session remains the live cooking authority. This is only a durable
-- historical snapshot and never writes progress back to the session.
CREATE TRIGGER dashboard_progress_snapshot
AFTER UPDATE OF cooking_progress_json ON sessions
WHEN NEW.customer_id IS NOT NULL
  AND NEW.cooking_revision > OLD.cooking_revision
  AND NEW.meal_revision = OLD.meal_revision
BEGIN
  UPDATE dashboard_cooks SET progress_snapshot_json = NEW.cooking_progress_json,
    progress_revision = NEW.cooking_revision
  WHERE source_session_id = NEW.id AND owner_id = NEW.customer_id;
END;
