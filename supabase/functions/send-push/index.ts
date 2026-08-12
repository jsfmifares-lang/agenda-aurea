import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VITE_VAPID_PUBLIC_KEY")!;
const VAPID_CLAIMS = { sub: "mailto:jsf.mifares@gmail.com" };

function toBase64Url(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textEncoder() {
  return new TextEncoder();
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function getSignedToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { ...VAPID_CLAIMS, exp: now + 43200 };
  const enc = textEncoder();
  const headerB64 = toBase64Url(enc.encode(JSON.stringify(header)));
  const payloadB64 = toBase64Url(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importPrivateKey(VAPID_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(signingInput)
  );
  const sigB64 = toBase64Url(new Uint8Array(signature));
  return `${signingInput}.${sigB64}`;
}

async function sendWebPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: string
): Promise<boolean> {
  const token = await getSignedToken();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Authorization: `vapid t=${token}, k=${VAPID_PUBLIC_KEY}`,
      },
      body: payload,
    });
    return response.ok || response.status === 201;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    const { title, body: msgBody, icon, url, user_id } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let query = supabase.from("push_subscriptions").select("*");
    if (user_id) {
      query = query.eq("user_id", user_id);
    }
    const { data: subscriptions, error } = await query;

    if (error || !subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, error: error?.message || "No subscriptions" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const pushPayload = JSON.stringify({
      title,
      body: msgBody,
      icon: icon || "/icon-192.png",
      url: url || "/painel",
    });

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      const ok = await sendWebPush(sub.endpoint, sub.p256dh, sub.auth, pushPayload);
      if (ok) {
        sent++;
      } else {
        failed++;
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }

    return new Response(
      JSON.stringify({ sent, failed, total: subscriptions.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
