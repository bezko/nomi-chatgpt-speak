import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, UserPlus, UserMinus, MessageSquare, Copy } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Nomi {
  uuid: string;
  name: string;
}

interface Room {
  id: string;
  name: string;
  nomis: Nomi[];
}

interface Message {
  id?: string;
  nomiName: string;
  text: string;
  answer?: string;
  timestamp: string;
  nomi_uuid?: string;
}

const ROOM_NAME = "Inquisitorium";
const POLL_INTERVAL = 60000; // 1 minute
const MAX_MESSAGE_LENGTH = 800; // Maximum characters for Nomi API

// Trim text to max length at the last punctuation mark
const trimToLastPunctuation = (text: string, maxLength: number = MAX_MESSAGE_LENGTH): string => {
  if (text.length <= maxLength) return text;

  const truncated = text.substring(0, maxLength);
  const punctuationMarks = ['.', '!', '?', ';', ':', ','];

  // Find the last punctuation mark
  let lastPunctuationIndex = -1;
  for (const mark of punctuationMarks) {
    const index = truncated.lastIndexOf(mark);
    if (index > lastPunctuationIndex) {
      lastPunctuationIndex = index;
    }
  }

  // If we found punctuation, trim there (including the punctuation)
  // Otherwise, just trim at max length
  return lastPunctuationIndex > 0
    ? truncated.substring(0, lastPunctuationIndex + 1)
    : truncated;
};

// Strip inner monologue (text between single asterisks *like this*)
const stripInnerMonologue = (text: string): string => {
  // Remove text between single asterisks (but not double asterisks for bold)
  // Pattern matches *text* but not **text**
  return text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '').trim();
};

