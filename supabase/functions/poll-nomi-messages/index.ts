import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function parseAskCommand(message: string): string | null {
  const regex = /\/ask\s+chatgpt\s+"([^"]+)"/i;
  const match = message.match(regex);
  return match ? match[1] : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting polling of all Nomis');

    // Get API keys
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const NOMI_API_KEY = Deno.env.get('NOMI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    if (!NOMI_API_KEY) {
      throw new Error('NOMI_API_KEY is not configured');
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration is missing');
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all Nomis
    console.log('Fetching all Nomis...');
    const nomisResponse = await fetch('https://api.nomi.ai/v1/nomis', {
      method: 'GET',
      headers: {
        'Authorization': NOMI_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!nomisResponse.ok) {
      const errorText = await nomisResponse.text();
      console.error('Nomi API error:', nomisResponse.status, errorText);
      throw new Error(`Failed to fetch Nomis: ${nomisResponse.status}`);
    }

    const nomisData = await nomisResponse.json();
    console.log(`Found ${nomisData.nomis?.length || 0} Nomis`);

    const processedMessages: any[] = [];
    let totalMessagesFound = 0;

    // Process each Nomi
    if (nomisData.nomis && Array.isArray(nomisData.nomis)) {
      for (const nomi of nomisData.nomis) {
        console.log(`Polling messages for Nomi: ${nomi.name} (${nomi.uuid})`);

        // Get recent messages from this Nomi
        const messagesResponse = await fetch(`https://api.nomi.ai/v1/nomis/${nomi.uuid}/chat`, {
          method: 'GET',
          headers: {
            'Authorization': NOMI_API_KEY,
            'Content-Type': 'application/json',
          },
        });

        if (!messagesResponse.ok) {
          console.error(`Failed to fetch messages for Nomi ${nomi.uuid}`);
          continue;
        }

        const messagesData = await messagesResponse.json();
        
        // Store all messages from Nomi
        if (messagesData.messages && Array.isArray(messagesData.messages)) {
          totalMessagesFound += messagesData.messages.length;
          
          for (const message of messagesData.messages) {
            // Only process messages from the Nomi (not user messages)
            if (message.sent === 'nomi') {
              const question = parseAskCommand(message.text);
              
              if (question) {
                // This is a chatgpt question - process it with AI
                console.log(`Found question to process from ${nomi.name}:`, question);

                // Call Lovable AI
                const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: 'google/gemini-2.5-flash',
                    messages: [
                      {
                        role: 'system',
                        content: 'You are a helpful AI assistant. Provide clear, concise answers.'
                      },
                      {
                        role: 'user',
                        content: question
                      }
                    ],
                  }),
                });

                if (!aiResponse.ok) {
                  const errorText = await aiResponse.text();
                  console.error('Lovable AI error:', aiResponse.status, errorText);
                  continue;
                }

                const aiData = await aiResponse.json();
                const answer = aiData.choices[0].message.content;

                console.log('AI answer:', answer);

                // Send response back to Nomi
                const nomiResponse = await fetch(`https://api.nomi.ai/v1/nomis/${nomi.uuid}/chat`, {
                  method: 'POST',
                  headers: {
                    'Authorization': NOMI_API_KEY,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    messageText: answer
                  }),
                });

                if (nomiResponse.ok) {
                  // Store chatgpt message in database
                  const { error: dbError } = await supabase
                    .from('nomi_messages')
                    .insert({
                      nomi_uuid: nomi.uuid,
                      nomi_name: nomi.name,
                      question,
                      answer,
                      message_text: message.text,
                      message_type: 'chatgpt'
                    });

                  if (dbError) {
                    console.error('Database error:', dbError);
                  }

                  processedMessages.push({
                    nomiName: nomi.name,
                    nomiUuid: nomi.uuid,
                    question,
                    answer,
                    messageType: 'chatgpt',
                    timestamp: new Date().toISOString()
                  });
                  console.log('Reply sent to Nomi successfully and stored in database');
                }
              } else {
                // Regular message - just store it
                console.log(`Storing regular message from ${nomi.name}`);
                const { error: dbError } = await supabase
                  .from('nomi_messages')
                  .insert({
                    nomi_uuid: nomi.uuid,
                    nomi_name: nomi.name,
                    message_text: message.text,
                    message_type: 'regular'
                  });

                if (dbError) {
                  console.error('Database error:', dbError);
                } else {
                  processedMessages.push({
                    nomiName: nomi.name,
                    nomiUuid: nomi.uuid,
                    messageText: message.text,
                    messageType: 'regular',
                    timestamp: new Date().toISOString()
                  });
                  console.log('Regular message stored in database');
                }
              }
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        totalNomis: nomisData.nomis?.length || 0,
        totalMessagesFound,
        processedCount: processedMessages.length,
        processedMessages,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in poll-nomi-messages:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
