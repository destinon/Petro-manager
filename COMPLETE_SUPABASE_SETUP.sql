-- ============================================================
-- PetroCorp Petrol Station Management System
-- COMPLETE SUPABASE SETUP SCRIPT (100% IDEMPOTENT & ROBUST)
-- ============================================================
-- INSTRUCTIONS:
-- 1. Open your Supabase Project: https://supabase.com/dashboard
-- 2. Go to the "SQL Editor" in the left sidebar
-- 3. Click "New query"
-- 4. Copy and paste this ENTIRE file into the editor
-- 5. Click "Run" (or Ctrl + Enter)
-- 6. All tables, views, RLS policies, seed data, and RPC functions
--    will be generated, and PostgREST schema cache will be reloaded!
-- ============================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CUSTOM TYPES (Idempotent)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('manager', 'operator');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE shift_status AS ENUM ('draft', 'open', 'submitted', 'approved', 'rejected', 'locked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE credit_tx_type AS ENUM ('sale', 'repayment');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE stock_entry_source AS ENUM ('calibration', 'manual');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. HELPER FUNCTIONS & RPCs
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND (role::text = 'manager' OR role::text = 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 4. CONFIGURATION & MASTER TABLES

-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT 'User',
    role user_role NOT NULL DEFAULT 'operator',
    email TEXT,
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT 'User';

-- 4b. Employees Table
-- Safely drop old view if employees relation was created as a view in earlier migrations
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'employees') THEN
        DROP VIEW public.employees CASCADE;
    END IF;
END $$;

-- Create real employees table
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL DEFAULT 'User',
    role TEXT NOT NULL DEFAULT 'operator',
    email TEXT,
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure employee columns exist if table already existed
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'employees') THEN
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT 'User';
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'operator';
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS email TEXT;
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
    END IF;
END $$;

