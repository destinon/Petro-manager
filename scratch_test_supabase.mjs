import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rxtmnywtqkqhatudwkqc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4dG1ueXd0cWtxaGF0dWR3a3FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMjgyMjEsImV4cCI6MjEwNjcwNDIyMX0.MwPw8MFg0H2YC2OBCCcv3dFn0VtdO3Tg5nheniBVEug';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runAudit() {
    console.log('--- 1. Authenticating as Destinon075@gmail.com ---');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: 'Destinon075@gmail.com',
        password: 'PaRtH$2006'
    });

    if (authError) {
        console.error('Auth Failed:', authError.message);
        return;
    }
    console.log('Auth SUCCESS! User ID:', authData.user.id);

    const tablesToTest = [
        'profiles',
        'employees',
        'fuel_types',
        'pumps',
        'nozzles',
        'tanks',
        'shift_types',
        'payment_methods',
        'expense_categories',
        'daily_rates',
        'shifts',
        'shift_rate_snapshots',
        'shift_nozzle_readings',
        'shift_payments',
        'shift_expenses',
        'customers',
        'credit_transactions',
        'tank_dip_readings',
        'fuel_receipts',
        'station_settings',
        'operator_nozzle_assignments'
    ];

    console.log('\n--- 2. Auditing Table Availability & RLS Read ---');
    const report = [];

    for (const table of tablesToTest) {
        const { data, error, count } = await supabase.from(table).select('*', { count: 'exact', head: true });
        if (error) {
            report.push({ table, status: 'ERROR', message: error.message, code: error.code });
        } else {
            report.push({ table, status: 'EXISTS', rows: count });
        }
    }

    console.table(report);

    console.log('\n--- 3. Testing Specific Queries For Input Forms ---');

    // A. Daily Fuel Rates Form
    console.log('\n[A] Daily Fuel Rates Query:');
    const { data: rateData, error: rateError } = await supabase.from('daily_rates')
        .upsert([
            { rate_date: '2026-10-16', fuel_type_id: 1, rate: 104.50 },
            { rate_date: '2026-10-16', fuel_type_id: 2, rate: 92.30 }
        ], { onConflict: 'rate_date,fuel_type_id' })
        .select();
    console.log('Daily Rates upsert result:', rateError ? 'FAIL: ' + rateError.message : 'SUCCESS: ' + JSON.stringify(rateData));

    // B. Physical Tank Dip Form
    console.log('\n[B] Physical Tank Dip Query:');
    const { data: dipData, error: dipError } = await supabase.from('tank_dip_readings')
        .insert({
            tank_id: 1,
            dip_date: '2026-10-16',
            fuel_dip_mm: 1200,
            water_dip_mm: 0,
            calculated_stock_litres: 14000
        })
        .select();
    console.log('Tank Dip insert result:', dipError ? 'FAIL: ' + dipError.message : 'SUCCESS: ' + JSON.stringify(dipData));

    // C. Fuel Delivery (Receipt) Form
    console.log('\n[C] Fuel Delivery (Receipt) Query:');
    const { data: recData, error: recError } = await supabase.from('fuel_receipts')
        .insert({
            tank_id: 1,
            receipt_date: '2026-10-16',
            quantity_litres: 10000,
            invoice_number: 'INV-TEST-001'
        })
        .select();
    console.log('Fuel Receipt insert result:', recError ? 'FAIL: ' + recError.message : 'SUCCESS: ' + JSON.stringify(recData));

    // D. Add Pump / Nozzle Form
    console.log('\n[D] Add Pump / Nozzle Query:');
    const { data: nozData, error: nozError } = await supabase.from('nozzles')
        .select('*')
        .limit(1);
    console.log('Nozzles query result:', nozError ? 'FAIL: ' + nozError.message : 'SUCCESS, row count: ' + (nozData?.length || 0));

    // E. Udhaari (Credit) Customer & Transaction Form
    console.log('\n[E] Credit Customer Query:');
    const { data: custData, error: custError } = await supabase.from('customers')
        .select('*')
        .limit(1);
    console.log('Customers query result:', custError ? 'FAIL: ' + custError.message : 'SUCCESS, count: ' + (custData?.length || 0));

    const { data: ctxData, error: ctxError } = await supabase.from('credit_transactions')
        .select('*')
        .limit(1);
    console.log('Credit Transactions query result:', ctxError ? 'FAIL: ' + ctxError.message : 'SUCCESS, count: ' + (ctxData?.length || 0));

    // Test write to daily_rates with ms_rate and hsd_rate
    console.log('\n[A2] Daily Fuel Rates Write with ms_rate / hsd_rate:');
    const { data: drData, error: drErr } = await supabase.from('daily_rates')
        .upsert([{ date: '2026-10-16', ms_rate: 104.50, hsd_rate: 92.80 }], { onConflict: 'date' })
        .select();
    console.log('daily_rates upsert with (date, ms_rate, hsd_rate):', drErr ? 'FAIL: ' + drErr.message : 'SUCCESS: ' + JSON.stringify(drData));

    // Test write to station_settings
    console.log('\n[F2] Station Settings Write:');
    const { data: ssData, error: ssErr } = await supabase.from('station_settings')
        .upsert([{ key: 'contact_number', value: '+91 98765 43210' }], { onConflict: 'key' })
        .select();
    console.log('station_settings upsert:', ssErr ? 'FAIL: ' + ssErr.message : 'SUCCESS: ' + JSON.stringify(ssData));

    // Test write to employees
    console.log('\n[H] Add Employee:');
    const testEmp = {
        name: 'Test Audit Staff',
        role: 'operator',
        phone: '9999988888',
        is_active: true
    };
    const { data: empData, error: empErr } = await supabase.from('employees').insert([testEmp]).select();
    console.log('employees insert:', empErr ? 'FAIL: ' + empErr.message : 'SUCCESS: ' + JSON.stringify(empData));
    if (empData && empData[0]?.id) {
        // Clean up test employee
        await supabase.from('employees').delete().eq('id', empData[0].id);
        console.log('Test employee cleaned up.');
    }

    // Test write to tanks
    console.log('\n[I] Add Tank:');
    const { data: tankData, error: tankErr } = await supabase.from('tanks').insert([{
        fuel_type_id: 1,
        capacity_litres: 20000,
        current_stock_litres: 12000,
        name: 'Tank Audit 1'
    }]).select();
    console.log('tanks insert:', tankErr ? 'FAIL: ' + tankErr.message : 'SUCCESS: ' + JSON.stringify(tankData));
    if (tankData && tankData[0]?.id) {
        await supabase.from('tanks').delete().eq('id', tankData[0].id);
    }

    // Test write to nozzles
    console.log('\n[J] Add Nozzle:');
    const { data: nozInsData, error: nozInsErr } = await supabase.from('nozzles').insert([{
        fuel_type_id: 1,
        name: 'Nozzle Audit 1'
    }]).select();
    console.log('nozzles insert:', nozInsErr ? 'FAIL: ' + nozInsErr.message : 'SUCCESS: ' + JSON.stringify(nozInsData));
    if (nozInsData && nozInsData[0]?.id) {
        await supabase.from('nozzles').delete().eq('id', nozInsData[0].id);
    }
}

runAudit();
