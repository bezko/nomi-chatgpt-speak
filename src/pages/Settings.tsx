import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Key, LogOut } from "lucide-react";

export default function Settings() {
  const [nomiApiKey, setNomiApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingKeys, setFetchingKeys] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    setFetchingKeys(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data, error } = await supabase
      .from("user_api_keys")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      toast({
        title: "Error",
        description: "Failed to load API keys",
        variant: "destructive",
      });
    }

    if (data) {
      setNomiApiKey(data.nomi_api_key || "");
      setOpenaiApiKey(data.openai_api_key || "");
    }
    
    setFetchingKeys(false);
  };

  const handleSaveKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate("/auth");
      return;
    }

    const { error } = await supabase
      .from("user_api_keys")
      .upsert({
        user_id: user.id,
        nomi_api_key: nomiApiKey || null,
        openai_api_key: openaiApiKey || null,
      });

    setLoading(false);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "API keys saved successfully",
      });
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (fetchingKeys) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button variant="outline" onClick={handleSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              <CardTitle>API Keys</CardTitle>
            </div>
            <CardDescription>
              Configure your personal API keys to use the application. These keys are stored securely and only accessible to you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveKeys} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nomi-key">Nomi API Key</Label>
                <Input
                  id="nomi-key"
                  type="password"
                  placeholder="Enter your Nomi API key"
                  value={nomiApiKey}
                  onChange={(e) => setNomiApiKey(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Get your Nomi API key from the Nomi dashboard
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="openai-key">OpenAI API Key</Label>
                <Input
                  id="openai-key"
                  type="password"
                  placeholder="Enter your OpenAI API key"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Get your OpenAI API key from the OpenAI platform
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Saving..." : "Save API Keys"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