// Parse text with **bold** markdown syntax
const parseMarkdownBold = (text: string): (string | JSX.Element)[] => {
  const parts: (string | JSX.Element)[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;
  let keyCounter = 0;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the bold part
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    // Add the bold text
    parts.push(<strong key={`bold-${keyCounter++}`}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

const Index = () => {
  const [allNomis, setAllNomis] = useState<Nomi[]>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [autoscrollEnabled, setAutoscrollEnabled] = useState(true);
  const { toast } = useToast();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const loadMessagesFromDB = async () => {
    try {
      const { data, error } = await supabase
        .from('nomi_messages')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const formattedMessages: Message[] = (data || []).map(msg => ({
        id: msg.id,
        nomiName: msg.nomi_name || 'Unknown',
        text: msg.message_text || msg.question || '',  // Support both new and old message formats
        answer: msg.answer || undefined,
        timestamp: msg.created_at,
        nomi_uuid: msg.nomi_uuid
      }));

      setMessages(formattedMessages);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const saveMessageToDB = async (message: Message) => {
    try {
      await supabase.from('nomi_messages').insert({
        nomi_uuid: message.nomi_uuid || '',
        nomi_name: message.nomiName,
        question: message.text,
        answer: message.answer,
        message_text: message.text,
        message_type: message.answer ? 'ai_response' : 'regular'
      });
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: "Message copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  // Check if user is scrolled near the bottom (within 100px)
  const isNearBottom = () => {
    if (!scrollAreaRef.current) return true;
    const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return true;

    const { scrollTop, scrollHeight, clientHeight } = viewport;
    return scrollHeight - scrollTop - clientHeight < 100;
  };

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchNomis = async () => {
    const { data, error } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
      body: { action: 'list-nomis' }
    });

    if (error) throw error;
    return data?.nomis || [];
  };

  const fetchRooms = async () => {
    const { data, error } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
      body: { action: 'list-rooms' }
    });

    if (error) throw error;
    return data?.rooms || [];
  };

  const createRoom = async () => {
    const { data, error } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
      body: { 
        action: 'create-room',
        name: ROOM_NAME,
        backchannelingEnabled: true
      }
    });

    if (error) throw error;
    return data?.room;
  };

  const addNomiToRoom = async (nomiUuid: string) => {
    try {
      const { error } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
        body: { 
          action: 'add-nomi-to-room',
          roomId: room?.id,
          nomiUuid
        }
      });

      if (error) throw error;

      await initializeRoom();
      toast({
        title: "Nomi added",
        description: "Nomi added to room successfully",
      });
    } catch (error: any) {
      console.error('Error adding nomi:', error);
      toast({
        title: "Error",
        description: "Failed to add nomi to room",
        variant: "destructive",
      });
    }
  };

  const removeNomiFromRoom = async (nomiUuid: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
        body: {
          action: 'remove-nomi-from-room',
          roomId: room?.id,
          nomiUuid
        }
      });

      if (error) throw error;

      // The room was deleted and recreated with a new ID
      if (data?.newRoomId) {
        console.log('Room recreated with new ID:', data.newRoomId);
        // Update the room with the new data
        setRoom(data.room);
      }

      toast({
        title: "Nomi removed",
        description: "Room was recreated without the selected Nomi",
      });
    } catch (error: any) {
      console.error('Error removing nomi:', error);
      toast({
        title: "Error",
        description: "Failed to remove nomi from room",
        variant: "destructive",
      });
    }
  };

  const pollNomiMessages = async () => {
    if (!room || room.nomis.length === 0) return;

    for (const nomi of room.nomis) {
      try {
        // Get recent messages from this Nomi
        const { data: messagesData, error: messagesError } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
          body: {
            action: 'get-nomi-messages',
            nomiUuid: nomi.uuid
          }
        });

        if (messagesError || !messagesData?.messages) {
          console.error('Error fetching messages:', messagesError);
          continue;
        }

        // Get the most recent message from this Nomi (not from user)
        const nomiMessages = messagesData.messages.filter((msg: any) => msg.sent === 'nomi');
        if (nomiMessages.length === 0) {
          console.log('No messages from Nomi yet');
          continue;
        }

        const latestMessage = nomiMessages[nomiMessages.length - 1];
        const messageText = latestMessage.text;
        const messageWithoutMonologue = stripInnerMonologue(messageText);

        if (messageWithoutMonologue.trim().endsWith('?')) {
          // Ask ChatGPT (with inner monologue stripped)
          const { data: aiData, error: aiError } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
            body: {
              action: 'ask-chatgpt',
              question: messageWithoutMonologue
            }
          });

          if (aiError) {
            console.error('Error asking ChatGPT:', aiError);
            continue;
          }

          const answer = aiData?.answer || '';
          const trimmedAnswer = trimToLastPunctuation(answer);

          // Send answer back to nomi
          await supabase.functions.invoke('nomi-chatgpt-bridge', {
            body: {
              action: 'send-message',
              nomiUuid: nomi.uuid,
              roomId: room.id,
              message: trimmedAnswer
            }
          });

          const newMessage = {
            nomiName: nomi.name,
            text: messageText,
            answer: trimmedAnswer,
            timestamp: new Date().toISOString(),
            nomi_uuid: nomi.uuid
          };

          // Save to DB only - realtime subscription will update UI
          await saveMessageToDB(newMessage);
        } else {
          // Send default response
          await supabase.functions.invoke('nomi-chatgpt-bridge', {
            body: { 
              action: 'send-message',
              nomiUuid: nomi.uuid,
              roomId: room.id,
              message: "Ask me a question"
            }
          });

          const newMessage = {
            nomiName: nomi.name,
            text: messageText,
            answer: "Ask me a question",
            timestamp: new Date().toISOString(),
            nomi_uuid: nomi.uuid
          };

          // Save to DB only - realtime subscription will update UI
          await saveMessageToDB(newMessage);
        }
      } catch (error) {
        console.error(`Error polling nomi ${nomi.name}:`, error);
      }
    }
  };

  const initializeRoom = async () => {
    try {
      setIsLoading(true);

      const [nomis, rooms] = await Promise.all([fetchNomis(), fetchRooms()]);
      setAllNomis(nomis);

      let targetRoom = rooms.find((r: Room) => r.name === ROOM_NAME);

      if (!targetRoom) {
        const newRoom = await createRoom();
        targetRoom = {
          id: newRoom.id,
          name: newRoom.name,
          nomis: []
        };
        toast({
          title: "Room created",
          description: `${ROOM_NAME} room created successfully`,
        });
      }

      setRoom(targetRoom);
    } catch (error: any) {
      console.error('Error initializing:', error);
      toast({
        title: "Error",
        description: "Failed to initialize room",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initializeRoom();
    loadMessagesFromDB();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('nomi_messages_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'nomi_messages'
        },
        (payload) => {
          const newMsg = payload.new as any;
          setMessages(prev => [...prev, {
            id: newMsg.id,
            nomiName: newMsg.nomi_name || 'Unknown',
            text: newMsg.message_text || newMsg.question || '',  // Support both new and old message formats
            answer: newMsg.answer || undefined,
            timestamp: newMsg.created_at,
            nomi_uuid: newMsg.nomi_uuid
          }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (room && room.nomis.length > 0) {
      // Start polling
      pollIntervalRef.current = setInterval(pollNomiMessages, POLL_INTERVAL);
      // Poll immediately
      pollNomiMessages();

      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    }
  }, [room]);

  // Autoscroll to bottom when new messages arrive (only if enabled and user is near bottom)
  useEffect(() => {
    if (autoscrollEnabled && messages.length > 0 && isNearBottom()) {
      scrollToBottom();
    }
  }, [messages, autoscrollEnabled]);

  const nomisNotInRoom = allNomis.filter(
    nomi => !room?.nomis.some(roomNomi => roomNomi.uuid === nomi.uuid)
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Inquisitorium
          </h1>
          <p className="text-muted-foreground">Automated Q&A with Nomis</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Room Members</CardTitle>
              <CardDescription>
                Nomis in {ROOM_NAME} (polling every minute)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {room?.nomis.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No nomis in room</p>
                ) : (
                  room?.nomis.map(nomi => (
                    <div key={nomi.uuid} className="flex items-center justify-between p-2 bg-secondary/20 rounded">
                      <span className="text-sm font-medium">{nomi.name}</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => removeNomiFromRoom(nomi.uuid)}
                        title="Removes Nomi by deleting and recreating the room"
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Available Nomis</CardTitle>
              <CardDescription>Add nomis to the room</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {nomisNotInRoom.length === 0 ? (
                  <p className="text-sm text-muted-foreground">All nomis are in the room</p>
                ) : (
                  nomisNotInRoom.map(nomi => (
                    <div key={nomi.uuid} className="flex items-center justify-between p-2 bg-secondary/20 rounded">
                      <span className="text-sm font-medium">{nomi.name}</span>
                      <Button
                        size="sm"
                        onClick={() => addNomiToRoom(nomi.uuid)}
                      >
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Messages & Answers
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="autoscroll"
                  checked={autoscrollEnabled}
                  onCheckedChange={(checked) => setAutoscrollEnabled(checked as boolean)}
                />
                <Label
                  htmlFor="autoscroll"
                  className="text-sm font-normal cursor-pointer"
                >
                  Auto-scroll
                </Label>
              </div>
            </div>
            <CardDescription>
              Questions ending with '?' are sent to ChatGPT
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] w-full rounded border p-4" ref={scrollAreaRef}>
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet. Polling will start automatically.</p>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, idx) => (
                    <div key={msg.id || idx} className="space-y-2 border-b pb-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          {new Date(msg.timestamp).toLocaleString()} - {msg.nomiName}
                        </div>
                      </div>
                      <div className="text-base font-sans leading-relaxed bg-secondary/30 p-3 rounded relative group">
                        <strong>Q:</strong> {parseMarkdownBold(stripInnerMonologue(msg.text))}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => copyToClipboard(msg.text)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      {msg.answer && (
                        <div className="text-base font-sans leading-relaxed bg-primary/10 p-3 rounded relative group">
                          <strong>A:</strong> {parseMarkdownBold(stripInnerMonologue(msg.answer))}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => copyToClipboard(msg.answer!)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
