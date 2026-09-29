-- Exact accepted-meal context supplied to the primary culinary model call.
ALTER TABLE model_calls ADD COLUMN accepted_meal_snapshot TEXT;
ALTER TABLE model_calls ADD COLUMN accepted_meal_revision INTEGER;
