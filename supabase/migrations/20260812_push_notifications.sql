-- Tabela de subscriptions push (já criada antes, recriando IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Tabela de notificações enviadas
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies push_subscriptions
CREATE POLICY "Users manage own push subs" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- Policies notifications
CREATE POLICY "Users read own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role inserts notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- Função para buscar subscriptions de um usuário
CREATE OR REPLACE FUNCTION get_user_push_subscriptions(target_user_id UUID)
RETURNS TABLE(endpoint TEXT, p256dh TEXT, auth TEXT)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT ps.endpoint, ps.p256dh, ps.auth
  FROM push_subscriptions ps
  WHERE ps.user_id = target_user_id;
$$;

-- Função para registrar uma subscription push
CREATE OR REPLACE FUNCTION register_push_subscription(
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth TEXT
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
AS $$
  INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth)
  ON CONFLICT (user_id, endpoint) DO UPDATE SET
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth;
$$;

-- Função para remover subscription (quando o usuário desativa notificações)
CREATE OR REPLACE FUNCTION remove_push_subscription(p_endpoint TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
AS $$
  DELETE FROM push_subscriptions
  WHERE user_id = auth.uid() AND endpoint = p_endpoint;
$$;

-- Habilitar extensão pg_cron (pode precisar de permissão do Supabase)
-- Se pg_cron não estiver disponível, usar agendamento via Edge Function
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Job 1: Lembrete 1 dia antes (roda todo dia às 18:00)
SELECT cron.schedule(
  'reminder-1-day-before',
  '0 18 * * *',
  $$
    INSERT INTO notifications (user_id, title, body)
    SELECT 
      b.user_id,
      'Lembrete de amanhã',
      'Você tem um horário amanhã às ' || to_char(b.start_time, 'HH21:MI') || ' com ' || p.full_name
    FROM bookings b
    JOIN profiles p ON p.user_id = b.barber_id
    WHERE b.start_time::date = (now() + interval '1 day')::date
      AND b.status IN ('pending', 'confirmed')
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = b.user_id
          AND n.title = 'Lembrete de amanhã'
          AND n.sent_at::date = now()::date
      );
  $$
);

-- Job 2: Lembrete 2 horas antes (roda a cada 15 minutos)
SELECT cron.schedule(
  'reminder-2-hours-before',
  '*/15 * * * *',
  $$
    INSERT INTO notifications (user_id, title, body)
    SELECT 
      b.user_id,
      'Seu horário é em 2 horas',
      'Você tem um horário às ' || to_char(b.start_time, 'HH21:MI') || ' com ' || p.full_name
    FROM bookings b
    JOIN profiles p ON p.user_id = b.barber_id
    WHERE b.start_time >= now() + interval '1 hour 50 minutes'
      AND b.start_time <= now() + interval '2 hours 10 minutes'
      AND b.status IN ('pending', 'confirmed')
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = b.user_id
          AND n.title = 'Seu horário é em 2 horas'
          AND n.sent_at > now() - interval '30 minutes'
      );
  $$
);
