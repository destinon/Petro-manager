# Excel Analysis

## Overview
This document analyzes the two provided Excel workbooks, `DSSR...xlsx` and `SHIFT.xlsx`, which serve as the business reference for the PetroCorp Station Management System.

## Workbook 1: DSSR (Daily Stock and Sales Records)
This workbook tracks daily inventory and sales reconciliation at the macro (daily) level. It contains two main sheets: `MS` (Petrol) and `HSD` (Diesel).

### Structure
- **Dates**: Each row represents a single day.
- **Pump Readings**:
  - Contains columns for opening readings and calculated sales for specific pumps.
  - **MS Sheet**: Includes Pump 1, Pump 3, Pump 5, Pump 7, Pump 9, and Pump 10.
  - **HSD Sheet**: Includes Pump 2, Pump 4, Pump 6, and Pump 8.
  - **Discrepancy Note**: The DSSR workbook labels Pump 10 as MS, while the SHIFT workbook labels it as HSD 10. The application must make pump and fuel grade assignments configurable to resolve this.
- **Sales Metrics**:
  - Pump Testing: Quantity used for testing (deducted from gross meter sales).
  - Actual Sales As Per Meter: Net sales after deducting testing.
  - Cumulative Sales: Running total of sales.
- **Tank Records**:
  - Tank 1 and Tank 2: Columns for MS Dip, Water Dip, and Net Stock.
  - Total Opening Stock: Sum of opening stock across tanks.
  - Receipt Quantity: Fuel deliveries received.
  - Closing Stock: Final stock at the end of the day.
- **Reconciliation**:
  - Sales As Per Tank Stock = (Total Opening Stock + Receipt Quantity) - Closing Stock
  - Actual Sales As Per Meter = Sum of net sales from all pumps.
  - Stock Variation = Actual Sales As Per Meter - Sales As Per Tank Stock
- **Pricing**:
  - Rate: The daily rate per litre for the respective fuel type.

## Workbook 2: SHIFT
This workbook tracks shift-level operations, payment collections, and cash reconciliation. It includes sheets for `1ST`, `2ND`, `NIGHT`, `EXTRA`, and presumably a `FULL DAY` summary.

### Structure
- **Shift Metadata**: Date, Shift Name, Shift Operator.
- **Nozzle Entries (10 Nozzles)**:
  - Labeled generically as MS 1, HSD 2, MS 3, HSD 4, MS 5, HSD 6, MS 7, HSD 8, MS 9, HSD 10.
  - Fields for each:
    - Open Reading
    - Closed Reading
    - Total Sale (Gross Quantity)
    - Testing
    - Sale (Net Quantity)
    - Today Rate
    - Actual Amount (Sales Amount)
- **Payment & Reconciliation Section**:
  - Collections allocated into configurable methods: Received Cash, Paytm Card, Paytm QR, PhonePe Card, PhonePe QR, MobiKwik QR, Credit, Cheque, and Expenses.
  - Extra / Short = Total Actual Amount - (Sum of all payment methods, credits, cheques, and expenses).
- **Udhaari (Credit) Ledger**:
  - Customer records include Name, Vehicle No, Quantity, Rate, Amount.
  - Example Customers: MBC, BUT, KONARK HOME, SHAINESHWAR, PAMMA, MARUTI, BRC, BITTU SETH, KOHINOOR, AMIT SAND, RINKU, JAY AMBE, J P LINES.
- **Expenses**:
  - Expense details logged with date and amount.

## Key Findings for Application Architecture
1. **Configurability is Critical**: Pumps, tanks, payment methods, shift names, and customers cannot be hardcoded. The discrepancy between DSSR and SHIFT workbooks regarding Pump 10 highlights the danger of hardcoding mappings.
2. **Formula Integrity**: The stock variation and extra/short calculations must mirror the spreadsheet exactly to maintain trust, but with proper validation to prevent entry errors.
3. **Data Normalization**: The Excel sheets merge data entry and reporting. The application will separate these: operators enter readings and payments via forms, while the backend generates aggregated reports (like the DSSR and FULL DAY sheets) dynamically.
