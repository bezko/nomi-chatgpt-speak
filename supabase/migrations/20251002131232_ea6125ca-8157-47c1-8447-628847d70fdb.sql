-- Create table to store Nomi messages
CREATE TABLE public.nomi_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nomi_uuid TEXT NOT NULL,
  nomi_name TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_nomi_messages_processed_at ON public.nomi_messages(processed_at DESC);
CREATE INDEX idx_nomi_messages_nomi_uuid ON public.nomi_messages(nomi_uuid);

-- Enable Row Level Security
ALTER TABLE public.nomi_messages ENABLE ROW LEVEL SECURITY;

-- Allow public read access (since this is a demo/testing interface)
CREATE POLICY "Allow public read access to nomi_messages"
  ON public.nomi_messages
  FOR SELECT
  USING (true);

-- Allow public insert access (for the edge function)
CREATE POLICY "Allow public insert access to nomi_messages"
  ON public.nomi_messages
  FOR INSERT
  WITH CHECK (true);