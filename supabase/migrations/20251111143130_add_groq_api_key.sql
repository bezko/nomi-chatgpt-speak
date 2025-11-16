-- Add groq_api_key column to user_api_keys table
ALTER TABLE public.user_api_keys
ADD COLUMN IF NOT EXISTS groq_api_key TEXT;

-- Drop openai_api_key column if it exists
ALTER TABLE public.user_api_keys
DROP COLUMN IF EXISTS openai_api_key;

-- Add comment
COMMENT ON COLUMN public.user_api_keys.groq_api_key IS 'Groq API key for AI responses using qwen/qwen3-32b model';
