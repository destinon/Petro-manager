import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://rxtmnywtqkqhatudwkqc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4dG1ueXd0cWtxaGF0dWR3a3FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMjgyMjEsImV4cCI6MjEwNjcwNDIyMX0.MwPw8MFg0H2YC2OBCCcv3dFn0VtdO3Tg5nheniBVEug';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
    const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
        email: 'destinon075@gmail.com',
        password: 'PaRtH$2006'
    });

    if (authErr) {
        console.error('Auth error:', authErr);
        process.exit(1);
    }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', auth.user.id).single();

    // 1. Audit all tables mentioned anywhere in code or SQL
    const allKnownTables = [
        // Tables from api.js and manager/operator UI
        'profiles',
        'employees',
        'fuel_types',
        'pumps',
        'nozzles',
        'tanks',
        'shift_types',
        'payment_methods',
        'expense_categories',
        'station_settings',
        'daily_rates',
        'fuel_rates',
        'shifts',
        'shift_readings',
        'shift_nozzle_readings',
        'shift_rate_snapshots',
        'shift_payments',
        'shift_expenses',
        'customers',
        'credit_transactions',
        'tank_dip_readings',
        'tank_readings',
        'fuel_receipts',
        'fuel_deliveries',
        'tank_calibrations',
        'bank_reconciliations',
        'audit_logs',
        'operator_nozzle_assignments',
        'customer_balances',
        'station_info'
    ];

    const tableResults = [];

    for (const table of allKnownTables) {
        // Read test
        const { data: readData, error: readError } = await supabase.from(table).select('*').limit(1);
        
        let writeError = null;
        let canWrite = false;

        if (!readError) {
            // Test if table allows writes / RLS
            // We do a dummy update or delete with id: -999999 so we don't pollute data
            const res = await supabase.from(table).delete().eq('id', -999999);
            if (res.error) {
                writeError = res.error.message;
            } else {
                canWrite = true;
            }
        }

        tableResults.push({
            table,
            exists: !readError,
            readStatus: readError ? 'ERROR' : 'OK',
            readError: readError ? readError.message : null,
            canWrite: canWrite,
            writeError: writeError
        });
    }

    // 2. Audit all RPCs
    const rpcs = [
        'get_user_role',
        'is_manager',
        'get_shift_summary',
        'record_shift_submission',
        'get_dashboard_stats',
        'close_shift'
    ];
    const rpcResults = [];
    for (const rpc of rpcs) {
        const { data, error } = await supabase.rpc(rpc);
        rpcResults.push({
            rpc,
            exists: !error || (error.code !== 'PGRST202'),
            status: error ? error.message : 'OK'
        });
    }

    // Output results
    const fullAudit = {
        authenticatedUser: {
            id: auth.user.id,
            email: auth.user.email,
            profile: profile
        },
        tables: tableResults,
        rpcs: rpcResults
    };

    fs.writeFileSync('audit_output.json', JSON.stringify(fullAudit, null, 2));
    console.log('Audit completed and written to audit_output.json');
}

run().catch(console.error);
