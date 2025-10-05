import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const NOMI_API_KEY = Deno.env.get('NOMI_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!NOMI_API_KEY || !LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Required environment variables are not configured');
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('Fetching selected Nomis for auto-polling...');
    
    // Fetch selected nomis from the database
    const { data: selectedNomis, error: fetchError } = await supabase
      .from('selected_nomis')
      .select('*');

    if (fetchError) {
      console.error('Error fetching selected nomis:', fetchError);
      throw fetchError;
    }

    if (!selectedNomis || selectedNomis.length === 0) {
      console.log('No Nomis selected for auto-polling');
      return new Response(
        JSON.stringify({ 
          message: 'No Nomis selected for auto-polling',
          processedCount: 0
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Found ${selectedNomis.length} selected Nomi(s)`);

    let processedCount = 0;
    const processedMessages = [];

    // Process each selected Nomi
    for (const selection of selectedNomis) {
      const { nomi_uuid, nomi_name, room_uuid, room_name } = selection;
      
      console.log(`Checking Nomi: ${nomi_name} in room: ${room_name || 'default'}`);
      
      // Fetch messages from Nomi API
      const chatUrl = room_uuid 
        ? `https://api.nomi.ai/v1/nomis/${nomi_uuid}/rooms/${room_uuid}/chat`
        : `https://api.nomi.ai/v1/nomis/${nomi_uuid}/chat`;
      
      const chatResponse = await fetch(chatUrl, {
        method: 'GET',
        headers: {
          'Authorization': NOMI_API_KEY,
        },
      });

      if (!chatResponse.ok) {
        console.error(`Failed to fetch messages for ${nomi_name}:`, chatResponse.status);
        continue;
      }

      const chatData = await chatResponse.json();
      const messages = chatData.messages || [];
      
      console.log(`Found ${messages.length} messages from ${nomi_name}`);

      // Find the most recent message from the Nomi that ends with '?'
      const nomiMessages = messages.filter((msg: any) => msg.sent === 'nomi');
      const latestQuestion = nomiMessages.find((msg: any) => 
        msg.text && msg.text.trim().endsWith('?')
      );

      if (!latestQuestion) {
        console.log(`No questions found from ${nomi_name}`);
        continue;
      }

      const question = latestQuestion.text.trim();
      console.log(`Found question from ${nomi_name}: ${question}`);

      // Prepend instruction and call Lovable AI
      const promptWithLimit = `Answer in less than 800 characters. ${question}`;
      
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
              content: 'You are a helpful AI assistant. Provide clear, concise answers in less than 800 characters.'
            },
            {
              role: 'user',
              content: promptWithLimit
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
      let answer = aiData.choices[0].message.content;
      
      // Truncate to 800 characters if needed
      if (answer.length > 800) {
        answer = answer.substring(0, 797) + '...';
      }

      console.log(`AI answer (${answer.length} chars): ${answer}`);

      // Send response back to Nomi in the correct room
      console.log(`Sending reply to ${nomi_name} in ${room_name || 'default room'}...`);
      const replyUrl = room_uuid 
        ? `https://api.nomi.ai/v1/nomis/${nomi_uuid}/rooms/${room_uuid}/chat`
        : `https://api.nomi.ai/v1/nomis/${nomi_uuid}/chat`;
      
      const nomiResponse = await fetch(replyUrl, {
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
        continue;
      }

      console.log(`Reply sent successfully to ${nomi_name}`);

      // Store in database
      await supabase
        .from('nomi_messages')
        .insert({
          nomi_uuid,
          nomi_name,
          question,
          answer,
          message_text: question,
          message_type: 'auto-question'
        });

      processedCount++;
      processedMessages.push({
        nomiName: nomi_name,
        roomName: room_name || 'default',
        question,
        answer
      });
    }

    console.log(`Auto-polling complete. Processed ${processedCount} message(s)`);

    return new Response(
      JSON.stringify({ 
        success: true,
        processedCount,
        processedMessages,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in auto-poll-nomis:', error);
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
