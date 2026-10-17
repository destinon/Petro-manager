import fs from 'fs';

const apiCode = fs.readFileSync('src/services/api.js', 'utf8');

// Known tables in Supabase right now:
const connectedTables = [
    'profiles',
    'employees',
    'fuel_types',
    'nozzles',
    'tanks',
    'shift_types',
    'station_settings',
    'daily_rates',
    'shifts',
    'shift_readings'
];

const missingTables = [
    'pumps',
    'tank_calibrations',
    'payment_methods',
    'expense_categories',
    'customers',
    'fuel_rates',
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

const funcRegex = /export (?:async )?function ([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*\{([\s\S]*?)(?=\nexport |$)/g;
let match;
const audit = [];

while ((match = funcRegex.exec(apiCode)) !== null) {
    const fnName = match[1];
    const args = match[2];
    const body = match[3];

    const tables = [...new Set([...body.matchAll(/supabase\s*\.\s*from\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]))];
    const rpcs = [...new Set([...body.matchAll(/supabase\s*\.\s*rpc\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]))];
    const authCalls = [...new Set([...body.matchAll(/supabase\s*\.\s*auth\s*\.\s*([a-zA-Z0-9_]+)/g)].map(m => m[1]))];
    
    const usesLocalStorage = body.includes('localStorage');
    const hasSupabase = tables.length > 0 || rpcs.length > 0 || authCalls.length > 0;

    const tablesConnected = tables.filter(t => connectedTables.includes(t));
    const tablesMissing = tables.filter(t => missingTables.includes(t));

    let status = 'DISCONNECTED (LOCALSTORAGE ONLY / MOCK)';
    if (tables.length > 0) {
        if (tablesMissing.length > 0 && tablesConnected.length === 0) {
            status = 'BROKEN / FAILING (TARGET TABLE NOT IN SUPABASE)';
        } else if (tablesMissing.length > 0 && tablesConnected.length > 0) {
            status = 'PARTIALLY BROKEN (SOME TABLES MISSING)';
        } else {
            status = 'CONNECTED TO TABLE (MAY HAVE SCHEMA MISMATCH)';
        }
    } else if (rpcs.length > 0) {
        status = 'RPC CALL';
    } else if (authCalls.length > 0) {
        status = 'AUTH CALL';
    }

    audit.push({
        function: fnName,
        status,
        tables,
        tablesConnected,
        tablesMissing,
        rpcs,
        authCalls,
        usesLocalStorage
    });
}

console.log(JSON.stringify(audit, null, 2));
