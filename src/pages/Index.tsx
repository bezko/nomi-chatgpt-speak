import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Send, Activity, CheckCircle2, XCircle } from "lucide-react";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const Index = () => {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiStatus, setApiStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { toast } = useToast();

  const handleSendMessage = async () => {
    if (!message.trim()) {
      toast({
        title: "Empty message",
        description: "Please enter a message to send",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setApiStatus('idle');

    try {
      // Add user message to history
      const userMessage: Message = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMessage]);

      // Call the bridge function
      const { data, error } = await supabase.functions.invoke('nomi-chatgpt-bridge', {
        body: {
          message: message,
          conversationHistory: messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        }
      });

      if (error) throw error;

      // Add assistant response to history
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.reply,
        timestamp: data.timestamp
      };
      setMessages(prev => [...prev, assistantMessage]);
      setApiStatus('success');

      toast({
        title: "Success",
        description: "Message sent to ChatGPT",
      });

      setMessage("");

    } catch (error: any) {
      console.error('Error:', error);
      setApiStatus('error');
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = () => {
    switch (apiStatus) {
      case 'success': return 'text-green-500';
      case 'error': return 'text-red-500';
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
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Nomi ↔ ChatGPT Bridge
          </h1>
          <p className="text-muted-foreground">Connect your Nomi character with ChatGPT</p>
        </div>

        {/* API Status */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className={getStatusColor()}>{getStatusIcon()}</span>
              API Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Bridge Endpoint</span>
              <code className="text-xs bg-secondary px-2 py-1 rounded">
                /functions/v1/nomi-chatgpt-bridge
              </code>
            </div>
          </CardContent>
        </Card>

        {/* Test Interface */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Test Interface</CardTitle>
            <CardDescription>
              Send messages to test the Nomi-ChatGPT connection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Enter a message from Nomi..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[100px] resize-none bg-secondary border-border"
              disabled={isLoading}
            />
            <Button 
              onClick={handleSendMessage}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send to ChatGPT
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Message History */}
        {messages.length > 0 && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Conversation History</CardTitle>
              <CardDescription>
                Messages exchanged between Nomi and ChatGPT
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-primary/10 border-l-4 border-primary'
                        : 'bg-accent/10 border-l-4 border-accent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        {msg.role === 'user' ? 'Nomi' : 'ChatGPT'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm">{msg.content}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* API Documentation */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>API Documentation</CardTitle>
            <CardDescription>
              How to integrate this bridge with your Nomi character
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Endpoint</h3>
              <code className="block text-xs bg-secondary p-3 rounded overflow-x-auto">
                POST https://jxefhavqmjdljdzvwbhx.supabase.co/functions/v1/nomi-chatgpt-bridge
              </code>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">Request Body</h3>
              <code className="block text-xs bg-secondary p-3 rounded overflow-x-auto whitespace-pre">
{`{
  "message": "Hello, what's the weather like?",
  "conversationHistory": [
    {
      "role": "user",
      "content": "Previous message"
    },
    {
      "role": "assistant", 
      "content": "Previous response"
    }
  ]
}`}
              </code>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">Response</h3>
              <code className="block text-xs bg-secondary p-3 rounded overflow-x-auto whitespace-pre">
{`{
  "reply": "ChatGPT's response",
  "timestamp": "2025-01-01T12:00:00.000Z",
  "model": "gpt-4o-mini"
}`}
              </code>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
