import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64urlEncode } from "https://deno.land/std@0.224.0/encoding/base64url.ts";

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VITE_VAPID_PUBLIC_KEY")!;
const VAPID_CLAIMS = { sub: "mailto:jsf.mifares@gmail.com" };

interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  user_id?: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem.replace(/-----BEGIN PRIVATE KEY-----/, "")
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
  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const encoder = new TextEncoder();
  const key = await importPrivateKey(VAPID_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(signingInput)
  );
  const sigB64 = base64urlEncode(new Uint8Array(signature));
  return `${signingInput}.${sigB64}`;
}

async function sendWebPush(subscription: PushSubscription, payload: string): Promise<boolean> {
  const token = await getSignedToken();
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Authorization: `vapid t=${token}, k=${VAPID_PUBLIC_KEY}`,
    },
    body: payload,
  });
  return response.ok || response.status === 201;
}

serve(async (req) => {
  try {
    const { title, body: msgBody, icon, url, user_id }: NotificationPayload = await req.json();

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
      return new Response(JSON.stringify({ sent: 0, error: error?.message || "No subscriptions" }), { status: 200 });
    }

    const payload = JSON.stringify({
      title,
      body: msgBody,
      icon: icon || "/icon-192.png",
      url: url || "/painel",
    });

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      const subscription: PushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      const ok = await sendWebPush(subscription, payload);
      if (ok) {
        sent++;
      } else {
        failed++;
        // Remove expired/invalid subscriptions
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }

    return new Response(JSON.stringify({ sent, failed, total: subscriptions.length }));
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
