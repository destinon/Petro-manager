import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rxtmnywtqkqhatudwkqc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4dG1ueXd0cWtxaGF0dWR3a3FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMjgyMjEsImV4cCI6MjEwNjcwNDIyMX0.MwPw8MFg0H2YC2OBCCcv3dFn0VtdO3Tg5nheniBVEug';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
    console.log('Authenticating with destinon075@gmail.com...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: 'destinon075@gmail.com',
        password: 'PaRtH$2006'
    });

    if (authError) {
        console.error('Authentication FAILED:', authError);
        return;
    }
    console.log('Authenticated successfully as:', authData.user.email, 'ID:', authData.user.id);

    // List of candidate tables across migrations, schema files, and api.js
    const candidateTables = [
        'profiles',
        'employees',
        'fuel_types',
        'pumps',
        'nozzles',
        'tanks',
        'tank_calibrations',
        'shift_types',
        'payment_methods',
        'expense_categories',
        'customers',
        'station_settings',
        'fuel_rates',
        'daily_rates',
        'shifts',
        'shift_readings',
        'shift_rate_snapshots',
        'shift_nozzle_readings',
        'shift_payments',
        'shift_expenses',
        'credit_transactions',
        'tank_dip_readings',
        'fuel_receipts',
        'bank_reconciliations',
        'audit_logs',
        'operator_nozzle_assignments',
        'station_info',
        'user_roles'
    ];

    console.log('\n--- AUDITING ALL TABLES ---');
    const tableResults = [];

    for (const table of candidateTables) {
        // Try simple SELECT limit 1
        const { data, error, count } = await supabase.from(table).select('*').limit(1);
        if (error) {
            tableResults.push({
                table,
                exists: false,
                status: 'NOT CONNECTED / MISSING',
                code: error.code,
                message: error.message
            });
        } else {
            // Table exists! Let's get sample row keys if available
            const sampleKeys = data && data.length > 0 ? Object.keys(data[0]) : [];
            tableResults.push({
                table,
                exists: true,
                status: 'CONNECTED',
                sampleKeys,
                rowCount: data.length
            });
        }
    }

    console.log('\n=== TABLES AUDIT SUMMARY ===');
    console.log('CONNECTED TABLES:');
    const connected = tableResults.filter(t => t.exists);
    connected.forEach(t => console.log(`  [+] ${t.table} (sample cols: ${t.sampleKeys.join(', ') || 'table empty'})`));

    console.log('\nNOT CONNECTED / MISSING TABLES:');
    const notConnected = tableResults.filter(t => !t.exists);
    notConnected.forEach(t => console.log(`  [-] ${t.table} -> Error: [${t.code}] ${t.message}`));

    // For connected tables that are empty, let's discover their actual columns by intentionally triggering PostgREST column error or reading empty schema
    console.log('\n--- DISCOVERING COLUMNS FOR EMPTY CONNECTED TABLES ---');
    for (const t of connected) {
        if (t.sampleKeys.length === 0) {
            // probe with a dummy column to see PostgREST error which lists columns or lets us test expected columns
            // Or try inserting an empty object or selecting a non-existent column
            const { error } = await supabase.from(t.table).select('non_existent_column_for_probing').limit(1);
            if (error) {
                // PostgREST error message often says: Could not find the 'non_existent_column_for_probing' column of 'table' in the schema cache
                // Let's test specific expected columns from schema
                t.probeError = error.message;
            }
        }
    }

    // Candidate RPC functions
    const candidateRpcs = [
        'get_user_role',
        'is_manager',
        'get_shift_summary',
        'record_shift_submission',
        'get_dashboard_stats',
        'close_shift'
    ];

    console.log('\n--- AUDITING RPC FUNCTIONS ---');
    for (const rpc of candidateRpcs) {
        const { data, error } = await supabase.rpc(rpc);
        if (error) {
            console.log(`  RPC [${rpc}]: ${error.code} - ${error.message}`);
        } else {
            console.log(`  RPC [${rpc}]: CONNECTED (Result: ${JSON.stringify(data)})`);
        }
    }
}

main().catch(console.error);
