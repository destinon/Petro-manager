import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rxtmnywtqkqhatudwkqc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4dG1ueXd0cWtxaGF0dWR3a3FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMjgyMjEsImV4cCI6MjEwNjcwNDIyMX0.MwPw8MFg0H2YC2OBCCcv3dFn0VtdO3Tg5nheniBVEug';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectColumns() {
    await supabase.auth.signInWithPassword({
        email: 'destinon075@gmail.com',
        password: 'PaRtH$2006'
    });

    const tables = ['fuel_types', 'nozzles', 'tanks', 'shifts', 'shift_readings', 'employees', 'daily_rates'];
    
    // We can probe columns by trying to select common columns or inserting with dummy bad columns to read Postgres error
    for (const tbl of tables) {
        console.log(`\n--- Inspecting columns for table: ${tbl} ---`);
        // Test candidate columns from both schemas
        const candidateCols = [
            'id', 'name', 'code', 'display_name', 'sort_order', 'is_active', 'created_at', 'updated_at',
            'fuel_type', 'fuel_type_id', 'pump_id', 'tank_id', 'capacity', 'capacity_litres', 'current_stock', 'current_stock_litres',
            'date', 'shift_date', 'shift_id', 'shift_type_id', 'operator_id', 'manager_id', 'status',
            'opening_reading', 'closing_reading', 'sale_litres', 'testing_litres', 'rate',
            'phone', 'email', 'full_name', 'role', 'has_dual_access',
            'ms_rate', 'hsd_rate', 'rate_date'
        ];

        const validCols = [];
        for (const col of candidateCols) {
            const { error } = await supabase.from(tbl).select(col).limit(0);
            if (!error) {
                validCols.push(col);
            }
        }
        console.log(`Table [${tbl}] valid columns found:`, validCols.join(', '));
    }
}

inspectColumns().catch(console.error);
