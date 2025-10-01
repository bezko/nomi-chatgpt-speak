import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parse /ask chatgpt "question" format
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
    const { nomiUuid } = await req.json();
    
    if (!nomiUuid) {
      throw new Error('No nomiUuid provided');
    }

    console.log('Polling messages for Nomi:', nomiUuid);

    // Get API keys
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const NOMI_API_KEY = Deno.env.get('NOMI_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    if (!NOMI_API_KEY) {
      throw new Error('NOMI_API_KEY is not configured');
    }

    // Get recent messages from Nomi
    console.log('Fetching messages from Nomi...');
    const messagesResponse = await fetch(`https://api.nomi.ai/v1/nomis/${nomiUuid}/chat`, {
      method: 'GET',
      headers: {
        'Authorization': NOMI_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!messagesResponse.ok) {
      const errorText = await messagesResponse.text();
      console.error('Nomi API error:', messagesResponse.status, errorText);
      throw new Error(`Nomi API error: ${messagesResponse.status}`);
    }

    const messagesData = await messagesResponse.json();
    console.log('Received messages:', messagesData);

    const processedMessages: any[] = [];

    // Process messages that match the /ask chatgpt format
    if (messagesData.messages && Array.isArray(messagesData.messages)) {
      for (const message of messagesData.messages) {
        // Only process messages from the Nomi (not user messages)
        if (message.sent === 'nomi') {
          const question = parseAskCommand(message.text);
          
          if (question) {
            console.log('Found question to process:', question);

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
              continue; // Skip this message and continue with others
            }

            const aiData = await aiResponse.json();
            const answer = aiData.choices[0].message.content;

            console.log('AI answer:', answer);

            // Send response back to Nomi
            const nomiResponse = await fetch(`https://api.nomi.ai/v1/nomis/${nomiUuid}/chat`, {
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
              processedMessages.push({
                messageId: message.uuid,
                question,
                answer,
                timestamp: new Date().toISOString()
              });
              console.log('Reply sent to Nomi successfully');
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
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
