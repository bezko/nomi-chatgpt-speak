import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, UserPlus, UserMinus, MessageSquare } from "lucide-react";
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
  nomiName: string;
  text: string;
  answer?: string;
  timestamp: string;
}

const ROOM_NAME = "Inquisitorium";
const POLL_INTERVAL = 60000; // 1 minute

const Index = () => {
  const [allNomis, setAllNomis] = useState<Nomi[]>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
      const { error } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
        body: { 
          action: 'remove-nomi-from-room',
          roomId: room?.id,
          nomiUuid
        }
      });

      if (error) throw error;

      await initializeRoom();
      toast({
        title: "Nomi removed",
        description: "Nomi removed from room successfully",
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
        // Request chat from nomi
        const { error: requestError } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
          body: { 
            action: 'request-chat',
            roomId: room.id,
            nomiUuid: nomi.uuid
          }
        });

        if (requestError) {
          console.error('Error requesting chat:', requestError);
          continue;
        }

        // Wait a bit for response
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get messages
      const { data: messagesData, error: messagesError } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
        body: { 
          action: 'get-room-messages',
          roomId: room.id
        }
      });

        if (messagesError) {
          console.error('Error getting messages:', messagesError);
          continue;
        }

        const lastMessage = messagesData?.messages?.[0];
        if (!lastMessage || lastMessage.sent === 'user') continue;

        const messageText = lastMessage.text;
        
        if (messageText.trim().endsWith('?')) {
          // Ask ChatGPT
          const { data: aiData, error: aiError } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
            body: { 
              action: 'ask-chatgpt',
              question: messageText
            }
          });

          if (aiError) {
            console.error('Error asking ChatGPT:', aiError);
            continue;
          }

          const answer = aiData?.answer || '';

          // Send answer back to nomi
          await supabase.functions.invoke('nomi-chatgpt-bridge', {
            body: { 
              action: 'send-message',
              nomiUuid: nomi.uuid,
              roomId: room.id,
              message: answer
            }
          });

          setMessages(prev => [...prev, {
            nomiName: nomi.name,
            text: messageText,
            answer,
            timestamp: new Date().toISOString()
          }]);
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

          setMessages(prev => [...prev, {
            nomiName: nomi.name,
            text: messageText,
            answer: "Ask me a question",
            timestamp: new Date().toISOString()
          }]);
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
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Messages & Answers
            </CardTitle>
            <CardDescription>
              Questions ending with '?' are sent to ChatGPT
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] w-full rounded border p-4">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet. Polling will start automatically.</p>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, idx) => (
                    <div key={idx} className="space-y-1 border-b pb-3">
                      <div className="text-xs text-muted-foreground">
                        {new Date(msg.timestamp).toLocaleString()} - {msg.nomiName}
                      </div>
                      <div className="text-sm">
                        <strong>Q:</strong> {msg.text}
                      </div>
                      {msg.answer && (
                        <div className="text-sm text-primary">
                          <strong>A:</strong> {msg.answer}
                        </div>
                      )}
                    </div>
                  ))}
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
