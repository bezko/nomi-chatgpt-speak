-- Make question and answer nullable so we can store all messages
ALTER TABLE public.nomi_messages 
ALTER COLUMN question DROP NOT NULL,
ALTER COLUMN answer DROP NOT NULL;

-- Add a message_text column for the original message
ALTER TABLE public.nomi_messages 
ADD COLUMN IF NOT EXISTS message_text TEXT;

-- Add a message_type column to distinguish between regular messages and chatgpt questions
ALTER TABLE public.nomi_messages 
ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'regular';