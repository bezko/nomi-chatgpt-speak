import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Send, Activity, CheckCircle2, XCircle, Zap } from "lucide-react";

interface TestLog {
  timestamp: string;
  nomiMessage: string;
  question: string | null;
  answer?: string;
  success: boolean;
  error?: string;
}

interface PollInfo {
  timestamp: string;
  totalNomis: number;
  messagesFound: number;
  messagesProcessed: number;
  rawResponses?: Array<{
    nomiName: string;
    nomiUuid: string;
    response: any;
  }>;
}

interface StoredMessage {
  id: string;
  nomi_name: string;
  nomi_uuid: string;
  question: string | null;
  answer: string | null;
  message_text: string | null;
  message_type: string;
  processed_at: string;
}

const Index = () => {
  const [nomiMessage, setNomiMessage] = useState('/ask chatgpt "What is the capital of France?"');
  const [nomiUuid, setNomiUuid] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [lastPoll, setLastPoll] = useState<PollInfo | null>(null);
  const [recentMessages, setRecentMessages] = useState<StoredMessage[]>([]);
  const [apiStatus, setApiStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [nomis, setNomis] = useState<Array<{ uuid: string; name: string }>>([]);
  const [rooms, setRooms] = useState<Array<{ uuid: string; name: string; nomis: Array<{ uuid: string; name: string }> }>>([]);
  const [selectedNomiRooms, setSelectedNomiRooms] = useState<{ [key: string]: boolean }>({});
  const [messageToSend, setMessageToSend] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [autoSelectedNomis, setAutoSelectedNomis] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Fetch recent messages on mount and after polling
  const fetchRecentMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('nomi_messages')
        .select('*')
        .order('processed_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentMessages(data || []);
    } catch (error: any) {
      console.error('Error fetching recent messages:', error);
    }
  };

  const fetchNomis = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
        body: { action: 'list-nomis' }
      });

      if (error) throw error;
      
      if (data?.nomis) {
        setNomis(data.nomis);
      }
    } catch (error: any) {
      console.error('Error fetching Nomis:', error);
    }
  };

  const fetchRooms = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
        body: { action: 'list-rooms' }
      });

      if (error) throw error;
      
      if (data?.rooms) {
        setRooms(data.rooms);
      }
    } catch (error: any) {
      console.error('Error fetching rooms:', error);
    }
  };

  const handleSendMessages = async () => {
    const selected = Object.entries(selectedNomiRooms).filter(([_, checked]) => checked);
    
    if (selected.length === 0) {
      toast({
        title: "No selections",
        description: "Please select at least one Nomi-Room combination",
        variant: "destructive",
      });
      return;
    }

    if (!messageToSend.trim()) {
      toast({
        title: "No message",
        description: "Please enter a message to send",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    let successCount = 0;
    let errorCount = 0;

    for (const [key, _] of selected) {
      const [nomiUuid, roomUuid] = key.split('|');
      
      try {
        const { error } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
          body: { 
            action: 'send-message',
            nomiUuid,
            roomUuid: roomUuid === 'default' ? null : roomUuid,
            message: messageToSend
          }
        });

        if (error) throw error;
        successCount++;
      } catch (error: any) {
        console.error(`Error sending to ${key}:`, error);
        errorCount++;
      }
    }

    setIsSending(false);
    setMessageToSend('');
    setSelectedNomiRooms({});

    if (successCount > 0) {
      toast({
        title: "Messages sent",
        description: `Successfully sent ${successCount} message(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to send messages",
        variant: "destructive",
      });
    }
  };

  const toggleSelection = (nomiUuid: string, roomUuid: string) => {
    const key = `${nomiUuid}|${roomUuid}`;
    setSelectedNomiRooms(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const fetchAutoSelectedNomis = async () => {
    try {
      const { data, error } = await supabase
        .from('selected_nomis' as any)
        .select('*');

      if (error) throw error;
      
      if (data) {
        const selectedSet = new Set(data.map((item: any) => `${item.nomi_uuid}|${item.room_uuid || 'default'}`));
        setAutoSelectedNomis(selectedSet);
      }
    } catch (error: any) {
      console.error('Error fetching auto-selected Nomis:', error);
    }
  };

  const toggleAutoSelection = async (nomiUuid: string, nomiName: string, roomUuid: string | null, roomName: string | null) => {
    const key = `${nomiUuid}|${roomUuid || 'default'}`;
    const isCurrentlySelected = autoSelectedNomis.has(key);

    try {
      if (isCurrentlySelected) {
        // Remove from database
        const { error } = await supabase
          .from('selected_nomis' as any)
          .delete()
          .eq('nomi_uuid', nomiUuid)
          .eq('room_uuid', roomUuid);

        if (error) throw error;

        setAutoSelectedNomis(prev => {
          const newSet = new Set(prev);
          newSet.delete(key);
          return newSet;
        });

        toast({
          title: "Removed from auto-polling",
          description: `${nomiName} in ${roomName || 'default room'} will no longer be auto-polled`,
        });
      } else {
        // Add to database
        const { error } = await supabase
          .from('selected_nomis' as any)
          .insert({
            nomi_uuid: nomiUuid,
            nomi_name: nomiName,
            room_uuid: roomUuid,
            room_name: roomName
          });

        if (error) throw error;

        setAutoSelectedNomis(prev => new Set(prev).add(key));

        toast({
          title: "Added to auto-polling",
          description: `${nomiName} in ${roomName || 'default room'} will be auto-polled every minute`,
        });
      }
    } catch (error: any) {
      console.error('Error toggling auto selection:', error);
      toast({
        title: "Error",
        description: "Failed to update auto-polling selection",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchRecentMessages();
    fetchNomis();
    fetchRooms();
    fetchAutoSelectedNomis();
  }, []);

  const handleTestWebhook = async () => {
    if (!nomiMessage.trim() || !nomiUuid.trim()) {
      toast({
        title: "Missing fields",
        description: "Please enter both Nomi message and UUID",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setApiStatus('idle');

    try {
      const { data, error } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
        body: {
          nomiMessage: nomiMessage,
          nomiUuid: nomiUuid
        }
      });

      if (error) throw error;

      const log: TestLog = {
        timestamp: new Date().toISOString(),
        nomiMessage,
        question: data.question || null,
        answer: data.answer,
        success: data.success || false,
        error: data.error
      };

      setLogs(prev => [log, ...prev]);
      setApiStatus(data.success ? 'success' : 'error');

      if (data.success) {
        toast({
          title: "Success!",
          description: "Message processed and reply sent to Nomi",
        });
      } else if (data.ignored) {
        toast({
          title: "Message Ignored",
          description: "Message doesn't match /ask chatgpt format",
        });
      }

    } catch (error: any) {
      console.error('Error:', error);
      setApiStatus('error');
      
      const log: TestLog = {
        timestamp: new Date().toISOString(),
        nomiMessage,
        question: null,
        success: false,
        error: error.message
      };
      
      setLogs(prev => [log, ...prev]);
      
      toast({
        title: "Error",
        description: error.message || "Failed to process message",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePollMessages = async () => {
    setIsPolling(true);
    setApiStatus('idle');

    try {
      const { data, error } = await supabase.functions.invoke('poll-nomi-messages');

      if (error) throw error;

      // Update last poll info
      setLastPoll({
        timestamp: new Date().toISOString(),
        totalNomis: data.totalNomis || 0,
        messagesFound: data.totalMessagesFound || 0,
        messagesProcessed: data.processedCount || 0,
        rawResponses: data.rawResponses || []
      });

      // Fetch updated messages
      await fetchRecentMessages();

      if (data.processedCount > 0) {
        // Add all processed messages to logs
        const newLogs = data.processedMessages.map((msg: any) => ({
          timestamp: msg.timestamp,
          nomiMessage: `/ask chatgpt "${msg.question}"`,
          question: msg.question,
          answer: msg.answer,
          success: true
        }));
        
        setLogs(prev => [...newLogs, ...prev]);
        setApiStatus('success');
        
        toast({
          title: "Messages Processed",
          description: `Successfully processed ${data.processedCount} message(s) from ${data.totalNomis} Nomi(s)`,
        });
      } else {
        toast({
          title: "No New Messages",
          description: `Checked ${data.totalNomis} Nomi(s) - no new messages matching /ask chatgpt format found`,
        });
      }

    } catch (error: any) {
      console.error('Poll Error:', error);
      setApiStatus('error');
      
      toast({
        title: "Poll Error",
        description: error.message || "Failed to poll Nomi messages",
        variant: "destructive",
      });
    } finally {
      setIsPolling(false);
    }
  };

  const getStatusColor = () => {
    switch (apiStatus) {
      case 'success': return 'text-success';
      case 'error': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = () => {
    switch (apiStatus) {
      case 'success': return <CheckCircle2 className="h-4 w-4" />;
      case 'error': return <XCircle className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Zap className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Nomi ↔ ChatGPT Bridge
            </h1>
          </div>
          <p className="text-muted-foreground">Automated message processing with Lovable AI (Free Gemini)</p>
        </div>

        {/* Auto-Polling Configuration */}
        <Card className="border-accent/20 bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-accent" />
              Auto-Polling Configuration
            </CardTitle>
            <CardDescription>
              Select Nomis to auto-poll every minute. Questions ending with '?' will be answered by Gemini.
              {autoSelectedNomis.size > 0 && (
                <span className="block mt-1 text-accent font-medium">
                  {autoSelectedNomis.size} Nomi(s) selected for auto-polling
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="text-sm font-medium">Your Nomis (Default Rooms)</div>
              {nomis.length === 0 ? (
                <p className="text-muted-foreground text-sm">Loading Nomis...</p>
              ) : (
                <div className="grid gap-2">
                  {nomis.map((nomi) => {
                    const key = `${nomi.uuid}|default`;
                    const isSelected = autoSelectedNomis.has(key);
                    return (
                      <div key={key} className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${isSelected ? 'bg-accent/10 border-accent/30' : 'bg-secondary/30 hover:bg-secondary/50'}`}>
                        <input
                          type="checkbox"
                          id={`auto-${key}`}
                          checked={isSelected}
                          onChange={() => toggleAutoSelection(nomi.uuid, nomi.name, null, null)}
                          className="h-4 w-4 rounded border-border"
                        />
                        <label htmlFor={`auto-${key}`} className="flex-1 flex items-center justify-between cursor-pointer">
                          <span className="font-medium">{nomi.name}</span>
                          <code className="text-xs bg-background px-2 py-1 rounded border">{nomi.uuid}</code>
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {rooms.length > 0 && (
              <div className="space-y-4">
                <div className="text-sm font-medium">Rooms</div>
                {rooms.map((room) => (
                  <div key={room.uuid} className="border rounded-lg p-3 bg-secondary/20">
                    <div className="font-medium mb-3 flex items-center justify-between">
                      <span>{room.name}</span>
                      <code className="text-xs bg-background px-2 py-1 rounded border">{room.uuid}</code>
                    </div>
                    <div className="grid gap-2 pl-4">
                      {room.nomis && room.nomis.map((nomi) => {
                        const key = `${nomi.uuid}|${room.uuid}`;
                        const isSelected = autoSelectedNomis.has(key);
                        return (
                          <div key={key} className={`flex items-center gap-3 p-2 border rounded-lg transition-colors ${isSelected ? 'bg-accent/10 border-accent/30' : 'bg-background/50 hover:bg-background'}`}>
                            <input
                              type="checkbox"
                              id={`auto-${key}`}
                              checked={isSelected}
                              onChange={() => toggleAutoSelection(nomi.uuid, nomi.name, room.uuid, room.name)}
                              className="h-4 w-4 rounded border-border"
                            />
                            <label htmlFor={`auto-${key}`} className="flex-1 flex items-center justify-between cursor-pointer">
                              <span className="text-sm">{nomi.name}</span>
                              <code className="text-xs bg-secondary px-2 py-1 rounded border">{nomi.uuid}</code>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manual Message Sending */}
        <Card className="border-primary/20 bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Manual Message Sending
            </CardTitle>
            <CardDescription>Select Nomi-Room combinations and send a message</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Message to Send</label>
              <Textarea
                placeholder="Enter your message..."
                value={messageToSend}
                onChange={(e) => setMessageToSend(e.target.value)}
                className="min-h-[80px] resize-none bg-secondary border-border"
                disabled={isSending}
              />
            </div>

            <div className="space-y-4">
              <div className="text-sm font-medium">Your Nomis (Default Rooms)</div>
              {nomis.length === 0 ? (
                <p className="text-muted-foreground text-sm">Loading Nomis...</p>
              ) : (
                <div className="grid gap-2">
                  {nomis.map((nomi) => (
                    <div key={`${nomi.uuid}-default`} className="flex items-center gap-3 p-3 border rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                      <input
                        type="checkbox"
                        id={`nomi-${nomi.uuid}-default`}
                        checked={selectedNomiRooms[`${nomi.uuid}|default`] || false}
                        onChange={() => toggleSelection(nomi.uuid, 'default')}
                        className="h-4 w-4 rounded border-border"
                        disabled={isSending}
                      />
                      <label htmlFor={`nomi-${nomi.uuid}-default`} className="flex-1 flex items-center justify-between cursor-pointer">
                        <span className="font-medium">{nomi.name}</span>
                        <code className="text-xs bg-background px-2 py-1 rounded border">{nomi.uuid}</code>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {rooms.length > 0 && (
              <div className="space-y-4">
                <div className="text-sm font-medium">Rooms</div>
                {rooms.map((room) => (
                  <div key={room.uuid} className="border rounded-lg p-3 bg-secondary/20">
                    <div className="font-medium mb-3 flex items-center justify-between">
                      <span>{room.name}</span>
                      <code className="text-xs bg-background px-2 py-1 rounded border">{room.uuid}</code>
                    </div>
                    <div className="grid gap-2 pl-4">
                      {room.nomis && room.nomis.map((nomi) => (
                        <div key={`${nomi.uuid}-${room.uuid}`} className="flex items-center gap-3 p-2 border rounded-lg bg-background/50 hover:bg-background transition-colors">
                          <input
                            type="checkbox"
                            id={`nomi-${nomi.uuid}-room-${room.uuid}`}
                            checked={selectedNomiRooms[`${nomi.uuid}|${room.uuid}`] || false}
                            onChange={() => toggleSelection(nomi.uuid, room.uuid)}
                            className="h-4 w-4 rounded border-border"
                            disabled={isSending}
                          />
                          <label htmlFor={`nomi-${nomi.uuid}-room-${room.uuid}`} className="flex-1 flex items-center justify-between cursor-pointer">
                            <span className="text-sm">{nomi.name}</span>
                            <code className="text-xs bg-secondary px-2 py-1 rounded border">{nomi.uuid}</code>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button 
              onClick={handleSendMessages}
              disabled={isSending || Object.values(selectedNomiRooms).every(v => !v)}
              className="w-full"
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send to Selected ({Object.values(selectedNomiRooms).filter(v => v).length})
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Raw API Responses */}
        {lastPoll?.rawResponses && lastPoll.rawResponses.length > 0 && (
          <Card className="border-primary/20 bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Raw API Responses
              </CardTitle>
              <CardDescription>Latest responses from Nomi API chat endpoints</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {lastPoll.rawResponses.map((raw, index) => (
                  <div key={index} className="border rounded-lg p-4 bg-secondary/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">{raw.nomiName}</span>
                      <code className="text-xs bg-background px-2 py-1 rounded border">{raw.nomiUuid}</code>
                    </div>
                    <pre className="text-xs bg-background p-3 rounded border overflow-x-auto max-h-96 overflow-y-auto">
                      {JSON.stringify(raw.response, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Messages */}
        {recentMessages.length > 0 && (
          <Card className="border-primary/20 bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Last 5 Messages
              </CardTitle>
              <CardDescription>Most recent processed messages across all Nomis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentMessages.map((msg) => (
                  <div key={msg.id} className="p-3 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-primary">{msg.nomi_name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {msg.message_type}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.processed_at).toLocaleString()}
                      </span>
                    </div>
                    {msg.message_type === 'chatgpt' ? (
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium">Q:</span> {msg.question}
                        </div>
                        <div>
                          <span className="font-medium">A:</span> {msg.answer}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm">
                        <span className="font-medium">Message:</span> {msg.message_text}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Last Poll Info */}
        {lastPoll && (
          <Card className="border-primary/20 bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Last Poll Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total Nomis</span>
                  <span className="text-sm font-semibold">{lastPoll.totalNomis}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Polled At</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(lastPoll.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Messages Found</span>
                  <span className="text-sm font-semibold">{lastPoll.messagesFound}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Messages Processed</span>
                  <span className="text-sm font-semibold text-success">{lastPoll.messagesProcessed}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* API Status */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className={getStatusColor()}>{getStatusIcon()}</span>
              Webhook Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Endpoint</span>
                <code className="text-xs bg-secondary px-2 py-1 rounded">
                  /functions/v1/nomi-chatgpt-bridge
                </code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">AI Model</span>
                <code className="text-xs bg-secondary px-2 py-1 rounded">
                  google/gemini-2.5-flash (Free)
                </code>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test Interface */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Test Webhook</CardTitle>
            <CardDescription>
              Simulate a message from your Nomi character
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nomi UUID</label>
              <Input
                placeholder="e.g., 7c38494b-ea1a-407e-99e8-72c7ede65931"
                value={nomiUuid}
                onChange={(e) => setNomiUuid(e.target.value)}
                className="bg-secondary border-border"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Get this from your Nomi's profile
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Nomi Message</label>
              <Textarea
                placeholder='Enter message with format: /ask chatgpt "your question"'
                value={nomiMessage}
                onChange={(e) => setNomiMessage(e.target.value)}
                className="min-h-[100px] resize-none bg-secondary border-border font-mono text-sm"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Only messages matching <code className="bg-secondary px-1 rounded">/ask chatgpt "..."</code> will be processed
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <Button 
                onClick={handleTestWebhook}
                disabled={isLoading || isPolling}
                variant="default"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Test Webhook
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Poll All Nomis Button */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Auto-Poll All Nomis</CardTitle>
            <CardDescription>
              Automatically check all your Nomis for new messages
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handlePollMessages}
              disabled={isPolling || isLoading}
              variant="secondary"
              className="w-full"
            >
              {isPolling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Polling All Nomis...
                </>
              ) : (
                <>
                  <Activity className="mr-2 h-4 w-4" />
                  Poll All Nomis
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Logs */}
        {logs.length > 0 && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Test Logs</CardTitle>
              <CardDescription>
                Recent webhook executions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {logs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border-l-4 ${
                      log.success
                        ? 'bg-success/5 border-success'
                        : 'bg-destructive/5 border-destructive'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        {log.success ? 'Success' : 'Failed'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">Message:</span>{' '}
                        <code className="text-xs bg-secondary px-1 rounded">{log.nomiMessage}</code>
                      </div>
                      
                      {log.question && (
                        <div>
                          <span className="font-medium">Extracted:</span>{' '}
                          <span className="text-primary">{log.question}</span>
                        </div>
                      )}
                      
                      {log.answer && (
                        <div>
                          <span className="font-medium">AI Response:</span>{' '}
                          <span>{log.answer}</span>
                        </div>
                      )}
                      
                      {log.error && (
                        <div className="text-destructive">
                          <span className="font-medium">Error:</span> {log.error}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* API Documentation */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Integration Guide</CardTitle>
            <CardDescription>
              How to connect this webhook with your Nomi character
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Step 1: Get Your Nomi UUID</h3>
              <p className="text-sm text-muted-foreground mb-2">
                List your Nomis to get their UUIDs:
              </p>
              <code className="block text-xs bg-secondary p-3 rounded overflow-x-auto">
                curl --header 'Authorization: YOUR_NOMI_API_KEY' \<br/>
                &nbsp;&nbsp;&nbsp;&nbsp; https://api.nomi.ai/v1/nomis
              </code>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Step 2: Webhook Endpoint</h3>
              <code className="block text-xs bg-secondary p-3 rounded overflow-x-auto">
                POST https://jxefhavqmjdljdzvwbhx.supabase.co/functions/v1/nomi-chatgpt-bridge
              </code>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Step 3: Message Format</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Messages must follow this pattern:
              </p>
              <code className="block text-xs bg-secondary p-3 rounded">
                /ask chatgpt "What is the meaning of life?"
              </code>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Step 4: Request Format</h3>
              <code className="block text-xs bg-secondary p-3 rounded overflow-x-auto whitespace-pre">
{`{
  "nomiMessage": "/ask chatgpt \"your question\"",
  "nomiUuid": "7c38494b-ea1a-407e-99e8-72c7ede65931"
}`}
              </code>
            </div>

            <div className="bg-info/10 border border-info/20 rounded-lg p-4">
              <p className="text-sm">
                <strong>Automatic Polling:</strong> The "Poll All Nomis" button fetches messages from all your Nomi characters automatically.
              </p>
              <ul className="text-sm space-y-1 mt-2 ml-4 list-disc">
                <li>Automatically fetches all Nomis from your account</li>
                <li>Checks each Nomi for messages matching the /ask chatgpt format</li>
                <li>Processes questions through Lovable AI (Free Gemini)</li>
                <li>Sends responses back to each Nomi automatically</li>
                <li>Stores all processed messages in the database</li>
                <li>You can set up a cron job to run this periodically</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
