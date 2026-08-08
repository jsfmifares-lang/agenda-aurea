import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type SessionState = {
  user: User | null;
  isBarber: boolean;
  profile: { full_name: string; phone: string } | null;
  loading: boolean;
  refresh: () => void;
};

export function useSession(): SessionState {
  const [user, setUser] = useState<User | null>(null);
  const [isBarber, setIsBarber] = useState(false);
  const [profile, setProfile] = useState<{ full_name: string; phone: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;

    const load = async (nextUser: User | null) => {
      if (!active) return;
      setUser(nextUser);
      if (!nextUser) {
        setIsBarber(false);
        setProfile(null);
        setLoading(false);
        return;
      }
      const [roles, prof] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", nextUser.id),
        supabase.from("profiles").select("full_name, phone").eq("id", nextUser.id).maybeSingle(),
      ]);
      if (!active) return;
      setIsBarber((roles.data ?? []).some((r) => r.role === "barber"));
      setProfile(prof.data ?? null);
      setLoading(false);
    };

    supabase.auth.getUser().then(({ data }) => load(data.user ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void load(session?.user ?? null);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [tick]);

  return { user, isBarber, profile, loading, refresh: () => setTick((t) => t + 1) };
}
