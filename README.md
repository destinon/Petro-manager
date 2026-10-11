# PetroCorp - Complete Petrol Station Management System

An enterprise-grade, full-stack petrol station management and operations application modeled after operational daily accounting records (`DSSR.xlsx` and `SHIFT.xlsx`).

---

## Architecture Overview

- **Frontend**: Vanilla ES Modules, Vite, Progressive Web App (PWA) with offline capabilities.
- **Styling**: Tailored CSS design system with light/dark theme switching, animated grid, and responsive mobile-first views.
- **Backend & Database**: Supabase PostgreSQL with Row Level Security (RLS), custom PostgreSQL functions, triggers, and automated views.
- **Authentication**: Supabase Auth with role-based routing (Operator vs. Station Manager).
- **Calculations**: Strictly decoupled and validated business formula engine with automated unit test suite.

---

## Directory Structure

```
Petrocorp/
├── index.html                 # Enterprise login & authentication portal
├── manager.html               # Station Manager Console (DSSR, shifts, tanks, rates, staff)
├── operator.html              # Operator Shift Console (meters, cash, digital, credit, recon)
├── style.css                  # Design system tokens, animated grid, and responsive layouts
├── vite.config.js             # Vite build & PWA manifest configuration
├── package.json               # Dependencies & scripts
│
├── src/
│   ├── auth/
│   │   └── auth.js            # Authentication, session check, role authorization
│   ├── calculations/
│   │   └── calculations.js    # Decoupled business calculation engine
│   ├── services/
│   │   └── api.js             # Supabase CRUD service layer & DSSR aggregation engine
│   ├── utils/
│   │   ├── formatters.js      # Indian Rupee (₹), litre, and date formatters
│   │   ├── toast.js           # Toast notification system
│   │   └── exportCsv.js       # Dynamic CSV export generator
│   ├── pages/
│   │   ├── manager-page.js    # Dedicated entry controller for Station Manager console
│   │   └── operator-page.js   # Dedicated entry controller for Operator console
│   ├── operator.js            # Operator shift controller (meters, credit, expenses, recon)
│   ├── manager.js             # Manager DSSR controller, shift approvals, rates, hardware
│   ├── main.js                # Login page controller
│   └── supabase.js            # Supabase client instantiation
│
├── supabase/
│   └── migrations/
│       ├── 001_schema.sql     # Complete database schema, functions, triggers, and RLS
│       └── 002_seed_data.sql  # Seed data derived from Excel workbooks
│
├── tests/
│   └── calculations.test.js   # Automated unit tests for business calculations
│
└── docs/
    ├── calculation-rules.md   # Source-of-truth business formulas
    └── excel-analysis.md      # Analysis of DSSR and SHIFT workbooks
```

---

## Business Calculations Reference

All calculations match standard accounting conventions defined in `docs/calculation-rules.md`:

1. **Gross Quantity (Litres):**
   $$\text{Gross} = \text{Closing Reading} - \text{Opening Reading}$$

2. **Net Quantity (Litres):**
   $$\text{Net} = \text{Gross} - \text{Testing Quantity}$$

3. **Sales Amount (₹):**
   $$\text{Sales Amount} = \text{Net Quantity} \times \text{Rate per Litre}$$

4. **Shift Reconciliation Variance (Short / Extra Cash):**
   $$\text{Total Deductions} = \text{Payment Collections} + \text{Udhaari (Credit)} + \text{Expenses} + \text{Cheques}$$
   $$\text{Variance} = \text{Total Sales Amount} - \text{Total Deductions}$$
   - **Variance > 0**: Cash Shortage (Operator handed over less than expected).
   - **Variance < 0**: Excess / Surplus (Operator handed over more than expected).
   - **Variance = 0**: Perfectly balanced.

5. **DSSR Stock Variation:**
   $$\text{Tank Expected Sales} = (\text{Opening Stock} + \text{Receipts}) - \text{Closing Stock}$$
   $$\text{Stock Variation} = \text{Sum of Net Meter Sales} - \text{Tank Expected Sales}$$

---

## Database Setup & Migrations

If deploying to a new Supabase project:
1. Open the **SQL Editor** in your Supabase dashboard.
2. Execute `supabase/migrations/001_schema.sql` (or `supabase_schema.sql`).
3. Execute `supabase/migrations/002_seed_data.sql` to populate fuel grades (MS, HSD), the 10 dispenser nozzles, 4 storage tanks, initial customer credit accounts, and default settings.

---

## Running Locally

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Run automated calculation tests:**
   ```bash
   npm test
   ```

4. **Build production bundle:**
   ```bash
   npm run build
   ```
