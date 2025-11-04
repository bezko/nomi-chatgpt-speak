-- Drop unused selected_nomis table
-- The Nomi API is the source of truth for which Nomis are in which rooms
-- This table was not being used by the application code

DROP TABLE IF EXISTS public.selected_nomis CASCADE;
