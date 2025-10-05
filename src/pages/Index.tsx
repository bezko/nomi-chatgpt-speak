import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Send, Activity, Zap } from "lucide-react";

interface Room {
  id: string;
  name: string;
  nomis: Array<{ uuid: string; name: string }>;
}

const Index = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchRooms = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
        body: { action: 'list-rooms' }
      });

      if (error) throw error;
      
      if (data?.rooms) {
        setRooms(data.rooms);
        toast({
          title: "Rooms loaded",
          description: `Found ${data.rooms.length} room(s)`,
        });
      }
    } catch (error: any) {
      console.error('Error fetching rooms:', error);
      toast({
        title: "Error",
        description: "Failed to fetch rooms",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestChat = async (roomId: string, roomName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
        body: { action: 'request-chat', roomId }
      });

      if (error) throw error;

      toast({
        title: "Chat request sent",
        description: `Requested chat from ${roomName}`,
      });
    } catch (error: any) {
      console.error('Error requesting chat:', error);
      toast({
        title: "Error",
        description: "Failed to request chat",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Zap className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Nomi Rooms Manager
            </h1>
          </div>
          <p className="text-muted-foreground">View rooms and request chat from Nomis</p>
        </div>

        {/* Rooms List */}
        <Card className="border-primary/20 bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Rooms & Nomis
            </CardTitle>
            <CardDescription>
              {rooms.length > 0 ? `${rooms.length} room(s) found` : 'No rooms found'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : rooms.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No rooms available</p>
                <Button onClick={fetchRooms}>
                  Refresh
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {rooms.map((room) => (
                  <div key={room.id} className="border rounded-lg p-4 bg-secondary/20">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-lg">{room.name}</h3>
                        <code className="text-xs bg-background px-2 py-1 rounded border">{room.id}</code>
                      </div>
                      <Button 
                        onClick={() => handleRequestChat(room.id, room.name)}
                        size="sm"
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Request Chat
                      </Button>
                    </div>
                    
                    {room.nomis && room.nomis.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="text-sm font-medium mb-2">Nomis in this room:</div>
                        <div className="grid gap-2">
                          {room.nomis.map((nomi) => (
                            <div key={nomi.uuid} className="flex items-center justify-between p-2 bg-background/50 rounded border">
                              <span className="text-sm font-medium">{nomi.name}</span>
                              <code className="text-xs bg-secondary px-2 py-1 rounded border">{nomi.uuid}</code>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
