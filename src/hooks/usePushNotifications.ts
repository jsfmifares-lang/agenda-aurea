import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

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

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if ("Notification" in window) {
      setPermission(Notification.permission);
      checkSubscription();
    }
  }, []);

  const checkSubscription = async () => {
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch {
      setIsSubscribed(false);
    }
  };

  const subscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) { alert("VAPID key missing"); return false; }
    if (!("serviceWorker" in navigator)) { alert("No serviceWorker"); return false; }
    if (!("Notification" in window)) { alert("No Notification API"); return false; }
    setLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") { alert(`Permission: ${result}`); setLoading(false); return false; }

      const reg = await navigator.serviceWorker.ready;
      alert(`SW ready, scope: ${reg.scope}`);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      alert(`Push subscribed: ${sub.endpoint.substring(0, 50)}`);

      const { endpoint } = sub;
      const p256dh = btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")!)));
      const auth = btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")!)));

      const { error } = await supabase.rpc("register_push_subscription", {
        p_endpoint: endpoint,
        p_p256dh: p256dh,
        p_auth: auth,
      });
      if (error) alert(`RPC error: ${error.message}`);

      setIsSubscribed(true);
      setLoading(false);
      return true;
    } catch (err: any) {
      console.error("Push subscribe error:", err);
      alert(`Push error: ${err.message}`);
      setLoading(false);
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return false;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.rpc("remove_push_subscription", { p_endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
      setLoading(false);
      return true;
    } catch (err) {
      console.error("Push unsubscribe error:", err);
      setLoading(false);
      return false;
    }
  }, []);

  return { permission, isSubscribed, loading, subscribe, unsubscribe };
}
