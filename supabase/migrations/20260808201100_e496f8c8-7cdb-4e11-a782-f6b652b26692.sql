CREATE TYPE public.app_role AS ENUM ('barber', 'client');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "profiles_select_own_or_barber" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'barber'));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "user_roles_select_own_or_barber" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'barber'));

CREATE TABLE public.salon_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  salon_name text NOT NULL DEFAULT 'Meu Salão',
  whatsapp text NOT NULL DEFAULT '',
  slot_minutes integer NOT NULL DEFAULT 30 CHECK (slot_minutes BETWEEN 5 AND 240),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.salon_settings TO authenticated;
GRANT ALL ON public.salon_settings TO service_role;
ALTER TABLE public.salon_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_read" ON public.salon_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_write" ON public.salon_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'barber')) WITH CHECK (public.has_role(auth.uid(), 'barber'));
INSERT INTO public.salon_settings (id) VALUES (true);

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  price numeric(10,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services_read" ON public.services FOR SELECT TO authenticated USING (true);
CREATE POLICY "services_write" ON public.services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'barber')) WITH CHECK (public.has_role(auth.uid(), 'barber'));
INSERT INTO public.services (name, duration_minutes, price) VALUES
  ('Corte masculino', 30, 45.00),
  ('Corte feminino', 60, 90.00),
  ('Barba', 20, 30.00);

CREATE TABLE public.availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability TO authenticated;
GRANT ALL ON public.availability TO service_role;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "availability_read" ON public.availability FOR SELECT TO authenticated USING (true);
CREATE POLICY "availability_write" ON public.availability FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'barber')) WITH CHECK (public.has_role(auth.uid(), 'barber'));
INSERT INTO public.availability (weekday, start_time, end_time) VALUES
  (1, '09:00', '18:00'), (2, '09:00', '18:00'), (3, '09:00', '18:00'),
  (4, '09:00', '18:00'), (5, '09:00', '18:00'), (6, '09:00', '14:00');

CREATE TABLE public.blocked_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_dates TO authenticated;
GRANT ALL ON public.blocked_dates TO service_role;
ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocked_read" ON public.blocked_dates FOR SELECT TO authenticated USING (true);
CREATE POLICY "blocked_write" ON public.blocked_dates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'barber')) WITH CHECK (public.has_role(auth.uid(), 'barber'));

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  date date NOT NULL,
  start_time time NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','done')),
  client_name text NOT NULL DEFAULT '',
  client_phone text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX appointments_unique_slot ON public.appointments (date, start_time) WHERE status <> 'cancelled';
CREATE INDEX appointments_client_idx ON public.appointments (client_id, date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appointments_select" ON public.appointments FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR public.has_role(auth.uid(), 'barber'));
CREATE POLICY "appointments_insert_own" ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid() OR public.has_role(auth.uid(), 'barber'));
CREATE POLICY "appointments_update" ON public.appointments FOR UPDATE TO authenticated
  USING (client_id = auth.uid() OR public.has_role(auth.uid(), 'barber'))
  WITH CHECK (client_id = auth.uid() OR public.has_role(auth.uid(), 'barber'));
CREATE POLICY "appointments_delete_barber" ON public.appointments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'barber'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'phone', ''))
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'barber') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'barber') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client') ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();