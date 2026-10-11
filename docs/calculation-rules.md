# Calculation Rules

## Overview
This document defines the core business rules and formulas for the PetroCorp Station Management System, derived from the `DSSR...xlsx` and `SHIFT.xlsx` workbooks. These rules must be applied consistently across the application backend, edge functions, and frontend UI.

## 1. Nozzle & Shift Sales Calculations

For any given nozzle in a shift:

- **Gross Sales Quantity (Litres):**
  `gross_quantity = closing_reading - opening_reading`

- **Net Sales Quantity (Litres):**
  `net_quantity = gross_quantity - testing_quantity`
  *(Note: Testing quantity is fuel pumped for calibration/testing and must not be charged.)*

- **Sales Amount (Rupees):**
  `sales_amount = net_quantity × rate_per_litre`
  *(Note: The `rate_per_litre` must be locked/snapshotted for the shift to prevent historical data changes if prices update.)*

## 2. Shift Reconciliation (Extra / Short Cash)

To determine if the operator has collected the correct amount of money for a shift, the application aggregates all expected revenue against all logged collections and credits.

- **Total Payment Collections:**
  `payment_collections = cash + paytm_card + paytm_qr + phonepe_card + phonepe_qr + mobikwik_qr + ... (all digital methods)`

- **Total Reconciliation Deductions:**
  `total_deductions = payment_collections + new_credit_sales + cheque_collections + expenses`
  *(Note: Old credit repayments are NOT deducted here, as they are not part of the current shift's fuel sales revenue. Cheques are handled separately from general digital payments. Expenses paid out of the shift's cash collection reduce the expected cash handover.)*

- **Extra / Short Difference:**
  `extra_short = total_sales_amount - total_deductions`
  - If `extra_short` > 0: Shortage (Operator handed over less than expected).
  - If `extra_short` < 0: Excess (Operator handed over more than expected).
  - If `extra_short` == 0: Perfectly balanced.

*(Sign convention matches standard accounting: Expected Revenue - Actual Received = Shortage)*

## 3. Daily Stock and Sales Records (DSSR) Calculations

These calculations apply globally across all shifts in a given day for a specific fuel type.

- **Total Opening Stock (Litres):**
  `total_opening_stock = sum(opening_net_stock_of_all_tanks_for_fuel_type)`

- **Stock Sales Quantity (Expected Sales based on Tanks):**
  `stock_sales_quantity = total_opening_stock + fuel_receipts - closing_stock`

- **Meter Sales Quantity (Actual Sales based on Pumps):**
  `meter_sales_quantity = sum(net_sales_quantity_of_all_nozzles_for_fuel_type_across_all_shifts)`

- **Stock Variation (Litres):**
  `stock_variation = meter_sales_quantity - stock_sales_quantity`
  - A positive variation means meters recorded more sales than the tanks indicate.
  - A negative variation means tanks lost more stock than the meters recorded.

## 4. Tank Dip Conversion
- The system must support configurable dip-to-volume calibration tables.
- If calibration tables are absent, authorized managers may manually enter the `net_stock` volume and label it as a manual entry.
- Opening stock for Day N must automatically equal Closing stock from Day N-1.

## 5. Credit (Udhaari) Ledger Rules
- **New Credit Sale:** Increases the customer's outstanding balance. Deducted during shift reconciliation.
- **Credit Repayment:** Decreases the customer's outstanding balance. Appears as cash/digital inflow in daily bank reconciliation reports, but does NOT affect the fuel sales reconciliation of the active operator shift.
