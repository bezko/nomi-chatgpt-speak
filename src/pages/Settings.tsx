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
  const [isFirstSetup, setIsFirstSetup] = useState(false);
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
      // Silently handle errors on first load
      console.error("Error loading API keys:", error);
    }

    if (data) {
      setNomiApiKey(data.nomi_api_key || "");
      setOpenaiApiKey(data.openai_api_key || "");
      // If both keys exist, not first setup
      setIsFirstSetup(!data.nomi_api_key || !data.openai_api_key);
    } else {
      // No data means first setup
      setIsFirstSetup(true);
    }
    
    setFetchingKeys(false);
  };

  const handleSaveKeys = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate both keys are present
    if (!nomiApiKey.trim() || !openaiApiKey.trim()) {
      toast({
        title: "Missing keys",
        description: "Both API keys are required",
        variant: "destructive",
      });
      return;
    }

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
        nomi_api_key: nomiApiKey,
        openai_api_key: openaiApiKey,
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
      setIsFirstSetup(false);
      // Navigate to home after successful first setup
      if (isFirstSetup) {
        navigate("/");
      }
    }
  };

  const handleBackClick = () => {
    if (isFirstSetup) {
      toast({
        title: "API keys required",
        description: "Please enter both API keys before continuing",
        variant: "destructive",
      });
      return;
    }
    navigate("/");
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
          <Button 
            variant="ghost" 
            onClick={handleBackClick}
            className="gap-2"
            disabled={isFirstSetup}
          >
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
              <CardTitle>API Keys {isFirstSetup && <span className="text-sm text-muted-foreground">(Required)</span>}</CardTitle>
            </div>
            <CardDescription>
              {isFirstSetup 
                ? "Please enter both API keys to start using the application. These keys are stored securely and only accessible to you."
                : "Configure your personal API keys. These keys are stored securely and only accessible to you."
              }
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

              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading || !nomiApiKey.trim() || !openaiApiKey.trim()}
              >
                {loading ? "Saving..." : isFirstSetup ? "Continue to App" : "Save API Keys"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
