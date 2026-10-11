-- ============================================================
-- PetroCorp - Migration 002: Seed Data
-- Initial configuration from Excel workbooks
-- ============================================================

-- Fuel Types
INSERT INTO fuel_types (name, display_name, sort_order) VALUES
  ('MS', 'Petrol (MS)', 1),
  ('HSD', 'Diesel (HSD)', 2);

-- Shift Types (from SHIFT.xlsx sheets)
INSERT INTO shift_types (name, start_time, end_time, sort_order) VALUES
  ('1st Shift', '06:00', '14:00', 1),
  ('2nd Shift', '14:00', '22:00', 2),
  ('Night Shift', '22:00', '06:00', 3),
  ('Extra Shift', NULL, NULL, 4);

-- Payment Methods (from SHIFT.xlsx reconciliation section)
INSERT INTO payment_methods (name, sort_order) VALUES
  ('Cash', 1),
  ('Paytm Card', 2),
  ('Paytm QR', 3),
  ('PhonePe Card', 4),
  ('PhonePe QR', 5),
  ('MobiKwik QR', 6),
  ('Cheque', 7);

-- Expense Categories
INSERT INTO expense_categories (name) VALUES
  ('Refreshments'),
  ('Maintenance'),
  ('Supplies'),
  ('Transport'),
  ('Miscellaneous');

-- Pumps (10 nozzles grouped into pumps based on DSSR analysis)
-- DSSR MS sheet: Pump 1, 3, 5, 7, 9, 10 (MS)
-- DSSR HSD sheet: Pump 2, 4, 6, 8 (HSD)
-- SHIFT workbook labels: MS 1, HSD 2, MS 3, HSD 4, MS 5, HSD 6, MS 7, HSD 8, MS 9, HSD 10
-- Discrepancy: DSSR has Pump 10 as MS, SHIFT has HSD 10
-- We follow the SHIFT workbook labeling as baseline (configurable later)
INSERT INTO pumps (name) VALUES
  ('Pump 1'), ('Pump 2'), ('Pump 3'), ('Pump 4'), ('Pump 5'),
  ('Pump 6'), ('Pump 7'), ('Pump 8'), ('Pump 9'), ('Pump 10');

-- Nozzles (one nozzle per pump for this station's configuration)
INSERT INTO nozzles (name, pump_id, fuel_type_id, sort_order) VALUES
  ('MS 1',  1, (SELECT id FROM fuel_types WHERE name='MS'), 1),
  ('HSD 2', 2, (SELECT id FROM fuel_types WHERE name='HSD'), 2),
  ('MS 3',  3, (SELECT id FROM fuel_types WHERE name='MS'), 3),
  ('HSD 4', 4, (SELECT id FROM fuel_types WHERE name='HSD'), 4),
  ('MS 5',  5, (SELECT id FROM fuel_types WHERE name='MS'), 5),
  ('HSD 6', 6, (SELECT id FROM fuel_types WHERE name='HSD'), 6),
  ('MS 7',  7, (SELECT id FROM fuel_types WHERE name='MS'), 7),
  ('HSD 8', 8, (SELECT id FROM fuel_types WHERE name='HSD'), 8),
  ('MS 9',  9, (SELECT id FROM fuel_types WHERE name='MS'), 9),
  ('HSD 10', 10, (SELECT id FROM fuel_types WHERE name='HSD'), 10);

-- Tanks (from DSSR: 2 tanks for MS, 2 tanks for HSD)
INSERT INTO tanks (name, fuel_type_id, capacity_litres) VALUES
  ('MS Tank 1', (SELECT id FROM fuel_types WHERE name='MS'), 20000),
  ('MS Tank 2', (SELECT id FROM fuel_types WHERE name='MS'), 20000),
  ('HSD Tank 1', (SELECT id FROM fuel_types WHERE name='HSD'), 20000),
  ('HSD Tank 2', (SELECT id FROM fuel_types WHERE name='HSD'), 20000);

-- Customers (from SHIFT.xlsx udhaari section)
INSERT INTO customers (name) VALUES
  ('MBC'), ('BUT'), ('KONARK HOME'), ('SHAINESHWAR'), ('PAMMA'),
  ('MARUTI'), ('BRC'), ('BITTU SETH'), ('KOHINOOR'), ('AMIT SAND'),
  ('RINKU'), ('JAY AMBE'), ('J P LINES');

-- Station Settings
INSERT INTO station_settings (key, value) VALUES
  ('station_name', 'MAYUR AUTOMOBILE'),
  ('station_code', '48198TA198'),
  ('stock_variation_warning_litres', '50'),
  ('cash_shortage_warning_rupees', '100'),
  ('timezone', 'Asia/Kolkata'),
  ('currency_symbol', '₹');
