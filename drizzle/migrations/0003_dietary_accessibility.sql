-- Optional food and access needs on a traveler's profile. Applied to the production project
-- on 2026-11-12 (migration "traveler_preferences_dietary_accessibility"). Existing owner-only
-- row-level-security policies already cover these columns. Values are limited to fixed lists
-- so nothing free-form (and nothing sensitive beyond these choices) is stored.
ALTER TABLE public.traveler_preferences
  ADD COLUMN IF NOT EXISTS dietary text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS accessibility text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.traveler_preferences
  DROP CONSTRAINT IF EXISTS traveler_preferences_dietary_check,
  DROP CONSTRAINT IF EXISTS traveler_preferences_accessibility_check;

ALTER TABLE public.traveler_preferences
  ADD CONSTRAINT traveler_preferences_dietary_check
    CHECK (dietary <@ ARRAY['vegetarian','vegan','gluten-free','dairy-free','halal','kosher','nut-allergy','shellfish-allergy']::text[]),
  ADD CONSTRAINT traveler_preferences_accessibility_check
    CHECK (accessibility <@ ARRAY['step-free','wheelchair','limited-walking','low-vision','hearing','sensory-friendly']::text[]);
