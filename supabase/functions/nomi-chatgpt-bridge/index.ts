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
      const roomsResponse = await fetch('https://api.nomi.ai/v1/rooms/', {
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
      console.log('Nomi API list-rooms response:', JSON.stringify(roomsData, null, 2));
      
      const rooms = (roomsData.rooms || []).map((room: any) => ({
        id: room.uuid,
        name: room.name,
        nomis: (room.nomis || []).map((nomi: any) => ({
          uuid: nomi.uuid,
          name: nomi.name
        }))
      }));
      
      console.log(`Found ${rooms.length} rooms with nomis`);
      
      return new Response(
        JSON.stringify({ rooms }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Handle create-room action
    if (body.action === 'create-room') {
      const { name, backchannelingEnabled } = body;
      
      console.log(`Creating room "${name}" with backchanneling: ${backchannelingEnabled}`);
      
      const createResponse = await fetch('https://api.nomi.ai/v1/rooms', {
        method: 'POST',
        headers: {
          'Authorization': NOMI_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          backchannelingEnabled,
          nomiUuids: ['d94ae61e-e606-45ec-8456-324d1e76c6aa'], // Paige
          note: 'Inquisitorium room for automated Q&A'
        }),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('Nomi API error:', createResponse.status, errorText);
        throw new Error(`Nomi API error: ${createResponse.status}`);
      }

      const roomData = await createResponse.json();
      console.log('Nomi API create-room response:', JSON.stringify(roomData, null, 2));
      
      return new Response(
        JSON.stringify({ room: roomData }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Handle add-nomi-to-room action
    if (body.action === 'add-nomi-to-room') {
      const { roomId, nomiUuid } = body;

      if (!roomId || !nomiUuid) {
        return new Response(
          JSON.stringify({ error: 'roomId and nomiUuid are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Adding nomi ${nomiUuid} to room ${roomId}`);

      // Fetch current room to get existing nomi UUIDs
      const roomsResponse = await fetch('https://api.nomi.ai/v1/rooms/', {
        method: 'GET',
        headers: { 'Authorization': NOMI_API_KEY },
      });

      if (!roomsResponse.ok) {
        const errorText = await roomsResponse.text();
        console.error('Failed to fetch rooms:', roomsResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `Failed to fetch rooms: ${roomsResponse.status}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const roomsData = await roomsResponse.json();
      const room = roomsData.rooms?.find((r: any) => r.uuid === roomId);
      
      if (!room) {
        return new Response(
          JSON.stringify({ error: 'Room not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const currentNomiUuids = (room.nomis || []).map((n: any) => n.uuid);
      const updatedNomiUuids = Array.from(new Set([...currentNomiUuids, nomiUuid]));

      // PUT the room with updated nomiUuids
      const updateResponse = await fetch(`https://api.nomi.ai/v1/rooms/${roomId}`, {
        method: 'PUT',
        headers: {
          'Authorization': NOMI_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: room.name,
          backchannelingEnabled: room.backchannelingEnabled,
          nomiUuids: updatedNomiUuids
        }),
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('Nomi API error:', updateResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `Nomi API error: ${updateResponse.status}`, details: errorText }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const responseData = await updateResponse.json();
      console.log('Nomi added successfully via PUT /v1/rooms/{id}');
      
      return new Response(
        JSON.stringify({ success: true, response: responseData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle remove-nomi-from-room action
    if (body.action === 'remove-nomi-from-room') {
      const { roomId, nomiUuid } = body;
      
      console.log(`Removing nomi ${nomiUuid} from room ${roomId}`);
      
      const removeResponse = await fetch(`https://api.nomi.ai/v1/rooms/${roomId}/nomis/${nomiUuid}`, {
        method: 'DELETE',
        headers: {
          'Authorization': NOMI_API_KEY,
        },
      });

      if (!removeResponse.ok) {
        const errorText = await removeResponse.text();
        console.error('Nomi API error:', removeResponse.status, errorText);
        throw new Error(`Nomi API error: ${removeResponse.status}`);
      }

      console.log('Nomi removed from room successfully');
      
      return new Response(
        JSON.stringify({ success: true }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Handle get-room-messages action
    if (body.action === 'get-room-messages') {
      const { roomId } = body;
      
      console.log(`Fetching messages for room ${roomId}`);

      // Try the messages endpoint first (current API)
      const primaryResponse = await fetch(`https://api.nomi.ai/v1/rooms/${roomId}/messages`, {
        method: 'GET',
        headers: { 'Authorization': NOMI_API_KEY },
      });

      if (primaryResponse.ok) {
        const primaryData = await primaryResponse.json();
        return new Response(
          JSON.stringify({ messages: primaryData.messages || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const primaryText = await primaryResponse.text();
      console.warn('Nomi API warning (rooms/messages):', primaryResponse.status, primaryText);

      // Fallback to legacy chat endpoint
      const fallbackResponse = await fetch(`https://api.nomi.ai/v1/rooms/${roomId}/chat`, {
        method: 'GET',
        headers: { 'Authorization': NOMI_API_KEY },
      });

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        console.log('Nomi API get-room-messages (fallback chat) response:', JSON.stringify(fallbackData, null, 2));
        return new Response(
          JSON.stringify({ messages: fallbackData.messages || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const fbText = await fallbackResponse.text();
      console.warn('Nomi API warning (rooms/chat):', fallbackResponse.status, fbText);

      // Gracefully return empty array to keep UI working and silence 404 noise
      return new Response(
        JSON.stringify({ messages: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle request-chat action (request chat from Nomi in room)
    if (body.action === 'request-chat') {
      const { roomId, nomiUuid } = body;
      
      if (!roomId) {
        throw new Error('roomId is required');
      }

      console.log(`Requesting chat from room ${roomId}`);
      
      const requestResponse = await fetch(`https://api.nomi.ai/v1/rooms/${roomId}/chat/request`, {
        method: 'POST',
        headers: {
          'Authorization': NOMI_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nomiUuid }),
      });

      if (!requestResponse.ok) {
        const errorText = await requestResponse.text();
        // Handle known transient state without surfacing a 500 to the client
        if (requestResponse.status === 400 && errorText.includes('RoomNomiNotReadyForMessage')) {
          console.info('Nomi not ready for message yet, returning non-fatal response');
          return new Response(
            JSON.stringify({ success: false, reason: 'not_ready', timestamp: new Date().toISOString() }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.warn('Nomi API non-ok (request-chat):', requestResponse.status, errorText);
        return new Response(
          JSON.stringify({ success: false, reason: 'upstream_error', upstreamStatus: requestResponse.status, upstreamBody: errorText, timestamp: new Date().toISOString() }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const responseData = await requestResponse.json();
      console.log('Chat request sent successfully');
      console.log('Nomi API request-chat response:', JSON.stringify(responseData, null, 2));
      
      return new Response(
        JSON.stringify({ 
          success: true,
          response: responseData,
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle send-message action (send message to specific Nomi in specific room)
    if (body.action === 'send-message') {
      const { nomiUuid, roomId, message } = body;
      
      if (!nomiUuid || !message || !roomId) {
        throw new Error('nomiUuid, roomId, and message are required');
      }

      console.log(`Sending message to Nomi ${nomiUuid} in room ${roomId}`);
      
      // Try sending to the room first
      const primary = await fetch(`https://api.nomi.ai/v1/rooms/${roomId}/chat`, {
        method: 'POST',
        headers: {
          'Authorization': NOMI_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageText: message }),
      });

      if (primary.ok) {
        const data = await primary.json().catch(() => ({}));
        console.log('Message sent to room successfully');
        return new Response(
          JSON.stringify({ success: true, response: data, timestamp: new Date().toISOString() }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const primaryText = await primary.text();
      console.warn('Room chat send not OK:', primary.status, primaryText);

      // Fallback: direct nomi chat (outside room)
      const fallback = await fetch(`https://api.nomi.ai/v1/nomis/${nomiUuid}/chat`, {
        method: 'POST',
        headers: {
          'Authorization': NOMI_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageText: message }),
      });

      if (fallback.ok) {
        const data = await fallback.json().catch(() => ({}));
        console.log('Message sent to nomi successfully (fallback)');
        return new Response(
          JSON.stringify({ success: true, response: data, timestamp: new Date().toISOString() }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const fbText = await fallback.text();
      console.error('Send-message upstream error:', fallback.status, fbText);
      return new Response(
        JSON.stringify({ success: false, reason: 'upstream_error', upstreamStatus: fallback.status, upstreamBody: fbText, timestamp: new Date().toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle ask-chatgpt action
    if (body.action === 'ask-chatgpt') {
      const { question } = body;
      
      if (!question) {
        throw new Error('question is required');
      }

      console.log('Asking ChatGPT:', question);

      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        throw new Error('LOVABLE_API_KEY is not configured');
      }

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
      
      return new Response(
        JSON.stringify({ answer }),
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
    console.log('Nomi API reply response:', JSON.stringify(nomiData, null, 2));

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
