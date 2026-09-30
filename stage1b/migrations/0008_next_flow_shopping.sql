-- Isolated Stage 1B: accepted meal proposal and editable consolidated shopping state.
ALTER TABLE sessions ADD COLUMN meal_plan_json TEXT;
ALTER TABLE sessions ADD COLUMN shopping_revision INTEGER NOT NULL DEFAULT 0;
