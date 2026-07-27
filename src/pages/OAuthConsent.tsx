import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";

// Beta auth.oauth namespace typing shim
type OAuthAuthDetails = {
  client?: { name?: string; redirect_uris?: string[] } | null;
  redirect_url?: string;
  redirect_to?: string;
  scopes?: string[];
  requested_scopes?: string[];
};
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthAuthDetails | null; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: any }>;
};
function getOAuthApi(): OAuthApi | null {
  const anyAuth = supabase.auth as unknown as { oauth?: OAuthApi };
  return anyAuth.oauth ?? null;
}

const OAuthConsent = () => {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthAuthDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?mode=login&next=" + encodeURIComponent(next);
        return;
      }
      const api = getOAuthApi();
      if (!api) {
        setError("OAuth is not available on this project.");
        return;
      }
      const { data, error } = await api.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message || "Could not load authorization request.");
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  const decide = async (approve: boolean) => {
    const api = getOAuthApi();
    if (!api) return;
    setBusy(true);
    const { data, error } = approve
      ? await api.approveAuthorization(authorizationId)
      : await api.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message || "Authorization failed.");
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect URL returned by the authorization server.");
      return;
    }
    window.location.href = target;
  };

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-secondary">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Authorization error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-secondary">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading authorization…
        </div>
      </main>
    );
  }

  const clientName = details.client?.name ?? "An external app";
  const scopes = details.scopes ?? details.requested_scopes ?? [];

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-secondary">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-royal" />
            Connect {clientName} to Doctylia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {clientName} will be able to call Doctylia's enabled tools while you are signed in. This does not bypass Doctylia's permissions or backend policies.
          </p>
          {scopes.length > 0 && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="font-medium mb-1">Requested access</div>
              <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                {scopes.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button className="flex-1 bg-royal hover:bg-royal/90" disabled={busy} onClick={() => decide(true)}>
              Approve
            </Button>
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
              Cancel connection
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};

export default OAuthConsent;
