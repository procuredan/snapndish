// Read-only dashboard projection. The active session remains the authority for
// meal, Shopping, and cooking progress while it exists.
export async function dashboardSummary(db, ownerId, at) {
  const [cooks, history, future, favorites] = await Promise.all([
    db.prepare(`SELECT c.id, c.source_session_id, c.selected_at, c.status,
        c.progress_revision, r.id AS recipe_version_id, r.meal, r.servings,
        CASE WHEN s.id IS NULL THEN 0 ELSE 1 END AS session_available
      FROM dashboard_cooks c
      JOIN dashboard_recipe_versions r ON r.id=c.current_recipe_version_id
      LEFT JOIN sessions s ON s.id=c.source_session_id AND s.expires_at>?
      WHERE c.owner_id=? ORDER BY c.selected_at DESC LIMIT 50`).bind(at, ownerId).all(),
    db.prepare(`SELECT r.id AS recipe_version_id, r.meal, r.servings, r.accepted_at,
        h.cook_id, h.selected_at, c.status
      FROM dashboard_selection_history h
      JOIN dashboard_recipe_versions r ON r.id=h.recipe_version_id
      JOIN dashboard_cooks c ON c.id=h.cook_id
      WHERE h.owner_id=? ORDER BY h.selected_at DESC LIMIT 50`).bind(ownerId).all(),
    db.prepare(`SELECT r.id AS recipe_version_id, r.meal, r.servings, m.created_at
      FROM dashboard_collections m JOIN dashboard_recipe_versions r ON r.id=m.recipe_version_id
      WHERE m.owner_id=? AND m.collection='future'
      ORDER BY m.created_at DESC LIMIT 50`).bind(ownerId).all(),
    db.prepare(`SELECT r.id AS recipe_version_id, r.meal, r.servings, m.created_at
      FROM dashboard_collections m JOIN dashboard_recipe_versions r ON r.id=m.recipe_version_id
      WHERE m.owner_id=? AND m.collection='favorite'
      ORDER BY m.created_at DESC LIMIT 50`).bind(ownerId).all(),
  ]);
  return { active_cooks: cooks.results ?? [], previously_cooked: history.results ?? [],
    future_cooks: future.results ?? [], favorites: favorites.results ?? [] };
}

export async function dashboardRecipe(db, ownerId, recipeId) {
  const row = await db.prepare(`SELECT id, meal, servings, content_json, accepted_at,
      source_session_id, source_meal_revision
    FROM dashboard_recipe_versions WHERE id=? AND owner_id=?`).bind(recipeId, ownerId).first();
  return row ? { id: row.id, meal: row.meal, servings: row.servings,
    accepted_at: row.accepted_at, source_session_id: row.source_session_id,
    source_meal_revision: row.source_meal_revision, recipe: JSON.parse(row.content_json) } : null;
}