-- Fuel Types
CREATE TABLE IF NOT EXISTS public.fuel_types (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE IF EXISTS public.fuel_types ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE IF EXISTS public.fuel_types ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.fuel_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Pumps (Dispensers)
CREATE TABLE IF NOT EXISTS public.pumps (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nozzles
CREATE TABLE IF NOT EXISTS public.nozzles (
    id SERIAL PRIMARY KEY,
    name TEXT,
    pump_id INTEGER REFERENCES public.pumps(id) ON DELETE SET NULL,
    fuel_type_id INTEGER REFERENCES public.fuel_types(id) ON DELETE SET NULL,
    fuel_type TEXT,
    master_reading DECIMAL(14, 2) NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE IF EXISTS public.nozzles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE IF EXISTS public.nozzles ADD COLUMN IF NOT EXISTS pump_id INTEGER REFERENCES public.pumps(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.nozzles ADD COLUMN IF NOT EXISTS fuel_type_id INTEGER REFERENCES public.fuel_types(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.nozzles ADD COLUMN IF NOT EXISTS fuel_type TEXT;
ALTER TABLE IF EXISTS public.nozzles ADD COLUMN IF NOT EXISTS master_reading DECIMAL(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.nozzles ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.nozzles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Underground Storage Tanks
CREATE TABLE IF NOT EXISTS public.tanks (
    id SERIAL PRIMARY KEY,
    name TEXT,
    fuel_type_id INTEGER REFERENCES public.fuel_types(id) ON DELETE SET NULL,
    fuel_type TEXT,
    capacity DECIMAL(12, 2) DEFAULT 20000,
    capacity_litres DECIMAL(12, 2) NOT NULL DEFAULT 20000,
    current_dip_mm DECIMAL(10, 2) DEFAULT 0,
    current_stock_litres DECIMAL(12, 2) DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE IF EXISTS public.tanks ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE IF EXISTS public.tanks ADD COLUMN IF NOT EXISTS fuel_type_id INTEGER REFERENCES public.fuel_types(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.tanks ADD COLUMN IF NOT EXISTS fuel_type TEXT;
ALTER TABLE IF EXISTS public.tanks ADD COLUMN IF NOT EXISTS capacity DECIMAL(12, 2) DEFAULT 20000;
ALTER TABLE IF EXISTS public.tanks ADD COLUMN IF NOT EXISTS capacity_litres DECIMAL(12, 2) NOT NULL DEFAULT 20000;
ALTER TABLE IF EXISTS public.tanks ADD COLUMN IF NOT EXISTS current_dip_mm DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE IF EXISTS public.tanks ADD COLUMN IF NOT EXISTS current_stock_litres DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE IF EXISTS public.tanks ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Payment Methods
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- Shift Types
CREATE TABLE IF NOT EXISTS public.shift_types (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    start_time TIME,
    end_time TIME,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expense Categories
CREATE TABLE IF NOT EXISTS public.expense_categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- Credit Customers (Udhaari Ledger)
CREATE TABLE IF NOT EXISTS public.customers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    vehicle_number TEXT,
    contact_info TEXT,
    opening_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Station Settings
CREATE TABLE IF NOT EXISTS public.station_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. OPERATIONAL TABLES

-- Operator Nozzle Allocations
CREATE TABLE IF NOT EXISTS public.operator_nozzle_assignments (
    id SERIAL PRIMARY KEY,
    operator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nozzle_id INTEGER NOT NULL REFERENCES public.nozzles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(operator_id, nozzle_id)
);

-- Daily Fuel Rates
CREATE TABLE IF NOT EXISTS public.daily_rates (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    fuel_type_id INTEGER REFERENCES public.fuel_types(id),
    rate DECIMAL(10, 2),
    ms_rate DECIMAL(10, 2),
    hsd_rate DECIMAL(10, 2),
    set_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE IF EXISTS public.daily_rates ADD COLUMN IF NOT EXISTS fuel_type_id INTEGER REFERENCES public.fuel_types(id);
ALTER TABLE IF EXISTS public.daily_rates ADD COLUMN IF NOT EXISTS rate DECIMAL(10, 2);
ALTER TABLE IF EXISTS public.daily_rates ADD COLUMN IF NOT EXISTS ms_rate DECIMAL(10, 2);
ALTER TABLE IF EXISTS public.daily_rates ADD COLUMN IF NOT EXISTS hsd_rate DECIMAL(10, 2);
ALTER TABLE IF EXISTS public.daily_rates ADD COLUMN IF NOT EXISTS set_by UUID REFERENCES auth.users(id);
ALTER TABLE IF EXISTS public.daily_rates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Shifts
CREATE TABLE IF NOT EXISTS public.shifts (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    shift_type_id INTEGER REFERENCES public.shift_types(id),
    shift_type TEXT,
    operator_id UUID NOT NULL REFERENCES auth.users(id),
    status shift_status NOT NULL DEFAULT 'open',
    total_sales_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
    total_deductions DECIMAL(14, 2) NOT NULL DEFAULT 0,
    short_extra_cash DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ms_rate DECIMAL(10, 2),
    hsd_rate DECIMAL(10, 2),
    is_closed BOOLEAN NOT NULL DEFAULT false,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE IF EXISTS public.shifts ADD COLUMN IF NOT EXISTS shift_type_id INTEGER REFERENCES public.shift_types(id);
ALTER TABLE IF EXISTS public.shifts ADD COLUMN IF NOT EXISTS shift_type TEXT;
ALTER TABLE IF EXISTS public.shifts ADD COLUMN IF NOT EXISTS total_sales_amount DECIMAL(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.shifts ADD COLUMN IF NOT EXISTS total_deductions DECIMAL(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.shifts ADD COLUMN IF NOT EXISTS short_extra_cash DECIMAL(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.shifts ADD COLUMN IF NOT EXISTS ms_rate DECIMAL(10, 2);
ALTER TABLE IF EXISTS public.shifts ADD COLUMN IF NOT EXISTS hsd_rate DECIMAL(10, 2);
ALTER TABLE IF EXISTS public.shifts ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.shifts ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
ALTER TABLE IF EXISTS public.shifts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.shifts ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE IF EXISTS public.shifts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE IF EXISTS public.shifts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Shift Rate Snapshots
CREATE TABLE IF NOT EXISTS public.shift_rate_snapshots (
    id SERIAL PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
    fuel_type_id INTEGER NOT NULL REFERENCES public.fuel_types(id),
    rate DECIMAL(10, 2) NOT NULL,
    UNIQUE(shift_id, fuel_type_id)
);

-- Shift Nozzle Readings
CREATE TABLE IF NOT EXISTS public.shift_nozzle_readings (
    id SERIAL PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
    nozzle_id INTEGER NOT NULL REFERENCES public.nozzles(id) ON DELETE CASCADE,
    opening_reading DECIMAL(14, 2) NOT NULL,
    closing_reading DECIMAL(14, 2) NOT NULL,
    testing_qty DECIMAL(10, 2) NOT NULL DEFAULT 0,
    net_sale_qty DECIMAL(12, 2) GENERATED ALWAYS AS (closing_reading - opening_reading - testing_qty) STORED,
    rate DECIMAL(10, 2),
    sales_amount DECIMAL(14, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(shift_id, nozzle_id)
);

-- Shift Payment Breakdown
CREATE TABLE IF NOT EXISTS public.shift_payments (
    id SERIAL PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
    payment_method_id INTEGER NOT NULL REFERENCES public.payment_methods(id),
    amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    UNIQUE(shift_id, payment_method_id)
);

-- Shift Operational Expenses
CREATE TABLE IF NOT EXISTS public.shift_expenses (
    id SERIAL PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES public.expense_categories(id),
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Credit Transactions (Sales & Repayments)
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    shift_id INTEGER REFERENCES public.shifts(id) ON DELETE SET NULL,
    type credit_tx_type NOT NULL,
    fuel_type_id INTEGER REFERENCES public.fuel_types(id),
    quantity DECIMAL(10, 2),
    rate DECIMAL(10, 2),
    amount DECIMAL(12, 2) NOT NULL,
    vehicle_number TEXT,
    payment_method_id INTEGER REFERENCES public.payment_methods(id),
    recorded_by UUID REFERENCES auth.users(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Physical Tank Dipstick Readings
CREATE TABLE IF NOT EXISTS public.tank_dip_readings (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    tank_id INTEGER NOT NULL REFERENCES public.tanks(id) ON DELETE CASCADE,
    dip_reading_mm DECIMAL(10, 2),
    water_dip_mm DECIMAL(10, 2) DEFAULT 0,
    calculated_litres DECIMAL(12, 2) NOT NULL,
    source stock_entry_source NOT NULL DEFAULT 'manual',
    recorded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(date, tank_id)
);

-- Fuel Delivery Receipts
CREATE TABLE IF NOT EXISTS public.fuel_receipts (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    tank_id INTEGER NOT NULL REFERENCES public.tanks(id) ON DELETE CASCADE,
    quantity_litres DECIMAL(12, 2) NOT NULL,
    invoice_number TEXT,
    recorded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. VIEWS & COMPATIBILITY SYNONYMS

CREATE OR REPLACE VIEW public.customer_balances AS
SELECT
    c.id,
    c.name,
    c.vehicle_number,
    c.contact_info,
    c.is_active,
    c.opening_balance,
    COALESCE(SUM(CASE WHEN ct.type = 'sale' THEN ct.amount ELSE 0 END), 0) AS total_credit_sales,
    COALESCE(SUM(CASE WHEN ct.type = 'repayment' THEN ct.amount ELSE 0 END), 0) AS total_repayments,
    c.opening_balance
      + COALESCE(SUM(CASE WHEN ct.type = 'sale' THEN ct.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN ct.type = 'repayment' THEN ct.amount ELSE 0 END), 0)
      AS outstanding_balance
FROM public.customers c
LEFT JOIN public.credit_transactions ct ON ct.customer_id = c.id
GROUP BY c.id;

-- Safely convert old empty tables to views for backwards-compatibility
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'shift_readings') THEN
        DROP TABLE public.shift_readings CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'shift_rates') THEN
        DROP TABLE public.shift_rates CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tank_readings') THEN
        DROP TABLE public.tank_readings CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'fuel_deliveries') THEN
        DROP TABLE public.fuel_deliveries CASCADE;
    END IF;
END $$;

CREATE OR REPLACE VIEW public.shift_readings AS SELECT * FROM public.shift_nozzle_readings;
CREATE OR REPLACE VIEW public.shift_rates AS SELECT * FROM public.shift_rate_snapshots;
CREATE OR REPLACE VIEW public.tank_readings AS SELECT * FROM public.tank_dip_readings;
CREATE OR REPLACE VIEW public.fuel_deliveries AS SELECT * FROM public.fuel_receipts;

-- 7. INITIAL MASTER & SEED DATA

INSERT INTO public.fuel_types (id, name, display_name, sort_order) VALUES
(1, 'MS', 'Petrol (MS)', 1),
(2, 'HSD', 'Diesel (HSD)', 2)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, 
    display_name = COALESCE(EXCLUDED.display_name, fuel_types.display_name);

INSERT INTO public.payment_methods (id, name, sort_order) VALUES
(1, 'Cash', 1),
(2, 'Credit Card (POS)', 2),
(3, 'Paytm QR', 3),
(4, 'BharatPe QR', 4),
(5, 'PhonePe QR', 5),
(6, 'HPCL / IndianOil Fuel Card', 6),
(7, 'Cheque / Bank Transfer', 7)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.shift_types (id, name, start_time, end_time, sort_order) VALUES
(1, '1st Shift', '06:00:00', '14:00:00', 1),
(2, '2nd Shift', '14:00:00', '22:00:00', 2),
(3, 'Night Shift', '22:00:00', '06:00:00', 3),
(4, 'Extra Shift', '00:00:00', '23:59:59', 4)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.expense_categories (id, name) VALUES
(1, 'Generator Diesel'),
(2, 'Station Electricity & Utilities'),
(3, 'Staff Refreshments / Food'),
(4, 'Station Maintenance & Cleaning'),
(5, 'Printing & Stationery'),
(6, 'Miscellaneous')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.pumps (id, name, description) VALUES
(1, 'Pump 1', 'Main Forecourt Dispenser 1'),
(2, 'Pump 2', 'Main Forecourt Dispenser 2'),
(3, 'Pump 3', 'Heavy Vehicle Dispenser 3'),
(4, 'Pump 4', 'Heavy Vehicle Dispenser 4')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.tanks (id, name, fuel_type_id, capacity_litres, current_stock_litres) VALUES
(1, 'Tank 1 (Petrol MS)', 1, 20000, 14500),
(2, 'Tank 2 (Diesel HSD)', 2, 25000, 18200)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.nozzles (id, name, pump_id, fuel_type_id, master_reading, sort_order) VALUES
(1, 'MS 1', 1, 1, 54120.50, 1),
(2, 'HSD 2', 1, 2, 78910.20, 2),
(3, 'MS 3', 2, 1, 31200.00, 3),
(4, 'HSD 4', 2, 2, 92450.80, 4),
(5, 'MS 5', 3, 1, 14320.10, 5),
(6, 'HSD 6', 3, 2, 65110.40, 6),
(7, 'MS 7', 4, 1, 42100.00, 7),
(8, 'HSD 8', 4, 2, 53900.50, 8)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.station_settings (key, value) VALUES
('station_name', 'MAYUR AUTOMOBILE'),
('station_code', '48198TA198'),
('stock_variation_warning_litres', '50'),
('cash_shortage_warning_rupees', '100')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Populate employees from existing profiles
INSERT INTO public.employees (id, full_name, role, email, phone, is_active, created_at)
SELECT id, full_name, role::text, email, phone, is_active, created_at
FROM public.profiles
ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    is_active = EXCLUDED.is_active;

-- 8. AUTO USER PROFILE SYNC TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'operator'::user_role)
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. PERMISSIONS & RLS POLICIES
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pumps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nozzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_nozzle_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_rate_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_nozzle_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tank_dip_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_receipts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'employees') THEN
        ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Public access employees" ON public.employees;
        CREATE POLICY "Public access employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

DROP POLICY IF EXISTS "Public access profiles" ON public.profiles;
CREATE POLICY "Public access profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access fuel_types" ON public.fuel_types;
CREATE POLICY "Public access fuel_types" ON public.fuel_types FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access pumps" ON public.pumps;
CREATE POLICY "Public access pumps" ON public.pumps FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access nozzles" ON public.nozzles;
CREATE POLICY "Public access nozzles" ON public.nozzles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access tanks" ON public.tanks;
CREATE POLICY "Public access tanks" ON public.tanks FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access payment_methods" ON public.payment_methods;
CREATE POLICY "Public access payment_methods" ON public.payment_methods FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access shift_types" ON public.shift_types;
CREATE POLICY "Public access shift_types" ON public.shift_types FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access expense_categories" ON public.expense_categories;
CREATE POLICY "Public access expense_categories" ON public.expense_categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access customers" ON public.customers;
CREATE POLICY "Public access customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access station_settings" ON public.station_settings;
CREATE POLICY "Public access station_settings" ON public.station_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access operator_nozzle_assignments" ON public.operator_nozzle_assignments;
CREATE POLICY "Public access operator_nozzle_assignments" ON public.operator_nozzle_assignments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access daily_rates" ON public.daily_rates;
CREATE POLICY "Public access daily_rates" ON public.daily_rates FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access shifts" ON public.shifts;
CREATE POLICY "Public access shifts" ON public.shifts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access shift_rate_snapshots" ON public.shift_rate_snapshots;
CREATE POLICY "Public access shift_rate_snapshots" ON public.shift_rate_snapshots FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access shift_nozzle_readings" ON public.shift_nozzle_readings;
CREATE POLICY "Public access shift_nozzle_readings" ON public.shift_nozzle_readings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access shift_payments" ON public.shift_payments;
CREATE POLICY "Public access shift_payments" ON public.shift_payments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access shift_expenses" ON public.shift_expenses;
CREATE POLICY "Public access shift_expenses" ON public.shift_expenses FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access credit_transactions" ON public.credit_transactions;
CREATE POLICY "Public access credit_transactions" ON public.credit_transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access tank_dip_readings" ON public.tank_dip_readings;
CREATE POLICY "Public access tank_dip_readings" ON public.tank_dip_readings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access fuel_receipts" ON public.fuel_receipts;
CREATE POLICY "Public access fuel_receipts" ON public.fuel_receipts FOR ALL USING (true) WITH CHECK (true);

-- 10. REFRESH POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
