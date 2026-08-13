import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VITE_VAPID_PUBLIC_KEY")!;
const VAPID_CLAIMS = { sub: "mailto:jsf.mifares@gmail.com" };

function toBase64Url(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUint8Array(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  b64 += "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
  const stdBase64 = pemBody.replace(/-/g, "+").replace(/_/g, "/");
  const padded = stdBase64 + "=".repeat((4 - (stdBase64.length % 4)) % 4);
  const binaryDer = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", binaryDer.buffer, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function getSignedToken(audience: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud: audience, ...VAPID_CLAIMS, exp: now + 43200 };
  const enc = new TextEncoder();
  const headerB64 = toBase64Url(enc.encode(JSON.stringify(header)));
  const payloadB64 = toBase64Url(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importPrivateKey(VAPID_PRIVATE_KEY);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput));
  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HKDF" }, false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(derived);
}

async function encryptPayload(
  payload: Uint8Array,
  userPublicKey: Uint8Array,
  userAuthSecret: Uint8Array
): Promise<Uint8Array> {
  // Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", localKeyPair.publicKey));

  // Derive shared secret via ECDH
  const serverPubKey = await crypto.subtle.importKey("raw", userPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: serverPubKey }, localKeyPair.privateKey, 256));

  // RFC 8291 Section 3.4: Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // RFC 8291 Section 3.5: Derive PRK
  // IKM = concat(0x01, auth_secret, dh_secret)
  const ikm = concat(new Uint8Array([1]), userAuthSecret, sharedSecret);
  // info = concat("WebPush: info", ua_public, as_public)
  const info = concat(new TextEncoder().encode("WebPush: info"), userPublicKey, localPubRaw);
  const prk = await hkdf(ikm, userAuthSecret, info, 32);

  // RFC 8291 Section 3.6: Derive content encryption key and nonce
  const contentKey = await hkdf(prk, salt, concat(new TextEncoder().encode("Content-Encoding: aes128gcm"), new Uint8Array([0]), salt), 16);
  const nonce = await hkdf(prk, salt, concat(new TextEncoder().encode("Content-Encoding: nonce"), new Uint8Array([0]), salt), 12);

  // RFC 8291 Section 3.7: Encrypt payload
  const aesKey = await crypto.subtle.importKey("raw", contentKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, payload));

  // RFC 8188 aes128gcm header + RFC 8291 web push
  // header = delimiter(1) + rs(2) + keyidlen(1) + keyid(65)
  // payload = header + salt(16) + ciphertext
  const header = concat(
    new Uint8Array([0x00, 0x01, 0x00]),  // delimiter + rs=4096 (big-endian)
    new Uint8Array([0x41]),               // keyid length = 65
    localPubRaw                           // local public key (65 bytes)
  );

  return concat(header, salt, ciphertext);
}

Deno.serve(async (req) => {
  try {
    const { title, body: msgBody, icon, url, user_id } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let query = supabase.from("push_subscriptions").select("*");
    if (user_id) query = query.eq("user_id", user_id);
    const { data: subscriptions, error } = await query;

    if (error || !subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, error: error?.message || "No subscriptions" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({ title, body: msgBody, icon: icon || "/icon-192.png", url: url || "/painel" });

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        const userPublicKey = base64UrlToUint8Array(sub.p256dh);
        const userAuthSecret = base64UrlToUint8Array(sub.auth);
        const encryptedPayload = await encryptPayload(new TextEncoder().encode(payload), userPublicKey, userAuthSecret);

        const audience = new URL(sub.endpoint).origin;
        const token = await getSignedToken(audience);

        const response = await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            TTL: "86400",
            Authorization: `vapid t=${token}, k=${VAPID_PUBLIC_KEY}`,
          },
          body: encryptedPayload,
        });

        if (response.ok || response.status === 201) {
          sent++;
        } else {
          failed++;
          const errBody = await response.text().catch(() => "");
          console.log(`Push failed ${response.status}: ${errBody}`);
          if (response.status === 404 || response.status === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          }
        }
      } catch (err) {
        failed++;
        console.log(`Push error: ${err}`);
      }
    }

    return new Response(JSON.stringify({ sent, failed, total: subscriptions.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
