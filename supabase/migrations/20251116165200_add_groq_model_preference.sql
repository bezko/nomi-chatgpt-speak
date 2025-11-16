-- Add groq_model column to user_api_keys table
ALTER TABLE public.user_api_keys
ADD COLUMN IF NOT EXISTS groq_model TEXT DEFAULT 'llama-3.1-8b-instant';

-- Add comment
COMMENT ON COLUMN public.user_api_keys.groq_model IS 'Groq LLM model preference for AI responses (default: llama-3.1-8b-instant)';
