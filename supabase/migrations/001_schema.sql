-- ============================================================
-- PetroCorp Station Management System
-- Migration 001: Complete Schema
-- ============================================================

-- 1. CUSTOM TYPES
-- ============================================================
CREATE TYPE user_role AS ENUM ('manager', 'operator');
CREATE TYPE shift_status AS ENUM ('draft', 'open', 'submitted', 'approved', 'rejected', 'locked');
CREATE TYPE credit_tx_type AS ENUM ('sale', 'repayment');
CREATE TYPE stock_entry_source AS ENUM ('calibration', 'manual');

-- 2. HELPER FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_manager()
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'manager');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Auto-update updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. CONFIGURATION TABLES
-- ============================================================

-- Profiles (extends auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'operator',
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Fuel Types
CREATE TABLE fuel_types (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,        -- 'MS', 'HSD', 'OIL'
    display_name TEXT NOT NULL,       -- 'Petrol (MS)', 'Diesel (HSD)'
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pumps (physical dispensing units)
CREATE TABLE pumps (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,        -- 'Pump 1', 'Pump 2'
    location TEXT,                     -- optional description
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nozzles (belong to pumps, dispense a specific fuel type)
CREATE TABLE nozzles (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,        -- 'MS 1', 'HSD 2'
    pump_id INTEGER NOT NULL REFERENCES pumps(id),
    fuel_type_id INTEGER NOT NULL REFERENCES fuel_types(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER nozzles_updated_at BEFORE UPDATE ON nozzles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Tanks
CREATE TABLE tanks (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,        -- 'Tank 1', 'Tank 2'
    fuel_type_id INTEGER NOT NULL REFERENCES fuel_types(id),
    capacity_litres DECIMAL(12, 2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tank Calibration (dip mm -> volume litres lookup)
CREATE TABLE tank_calibrations (
    id SERIAL PRIMARY KEY,
    tank_id INTEGER NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
    dip_mm DECIMAL(10, 2) NOT NULL,
    volume_litres DECIMAL(12, 2) NOT NULL,
    UNIQUE(tank_id, dip_mm)
);

-- Shift Types
CREATE TABLE shift_types (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,        -- '1st Shift', '2nd Shift', 'Night', 'Extra'
    start_time TIME,
    end_time TIME,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payment Methods
CREATE TABLE payment_methods (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,        -- 'Cash', 'Paytm QR', etc.
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expense Categories
CREATE TABLE expense_categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customers (Udhaari)
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    contact_info TEXT,
    vehicle_number TEXT,
    opening_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Station Settings (key-value config)
CREATE TABLE station_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. OPERATIONAL TABLES
-- ============================================================

-- Daily Fuel Rates
CREATE TABLE fuel_rates (
    id SERIAL PRIMARY KEY,
    effective_date DATE NOT NULL,
    fuel_type_id INTEGER NOT NULL REFERENCES fuel_types(id),
    rate DECIMAL(10, 2) NOT NULL,
    set_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(effective_date, fuel_type_id)
);

-- Shifts
CREATE TABLE shifts (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    shift_type_id INTEGER NOT NULL REFERENCES shift_types(id),
    operator_id UUID NOT NULL REFERENCES profiles(id),
    status shift_status NOT NULL DEFAULT 'draft',
    approved_by UUID REFERENCES profiles(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER shifts_updated_at BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Shift Rate Snapshot (locked when shift is opened)
CREATE TABLE shift_rate_snapshots (
    id SERIAL PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    fuel_type_id INTEGER NOT NULL REFERENCES fuel_types(id),
    rate DECIMAL(10, 2) NOT NULL,
    UNIQUE(shift_id, fuel_type_id)
);

-- Nozzle Readings per Shift
CREATE TABLE shift_nozzle_readings (
    id SERIAL PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    nozzle_id INTEGER NOT NULL REFERENCES nozzles(id),
    opening_reading DECIMAL(12, 2) NOT NULL,
    closing_reading DECIMAL(12, 2),
    testing_qty DECIMAL(10, 2) NOT NULL DEFAULT 0,
    -- Computed/validated fields (stored for integrity)
    gross_quantity DECIMAL(10, 2),
    net_quantity DECIMAL(10, 2),
    rate_applied DECIMAL(10, 2) NOT NULL,
    sales_amount DECIMAL(12, 2),
    meter_reset BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(shift_id, nozzle_id)
);
CREATE TRIGGER snr_updated_at BEFORE UPDATE ON shift_nozzle_readings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Payment Lines per Shift (dynamic: one row per payment method used)
CREATE TABLE shift_payments (
    id SERIAL PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id),
    amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    UNIQUE(shift_id, payment_method_id)
);

-- Expenses per Shift
CREATE TABLE shift_expenses (
    id SERIAL PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES expense_categories(id),
    amount DECIMAL(12, 2) NOT NULL,
    description TEXT,
    recorded_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Credit Transactions
CREATE TABLE credit_transactions (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    shift_id INTEGER REFERENCES shifts(id),          -- NULL for manager-recorded repayments
    nozzle_id INTEGER REFERENCES nozzles(id),        -- link to nozzle for sales
    type credit_tx_type NOT NULL,
    fuel_type_id INTEGER REFERENCES fuel_types(id),  -- for sales
    quantity DECIMAL(10, 2),                          -- for sales
    rate DECIMAL(10, 2),                              -- snapshot for sales
    amount DECIMAL(12, 2) NOT NULL,
    payment_method_id INTEGER REFERENCES payment_methods(id), -- for repayments
    vehicle_number TEXT,
    notes TEXT,
    recorded_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tank Dip Readings (daily physical measurement)
CREATE TABLE tank_dip_readings (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    tank_id INTEGER NOT NULL REFERENCES tanks(id),
    reading_type TEXT NOT NULL DEFAULT 'closing',     -- 'opening' or 'closing'
    fuel_dip_mm DECIMAL(10, 2),
    water_dip_mm DECIMAL(10, 2) DEFAULT 0,
    calculated_volume DECIMAL(12, 2) NOT NULL,
    entry_source stock_entry_source NOT NULL DEFAULT 'manual',
    recorded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(date, tank_id, reading_type)
);

-- Fuel Receipts / Deliveries
CREATE TABLE fuel_receipts (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    tank_id INTEGER NOT NULL REFERENCES tanks(id),
    fuel_type_id INTEGER NOT NULL REFERENCES fuel_types(id),
    quantity_litres DECIMAL(12, 2) NOT NULL,
    supplier TEXT,
    invoice_no TEXT,
    notes TEXT,
    recorded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bank Reconciliation
CREATE TABLE bank_reconciliations (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id),
    recorded_amount DECIMAL(12, 2) NOT NULL,       -- from shift payments
    bank_amount DECIMAL(12, 2),                     -- actual bank receipt
    difference DECIMAL(12, 2),
    reference_no TEXT,
    notes TEXT,
    reconciled_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER br_updated_at BEFORE UPDATE ON bank_reconciliations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Audit Log
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,                           -- 'INSERT', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', etc.
    old_values JSONB,
    new_values JSONB,
    performed_by UUID REFERENCES profiles(id),
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. INDEXES
-- ============================================================
CREATE INDEX idx_shifts_date ON shifts(date);
CREATE INDEX idx_shifts_operator ON shifts(operator_id);
CREATE INDEX idx_shifts_status ON shifts(status);
CREATE INDEX idx_snr_shift ON shift_nozzle_readings(shift_id);
CREATE INDEX idx_credit_tx_customer ON credit_transactions(customer_id);
CREATE INDEX idx_credit_tx_shift ON credit_transactions(shift_id);
CREATE INDEX idx_fuel_rates_date ON fuel_rates(effective_date);
CREATE INDEX idx_tank_dips_date ON tank_dip_readings(date);
CREATE INDEX idx_fuel_receipts_date ON fuel_receipts(date);
CREATE INDEX idx_audit_table ON audit_logs(table_name);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- 6. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE pumps ENABLE ROW LEVEL SECURITY;
ALTER TABLE nozzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tank_calibrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_rate_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_nozzle_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tank_dip_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "Users read own profile" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Managers read all profiles" ON profiles FOR SELECT USING (is_manager());
CREATE POLICY "Managers manage profiles" ON profiles FOR ALL USING (is_manager());

-- CONFIG TABLES: Everyone reads active, managers write
-- fuel_types
CREATE POLICY "Anyone reads fuel_types" ON fuel_types FOR SELECT USING (true);
CREATE POLICY "Managers manage fuel_types" ON fuel_types FOR ALL USING (is_manager());
-- pumps
CREATE POLICY "Anyone reads pumps" ON pumps FOR SELECT USING (true);
CREATE POLICY "Managers manage pumps" ON pumps FOR ALL USING (is_manager());
-- nozzles
CREATE POLICY "Anyone reads nozzles" ON nozzles FOR SELECT USING (true);
CREATE POLICY "Managers manage nozzles" ON nozzles FOR ALL USING (is_manager());
-- tanks
CREATE POLICY "Anyone reads tanks" ON tanks FOR SELECT USING (true);
CREATE POLICY "Managers manage tanks" ON tanks FOR ALL USING (is_manager());
-- tank_calibrations
CREATE POLICY "Anyone reads calibrations" ON tank_calibrations FOR SELECT USING (true);
CREATE POLICY "Managers manage calibrations" ON tank_calibrations FOR ALL USING (is_manager());
-- shift_types
CREATE POLICY "Anyone reads shift_types" ON shift_types FOR SELECT USING (true);
CREATE POLICY "Managers manage shift_types" ON shift_types FOR ALL USING (is_manager());
-- payment_methods
CREATE POLICY "Anyone reads payment_methods" ON payment_methods FOR SELECT USING (true);
CREATE POLICY "Managers manage payment_methods" ON payment_methods FOR ALL USING (is_manager());
-- expense_categories
CREATE POLICY "Anyone reads expense_categories" ON expense_categories FOR SELECT USING (true);
CREATE POLICY "Managers manage expense_categories" ON expense_categories FOR ALL USING (is_manager());
-- customers
CREATE POLICY "Anyone reads customers" ON customers FOR SELECT USING (true);
CREATE POLICY "Managers manage customers" ON customers FOR ALL USING (is_manager());
-- station_settings
CREATE POLICY "Anyone reads settings" ON station_settings FOR SELECT USING (true);
CREATE POLICY "Managers manage settings" ON station_settings FOR ALL USING (is_manager());

-- FUEL RATES
CREATE POLICY "Anyone reads fuel_rates" ON fuel_rates FOR SELECT USING (true);
CREATE POLICY "Managers manage fuel_rates" ON fuel_rates FOR ALL USING (is_manager());

-- SHIFTS
CREATE POLICY "Operators read own shifts" ON shifts FOR SELECT USING (operator_id = auth.uid());
CREATE POLICY "Managers read all shifts" ON shifts FOR SELECT USING (is_manager());
CREATE POLICY "Operators create own shifts" ON shifts FOR INSERT WITH CHECK (operator_id = auth.uid());
CREATE POLICY "Operators update own draft/open shifts" ON shifts FOR UPDATE
  USING (operator_id = auth.uid() AND status IN ('draft', 'open'));
CREATE POLICY "Managers manage all shifts" ON shifts FOR ALL USING (is_manager());

-- SHIFT RATE SNAPSHOTS
CREATE POLICY "Read own shift snapshots" ON shift_rate_snapshots FOR SELECT
  USING (EXISTS (SELECT 1 FROM shifts WHERE shifts.id = shift_rate_snapshots.shift_id AND (shifts.operator_id = auth.uid() OR is_manager())));
CREATE POLICY "Insert own shift snapshots" ON shift_rate_snapshots FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM shifts WHERE shifts.id = shift_rate_snapshots.shift_id AND shifts.operator_id = auth.uid()));
CREATE POLICY "Managers manage snapshots" ON shift_rate_snapshots FOR ALL USING (is_manager());

-- SHIFT NOZZLE READINGS
CREATE POLICY "Read own nozzle readings" ON shift_nozzle_readings FOR SELECT
  USING (EXISTS (SELECT 1 FROM shifts WHERE shifts.id = shift_nozzle_readings.shift_id AND (shifts.operator_id = auth.uid() OR is_manager())));
CREATE POLICY "Operators insert own readings" ON shift_nozzle_readings FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM shifts WHERE shifts.id = shift_nozzle_readings.shift_id AND shifts.operator_id = auth.uid() AND shifts.status IN ('draft', 'open')));
CREATE POLICY "Operators update own readings" ON shift_nozzle_readings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM shifts WHERE shifts.id = shift_nozzle_readings.shift_id AND shifts.operator_id = auth.uid() AND shifts.status IN ('draft', 'open')));
CREATE POLICY "Managers manage readings" ON shift_nozzle_readings FOR ALL USING (is_manager());

-- SHIFT PAYMENTS
CREATE POLICY "Read own payments" ON shift_payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM shifts WHERE shifts.id = shift_payments.shift_id AND (shifts.operator_id = auth.uid() OR is_manager())));
CREATE POLICY "Operators insert own payments" ON shift_payments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM shifts WHERE shifts.id = shift_payments.shift_id AND shifts.operator_id = auth.uid() AND shifts.status IN ('draft', 'open')));
CREATE POLICY "Operators update own payments" ON shift_payments FOR UPDATE
  USING (EXISTS (SELECT 1 FROM shifts WHERE shifts.id = shift_payments.shift_id AND shifts.operator_id = auth.uid() AND shifts.status IN ('draft', 'open')));
CREATE POLICY "Managers manage payments" ON shift_payments FOR ALL USING (is_manager());

-- SHIFT EXPENSES
CREATE POLICY "Read own expenses" ON shift_expenses FOR SELECT
  USING (EXISTS (SELECT 1 FROM shifts WHERE shifts.id = shift_expenses.shift_id AND (shifts.operator_id = auth.uid() OR is_manager())));
CREATE POLICY "Operators insert own expenses" ON shift_expenses FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM shifts WHERE shifts.id = shift_expenses.shift_id AND shifts.operator_id = auth.uid() AND shifts.status IN ('draft', 'open')));
CREATE POLICY "Managers manage expenses" ON shift_expenses FOR ALL USING (is_manager());

-- CREDIT TRANSACTIONS
CREATE POLICY "Read credits" ON credit_transactions FOR SELECT USING (true);
CREATE POLICY "Operators insert credits in own shifts" ON credit_transactions FOR INSERT
  WITH CHECK (
    recorded_by = auth.uid() AND (
      shift_id IS NULL OR EXISTS (SELECT 1 FROM shifts WHERE shifts.id = credit_transactions.shift_id AND shifts.operator_id = auth.uid())
    )
  );
CREATE POLICY "Managers manage credits" ON credit_transactions FOR ALL USING (is_manager());

-- TANK DIP READINGS
CREATE POLICY "Anyone reads dips" ON tank_dip_readings FOR SELECT USING (true);
CREATE POLICY "Managers manage dips" ON tank_dip_readings FOR ALL USING (is_manager());

-- FUEL RECEIPTS
CREATE POLICY "Anyone reads receipts" ON fuel_receipts FOR SELECT USING (true);
CREATE POLICY "Managers manage receipts" ON fuel_receipts FOR ALL USING (is_manager());

-- BANK RECONCILIATIONS
CREATE POLICY "Managers only on bank_recon" ON bank_reconciliations FOR ALL USING (is_manager());

-- AUDIT LOGS
CREATE POLICY "Managers read audit" ON audit_logs FOR SELECT USING (is_manager());
CREATE POLICY "System inserts audit" ON audit_logs FOR INSERT WITH CHECK (true);

-- 7. DATABASE VIEWS
-- ============================================================

-- Customer balances view
CREATE OR REPLACE VIEW customer_balances AS
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
FROM customers c
LEFT JOIN credit_transactions ct ON ct.customer_id = c.id
GROUP BY c.id;

-- Backwards-compatibility views
CREATE OR REPLACE VIEW employees AS SELECT * FROM profiles;
CREATE OR REPLACE VIEW shift_readings AS SELECT * FROM shift_nozzle_readings;
CREATE OR REPLACE VIEW shift_rates AS SELECT * FROM shift_rate_snapshots;
CREATE OR REPLACE VIEW tank_readings AS SELECT * FROM tank_dip_readings;
CREATE OR REPLACE VIEW fuel_deliveries AS SELECT * FROM fuel_receipts;

