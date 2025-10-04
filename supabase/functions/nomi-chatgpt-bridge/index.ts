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
    const body = await req.json();
    const NOMI_API_KEY = Deno.env.get('NOMI_API_KEY');
    
    if (!NOMI_API_KEY) {
      throw new Error('NOMI_API_KEY is not configured');
    }

    // Handle list-nomis action
    if (body.action === 'list-nomis') {
      console.log('Fetching list of Nomis...');
      const nomisResponse = await fetch('https://api.nomi.ai/v1/nomis', {
        method: 'GET',
        headers: {
          'Authorization': NOMI_API_KEY,
        },
      });

      if (!nomisResponse.ok) {
        const errorText = await nomisResponse.text();
        console.error('Nomi API error:', nomisResponse.status, errorText);
        throw new Error(`Nomi API error: ${nomisResponse.status}`);
      }

      const nomisData = await nomisResponse.json();
      const nomis = nomisData.nomis.map((nomi: any) => ({
        uuid: nomi.uuid,
        name: nomi.name
      }));

      console.log(`Found ${nomis.length} Nomis`);
      
      return new Response(
        JSON.stringify({ nomis }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Handle list-rooms action
    if (body.action === 'list-rooms') {
      console.log('Fetching list of rooms...');
      const roomsResponse = await fetch('https://api.nomi.ai/v1/rooms', {
        method: 'GET',
        headers: {
          'Authorization': NOMI_API_KEY,
        },
      });

      if (!roomsResponse.ok) {
        const errorText = await roomsResponse.text();
        console.error('Nomi API error:', roomsResponse.status, errorText);
        throw new Error(`Nomi API error: ${roomsResponse.status}`);
      }

      const roomsData = await roomsResponse.json();
      
      console.log(`Found ${roomsData.rooms?.length || 0} rooms`);
      
      return new Response(
        JSON.stringify({ rooms: roomsData.rooms || [] }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Handle send-message action (send message to specific Nomi in specific room)
    if (body.action === 'send-message') {
      const { nomiUuid, roomUuid, message } = body;
      
      if (!nomiUuid || !message) {
        throw new Error('nomiUuid and message are required');
      }

      console.log(`Sending message to Nomi ${nomiUuid} in room ${roomUuid || 'default'}`);
      
      const url = roomUuid 
        ? `https://api.nomi.ai/v1/nomis/${nomiUuid}/rooms/${roomUuid}/chat`
        : `https://api.nomi.ai/v1/nomis/${nomiUuid}/chat`;
      
      const sendResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': NOMI_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageText: message
        }),
      });

      if (!sendResponse.ok) {
        const errorText = await sendResponse.text();
        console.error('Nomi API error:', sendResponse.status, errorText);
        throw new Error(`Nomi API error: ${sendResponse.status}`);
      }

      const responseData = await sendResponse.json();
      console.log('Message sent successfully');
      
      return new Response(
        JSON.stringify({ 
          success: true,
          response: responseData,
          timestamp: new Date().toISOString()
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Original webhook handling
    const { nomiMessage, nomiUuid } = body;
    
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

    // Get Lovable API key
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
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
