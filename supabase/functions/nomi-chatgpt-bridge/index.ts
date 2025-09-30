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
    const { nomiMessage, nomiUuid } = await req.json();
    
    if (!nomiMessage) {
      throw new Error('No nomiMessage provided');
    }

    if (!nomiUuid) {
      throw new Error('No nomiUuid provided');
    }

    console.log('Received message from Nomi:', nomiMessage);
    console.log('Nomi UUID:', nomiUuid);

    // Parse the message for /ask chatgpt "question"
    const question = parseAskCommand(nomiMessage);
    
    if (!question) {
      console.log('Message does not match /ask chatgpt format, ignoring');
      return new Response(
        JSON.stringify({ 
          ignored: true,
          message: 'Message format not recognized'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Extracted question:', question);

    // Get API keys
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const NOMI_API_KEY = Deno.env.get('NOMI_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    if (!NOMI_API_KEY) {
      throw new Error('NOMI_API_KEY is not configured');
    }

    // Call Lovable AI (free Gemini)
    console.log('Calling Lovable AI...');
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
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const answer = aiData.choices[0].message.content;

    console.log('AI answer:', answer);

    // Send response back to Nomi
    console.log('Sending reply to Nomi...');
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

    if (!nomiResponse.ok) {
      const errorText = await nomiResponse.text();
      console.error('Nomi API error:', nomiResponse.status, errorText);
      throw new Error(`Nomi API error: ${nomiResponse.status}`);
    }

    const nomiData = await nomiResponse.json();
    console.log('Reply sent to Nomi successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        question,
        answer,
        nomiResponse: nomiData,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in nomi-chatgpt-bridge:', error);
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
