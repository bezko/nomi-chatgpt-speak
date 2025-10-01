import { useState } from "react";
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

const Index = () => {
  const [nomiMessage, setNomiMessage] = useState('/ask chatgpt "What is the capital of France?"');
  const [nomiUuid, setNomiUuid] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [apiStatus, setApiStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { toast } = useToast();

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
    if (!nomiUuid.trim()) {
      toast({
        title: "Missing UUID",
        description: "Please enter your Nomi UUID",
        variant: "destructive",
      });
      return;
    }

    setIsPolling(true);
    setApiStatus('idle');

    try {
      const { data, error } = await supabase.functions.invoke('poll-nomi-messages', {
        body: { nomiUuid }
      });

      if (error) throw error;

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
          description: `Successfully processed ${data.processedCount} message(s)`,
        });
      } else {
        toast({
          title: "No New Messages",
          description: "No messages matching /ask chatgpt format found",
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

            <div className="grid grid-cols-2 gap-3">
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
              
              <Button 
                onClick={handlePollMessages}
                disabled={isPolling || isLoading}
                variant="secondary"
              >
                {isPolling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Polling...
                  </>
                ) : (
                  <>
                    <Activity className="mr-2 h-4 w-4" />
                    Poll Messages
                  </>
                )}
              </Button>
            </div>
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
                <strong>Polling Feature:</strong> Use the "Poll Messages" button to check for new Nomi messages automatically.
              </p>
              <ul className="text-sm space-y-1 mt-2 ml-4 list-disc">
                <li>The poller fetches recent messages from your Nomi</li>
                <li>Processes any messages matching the /ask chatgpt format</li>
                <li>Automatically sends AI responses back to Nomi</li>
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
