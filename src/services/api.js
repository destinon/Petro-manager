/**
 * PetroCorp Station Management - Supabase API Services
 */
import { supabase, createClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase.js';

// ==========================================
// 1. AUTH & PROFILES
// ==========================================

export async function fetchUserProfile(userId) {
    try {
        let { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        let result = data;
        if (error || !data) {
            const fallback = await supabase
                .from('employees')
                .select('*')
                .eq('id', userId)
                .single();
            if (fallback.data) result = fallback.data;
        }

        if (result && (result.role === 'manager' || result.has_dual_access === true)) {
            result.hasDualAccess = true;
        }

        return result;
    } catch (err) {
        console.error('Error fetching profile:', err);
        return null;
    }
}

export async function fetchEmployees() {
    try {
        let { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('full_name', { ascending: true });

        if (!error && data && data.length > 0) {
            return data;
        }

        const fallback = await supabase
            .from('employees')
            .select('*')
            .order('full_name', { ascending: true });
        return fallback.data || [];
    } catch (err) {
        console.warn('Error fetching employees:', err);
        return [];
    }
}

export async function toggleEmployeeStatus(id, isActive) {
    try {
        let res = await supabase.from('profiles').update({ is_active: isActive }).eq('id', id);
        if (res.error) {
            res = await supabase.from('employees').update({ is_active: isActive }).eq('id', id);
        }
        return res;
    } catch (err) {
        console.warn('DB toggle notice:', err);
        return false;
    }
}

export async function createOperator({ full_name, email, password, phone, nozzle_ids = [] }) {
    if (!full_name || !email || !password) {
        throw new Error('Full Name, Email, and Password are required.');
    }

    // Isolated client so active manager session is untouched
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });

    const { data: authData, error: authError } = await authClient.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password,
        options: {
            data: {
                full_name: full_name.trim(),
                role: 'operator',
                phone: phone ? phone.trim() : ''
            }
        }
    });

    if (authError) {
        throw new Error(authError.message);
    }

    const userId = authData?.user?.id;
    if (!userId) {
        throw new Error('Supabase Auth did not generate a user id.');
    }

    const operatorRecord = {
        id: userId,
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone ? phone.trim() : '',
        role: 'operator',
        is_active: true,
        created_at: new Date().toISOString()
    };

    const { error: profErr } = await supabase.from('profiles').upsert([operatorRecord], { onConflict: 'id' });
    if (profErr) {
        await supabase.from('employees').upsert([operatorRecord], { onConflict: 'id' });
    }

    if (Array.isArray(nozzle_ids) && nozzle_ids.length > 0) {
        await saveOperatorNozzleAssignments(userId, nozzle_ids);
    }

    return operatorRecord;
}

// ==========================================
// 2. CONFIGURATION & MASTER DATA
// ==========================================

export async function fetchFuelTypes() {
    try {
        const { data, error } = await supabase
            .from('fuel_types')
            .select('*')
            .order('sort_order', { ascending: true });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.warn('Error fetching fuel types:', err);
        return [];
    }
}

export async function fetchPumps() {
    try {
        const { data, error } = await supabase
            .from('pumps')
            .select('*')
            .order('id', { ascending: true });
        if (error || !data) return [];
        return data;
    } catch {
        return [];
    }
}

export async function fetchNozzles() {
    // 1. Try fetching from remote Supabase DB first (source of truth)
    try {
        const { data, error } = await supabase
            .from('nozzles')
            .select('*, fuel_types(id, name, display_name)')
            .order('id', { ascending: true });

        if (!error && data && data.length > 0) {
            const mapped = data.map(n => ({
                ...n,
                fuel_types: n.fuel_types || {
                    id: n.fuel_type_id,
                    name: n.fuel_type_id === 1 ? 'MS' : 'HSD',
                    display_name: n.fuel_type_id === 1 ? 'Petrol (MS)' : 'Diesel (HSD)'
                }
            }));
            localStorage.setItem('petrocorp_custom_nozzles', JSON.stringify(mapped));
            return mapped;
        }
    } catch (err) {
        console.warn('Notice loading nozzles from DB:', err);
    }

    // 2. Fallback: check local cache (for offline resilience)
    const localStr = localStorage.getItem('petrocorp_custom_nozzles');
    if (localStr) {
        try {
            const parsed = JSON.parse(localStr);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch {}
    }

    // 3. No data — return empty (everything is dynamic)
    return [];
}

export async function createNozzle({ name, fuel_type_id, master_reading }) {
    const nozzles = await fetchNozzles();
    const newId = nozzles.reduce((max, n) => Math.max(max, parseInt(n.id) || 0), 0) + 1;
    const fId = parseInt(fuel_type_id);
    const fuelName = fId === 1 ? 'MS' : 'HSD';

    const newNozzle = {
        id: newId,
        name: name.trim().toUpperCase(),
        fuel_type_id: fId,
        master_reading: parseFloat(master_reading || 0),
        sort_order: newId,
        is_active: true,
        fuel_types: {
            id: fId,
            name: fuelName,
            display_name: fuelName === 'MS' ? 'Petrol (MS)' : 'Diesel (HSD)'
        }
    };

    // Try saving to DB
    try {
        await supabase.from('nozzles').insert([{
            name: newNozzle.name,
            fuel_type_id: newNozzle.fuel_type_id,
            master_reading: newNozzle.master_reading,
            is_active: true
        }]);
    } catch {}

    nozzles.push(newNozzle);
    localStorage.setItem('petrocorp_custom_nozzles', JSON.stringify(nozzles));
    return newNozzle;
}

export async function updateNozzle(nozzleId, { name, fuel_type_id, master_reading, is_active }) {
    const nozzles = await fetchNozzles();
    const id = parseInt(nozzleId);
    const index = nozzles.findIndex(n => n.id === id);
    if (index === -1) throw new Error(`Nozzle with ID ${nozzleId} not found`);

    const fId = parseInt(fuel_type_id);
    const fuelName = fId === 1 ? 'MS' : 'HSD';

    nozzles[index].name = name ? name.trim().toUpperCase() : nozzles[index].name;
    nozzles[index].fuel_type_id = fId;
    nozzles[index].master_reading = parseFloat(master_reading || 0);
    nozzles[index].is_active = is_active !== false;
    nozzles[index].fuel_types = {
        id: fId,
        name: fuelName,
        display_name: fuelName === 'MS' ? 'Petrol (MS)' : 'Diesel (HSD)'
    };

    // Try updating DB
    try {
        await supabase.from('nozzles').update({
            name: nozzles[index].name,
            fuel_type_id: nozzles[index].fuel_type_id,
            master_reading: nozzles[index].master_reading,
            is_active: nozzles[index].is_active
        }).eq('id', id);
    } catch {}

    localStorage.setItem('petrocorp_custom_nozzles', JSON.stringify(nozzles));
    return nozzles[index];
}

export async function deleteNozzle(nozzleId, deleteHistory = true) {
    const nozzles = await fetchNozzles();
    const id = parseInt(nozzleId);
    const filtered = nozzles.filter(n => n.id !== id);

    // Try deleting from DB
    try {
        if (deleteHistory) {
            await supabase.from('shift_nozzle_readings').delete().eq('nozzle_id', id);
            await supabase.from('shift_readings').delete().eq('nozzle_id', id);
        }
        await supabase.from('nozzles').delete().eq('id', id);
    } catch {}

    // Also purge reading history from local shift caches
    if (deleteHistory) {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('petrocorp_shift_') && key.endsWith('_readings')) {
                    const stored = JSON.parse(localStorage.getItem(key) || '{}');
                    if (stored[id]) {
                        delete stored[id];
                        localStorage.setItem(key, JSON.stringify(stored));
                    }
                }
            }
        } catch {}
    }

    localStorage.setItem('petrocorp_custom_nozzles', JSON.stringify(filtered));
    return true;
}

export async function updateNozzleMasterReading(nozzleId, newReading) {
    return updateNozzle(nozzleId, { master_reading: newReading });
}

// ==========================================
// OPERATOR PUMP / NOZZLE ASSIGNMENTS
// ==========================================

export async function fetchOperatorNozzleAssignments(operatorId) {
    if (!operatorId) return [];
    const localStore = JSON.parse(localStorage.getItem('petrocorp_operator_pump_assignments') || '{}');
    try {
        const { data, error } = await supabase
            .from('operator_nozzle_assignments')
            .select('nozzle_id')
            .eq('operator_id', operatorId);
        if (!error && data && data.length > 0) {
            const ids = data.map(d => parseInt(d.nozzle_id));
            localStore[operatorId] = ids;
            localStorage.setItem('petrocorp_operator_pump_assignments', JSON.stringify(localStore));
            return ids;
        }
    } catch {}
    return localStore[operatorId] || [];
}

export async function saveOperatorNozzleAssignments(operatorId, nozzleIds) {
    if (!operatorId) return [];
    const ids = (nozzleIds || []).map(id => parseInt(id));
    const localStore = JSON.parse(localStorage.getItem('petrocorp_operator_pump_assignments') || '{}');
    localStore[operatorId] = ids;
    localStorage.setItem('petrocorp_operator_pump_assignments', JSON.stringify(localStore));

    try {
        await supabase.from('operator_nozzle_assignments').delete().eq('operator_id', operatorId);
        if (ids.length > 0) {
            const rows = ids.map(nid => ({ operator_id: operatorId, nozzle_id: nid }));
            await supabase.from('operator_nozzle_assignments').insert(rows);
        }
    } catch (err) {
        console.warn('Notice saving operator pump assignments to DB:', err);
    }
    return ids;
}

export async function fetchNozzlesForOperator(operatorId) {
    const allNozzles = await fetchNozzles();
    if (!operatorId) return allNozzles.filter(n => n.is_active !== false);

    const assignedIds = await fetchOperatorNozzleAssignments(operatorId);
    if (!assignedIds || assignedIds.length === 0) {
        // Return empty array to enforce manager assignment
        return [];
    }
    return allNozzles.filter(n => assignedIds.includes(parseInt(n.id)) && n.is_active !== false);
}

export async function fetchTanks() {
    try {
        const { data, error } = await supabase
            .from('tanks')
            .select('*, fuel_types(id, name, display_name)')
            .order('name');
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.warn('Error fetching tanks:', err);
        return [];
    }
}

export async function fetchShiftTypes() {
    try {
        const { data, error } = await supabase
            .from('shift_types')
            .select('*')
            .order('sort_order', { ascending: true });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.warn('Error fetching shift types:', err);
        return [];
    }
}

export async function fetchPaymentMethods() {
    try {
        const { data, error } = await supabase
            .from('payment_methods')
            .select('*')
            .order('sort_order', { ascending: true });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.warn('Error fetching payment methods:', err);
        return [];
    }
}

export async function fetchExpenseCategories() {
    try {
        const { data, error } = await supabase
            .from('expense_categories')
            .select('*')
            .order('name');
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.warn('Error fetching expense categories:', err);
        return [];
    }
}

export async function fetchStationSettings() {
    const { data, error } = await supabase
        .from('station_settings')
        .select('*');
    if (error) return {};
    const settings = {};
    (data || []).forEach(s => { settings[s.key] = s.value; });
    return settings;
}

export async function updateStationSetting(key, value) {
    const { error } = await supabase
        .from('station_settings')
        .upsert({ key, value }, { onConflict: 'key' });
    if (error) throw error;
}

// ==========================================
// 3. DAILY RATES (MANAGER ENTERED ONLY)
// ==========================================

export async function fetchDailyRates(date) {
    try {
        const { data, error } = await supabase
            .from('daily_rates')
            .select('*')
            .eq('date', date);
        if (!error && data && data.length > 0) {
            const mapped = data.map(r => ({
                ...r,
                fuel_types: {
                    id: r.fuel_type_id,
                    name: r.fuel_type_id === 1 ? 'MS' : 'HSD',
                    display_name: r.fuel_type_id === 1 ? 'Petrol (MS)' : 'Diesel (HSD)'
                }
            }));
            localStorage.setItem('petrocorp_daily_rates_' + date, JSON.stringify(mapped));
            return mapped;
        }
    } catch {}

    // Check manager-published rate cache for this date
    const cached = localStorage.getItem('petrocorp_daily_rates_' + date);
    if (cached) {
        try {
            return JSON.parse(cached);
        } catch {}
    }

    // Do NOT return hardcoded rates - rates MUST be entered by Manager
    return [];
}

export async function saveDailyRates(date, ratesArray, userId) {
    const payload = ratesArray.map(r => ({
        date,
        fuel_type_id: parseInt(r.fuel_type_id),
        rate: parseFloat(r.rate),
        set_by: userId
    }));

    // Cache locally immediately so operators receive manager rates in real time
    const mapped = payload.map(r => ({
        ...r,
        fuel_types: {
            id: r.fuel_type_id,
            name: r.fuel_type_id === 1 ? 'MS' : 'HSD',
            display_name: r.fuel_type_id === 1 ? 'Petrol (MS)' : 'Diesel (HSD)'
        }
    }));
    localStorage.setItem('petrocorp_daily_rates_' + date, JSON.stringify(mapped));

    // Save to Supabase
    try {
        const { error } = await supabase
            .from('daily_rates')
            .upsert(payload, { onConflict: 'date, fuel_type_id' });
        if (error) console.warn('Notice saving rates to DB:', error);
    } catch (err) {
        console.warn('Notice saving daily rates to DB:', err);
    }
}

// ==========================================
// 4. SHIFTS & OPERATOR WORKFLOW
// ==========================================

export async function fetchActiveShift(operatorId, date) {
    try {
        let { data: shifts, error } = await supabase
            .from('shifts')
            .select('*')
            .eq('operator_id', operatorId)
            .order('id', { ascending: false })
            .limit(1);

        if (error || !shifts || shifts.length === 0) return null;
        const shift = shifts[0];

        // Check if closed/submitted
        if (shift.is_closed === true || shift.status === 'approved' || shift.status === 'submitted') {
            return null;
        }

        // Map snapshot rates strictly from shift or manager daily rate
        const msRate = parseFloat(shift.ms_rate || 0);
        const hsdRate = parseFloat(shift.hsd_rate || 0);
        shift.shift_rate_snapshots = [
            { rate: msRate, fuel_types: { name: 'MS' } },
            { rate: hsdRate, fuel_types: { name: 'HSD' } }
        ];

        // Map shift type label
        const typeNames = { '1st': '1st Shift', '2nd': '2nd Shift', 'night': 'Night Shift', 'extra': 'Extra Shift' };
        shift.shift_types = { name: typeNames[shift.shift_type] || shift.shift_type || '1st Shift' };

        // Pull existing readings
        try {
            let { data: readings } = await supabase
                .from('shift_nozzle_readings')
                .select('*')
                .eq('shift_id', shift.id);

            if (!readings || readings.length === 0) {
                const fb = await supabase.from('shift_readings').select('*').eq('shift_id', shift.id);
                readings = fb.data || [];
            }
            shift.shift_nozzle_readings = readings || [];
        } catch {
            shift.shift_nozzle_readings = [];
        }

        return shift;
    } catch (err) {
        console.warn('Notice querying active shift:', err);
        return null;
    }
}

export async function createShift({ date, shift_type_id, operator_id, rates }) {
    const msRate = parseFloat(rates?.find(r => r.fuel_type_id === 1)?.rate);
    const hsdRate = parseFloat(rates?.find(r => r.fuel_type_id === 2)?.rate);

    if (isNaN(msRate) || isNaN(hsdRate)) {
        throw new Error('Cannot start shift: Daily fuel rates have not been published by the Station Manager.');
    }

    const shiftTypeMap = { 1: '1st', 2: '2nd', 3: 'night', 4: 'extra' };
    const shiftTypeStr = shiftTypeMap[shift_type_id] || '1st';

    let shift = null;

    // Strategy 1: Remote schema with shift_type enum & ms_rate/hsd_rate
    const res1 = await supabase
        .from('shifts')
        .insert([{
            date,
            shift_type: shiftTypeStr,
            operator_id,
            ms_rate: msRate,
            hsd_rate: hsdRate,
            is_closed: false
        }])
        .select()
        .single();

    if (res1.data) {
        shift = res1.data;
    } else {
        // Strategy 2: Migration 001 schema with shift_type_id & status
        const res2 = await supabase
            .from('shifts')
            .insert([{
                date,
                shift_type_id,
                operator_id,
                status: 'open'
            }])
            .select()
            .single();

        if (res2.data) {
            shift = res2.data;
        } else {
            throw res1.error || res2.error;
        }
    }

    // Try snapshotting rates
    try {
        const snapshots = [
            { shift_id: shift.id, fuel_type_id: 1, rate: msRate },
            { shift_id: shift.id, fuel_type_id: 2, rate: hsdRate }
        ];
        await supabase.from('shift_rate_snapshots').insert(snapshots);
    } catch {}

    return shift;
}

export async function saveNozzleReading(shiftId, readingData) {
    const payload = {
        shift_id: shiftId,
        nozzle_id: readingData.nozzle_id,
        opening_reading: parseFloat(readingData.opening_reading),
        closing_reading: parseFloat(readingData.closing_reading),
        testing_qty: parseFloat(readingData.testing_qty || 0),
        rate: parseFloat(readingData.rate),
        sales_amount: parseFloat(readingData.sales_amount)
    };

    // Try shift_nozzle_readings
    let res = await supabase
        .from('shift_nozzle_readings')
        .upsert(payload, { onConflict: 'shift_id, nozzle_id' });

    if (res.error) {
        // Try shift_readings with net_sale_qty
        const netQty = payload.closing_reading - payload.opening_reading - payload.testing_qty;
        res = await supabase
            .from('shift_readings')
            .upsert({
                shift_id: shiftId,
                nozzle_id: payload.nozzle_id,
                opening_reading: payload.opening_reading,
                closing_reading: payload.closing_reading,
                testing_qty: payload.testing_qty,
                net_sale_qty: netQty
            }, { onConflict: 'shift_id, nozzle_id' });
    }

    // Fallback: save to local active shift cache if remote table constraints conflict
    try {
        const key = `petrocorp_shift_${shiftId}_readings`;
        const stored = JSON.parse(localStorage.getItem(key) || '{}');
        stored[readingData.nozzle_id] = payload;
        localStorage.setItem(key, JSON.stringify(stored));
    } catch {}

    return res;
}

export async function saveShiftPayments(shiftId, paymentsMap) {
    try {
        const records = paymentsMap.map(p => ({
            shift_id: shiftId,
            payment_method_id: p.payment_method_id,
            amount: parseFloat(p.amount || 0)
        }));

        await supabase
            .from('shift_payments')
            .upsert(records, { onConflict: 'shift_id, payment_method_id' });
    } catch {}

    // Also cache locally
    try {
        localStorage.setItem(`petrocorp_shift_${shiftId}_payments`, JSON.stringify(paymentsMap));
    } catch {}
}

export async function submitShift(shiftId, { totalSales, totalDeductions, extraShort, notes }) {
    // Try update with is_closed
    let res = await supabase
        .from('shifts')
        .update({
            total_sales_amount: parseFloat(totalSales),
            short_extra_cash: parseFloat(extraShort),
            is_closed: true,
            status: 'submitted'
        })
        .eq('id', shiftId)
        .select()
        .single();

    if (res.error) {
        // Update without status column
        res = await supabase
            .from('shifts')
            .update({
                total_sales_amount: parseFloat(totalSales),
                short_extra_cash: parseFloat(extraShort),
                is_closed: true
            })
            .eq('id', shiftId)
            .select()
            .single();
    }

    if (res.error) throw res.error;
    return res.data;
}

export async function saveShiftExpense(shiftId, { category_id, amount, description }) {
    const { data, error } = await supabase
        .from('shift_expenses')
        .insert([{
            shift_id: shiftId,
            category_id: category_id || null,
            amount: parseFloat(amount),
            description: description || ''
        }])
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function fetchShiftExpenses(shiftId) {
    const { data, error } = await supabase
        .from('shift_expenses')
        .select('*, expense_categories(name)')
        .eq('shift_id', shiftId)
        .order('id', { ascending: true });
    return data || [];
}

export async function deleteShiftExpense(expenseId) {
    const { error } = await supabase
        .from('shift_expenses')
        .delete()
        .eq('id', expenseId);
    if (error) throw error;
}


export async function saveShiftAsDraft(shiftId, { totalSales, totalDeductions, extraShort, notes }) {
    const { data, error } = await supabase
        .from('shifts')
        .update({
            total_sales_amount: parseFloat(totalSales || 0),
            total_deductions: parseFloat(totalDeductions || 0),
            short_extra_cash: parseFloat(extraShort || 0),
            notes: notes || null,
            status: 'draft'
        })
        .eq('id', shiftId);

    if (error) throw error;
    return data;
}

// ==========================================
// 5. MANAGER SHIFT APPROVALS
// ==========================================

export async function fetchSubmittedShifts() {
    const { data, error } = await supabase
        .from('shifts')
        .select(`
            *,
            shift_types(name),
            profiles:operator_id(full_name)
        `)
        .eq('status', 'submitted')
        .order('date', { ascending: false })
        .order('id', { ascending: false });

    if (error) {
        // Fallback with employees
        const fallback = await supabase
            .from('shifts')
            .select(`
                *,
                shift_types(name),
                employees:operator_id(full_name)
            `)
            .eq('status', 'submitted')
            .order('date', { ascending: false });
        return fallback.data || [];
    }
    return data || [];
}

export async function fetchShiftFullDetails(shiftId) {
    const { data, error } = await supabase
        .from('shifts')
        .select(`
            *,
            shift_types(name),
            profiles:operator_id(full_name),
            shift_rate_snapshots(rate, fuel_types(name)),
            shift_nozzle_readings(*, nozzles(name, fuel_types(name))),
            shift_payments(*, payment_methods(name)),
            shift_expenses(*, expense_categories(name)),
            credit_transactions(*, customers(name), fuel_types(name))
        `)
        .eq('id', shiftId)
        .single();

    if (error) throw error;
    return data;
}

export async function approveShift(shiftId, managerId) {
    // 1. Mark shift approved
    const { error: shiftErr } = await supabase
        .from('shifts')
        .update({
            status: 'approved',
            approved_by: managerId,
            approved_at: new Date().toISOString()
        })
        .eq('id', shiftId);

    if (shiftErr) throw shiftErr;

    // 2. Advance nozzle master readings based on shift closing readings
    const { data: readings } = await supabase
        .from('shift_nozzle_readings')
        .select('nozzle_id, closing_reading')
        .eq('shift_id', shiftId);

    if (readings && readings.length > 0) {
        for (const r of readings) {
            await supabase
                .from('nozzles')
                .update({ master_reading: r.closing_reading })
                .eq('id', r.nozzle_id);
        }
    }
}

export async function rejectShift(shiftId, managerId, reason) {
    const { error } = await supabase
        .from('shifts')
        .update({
            status: 'rejected',
            rejection_reason: reason,
            approved_by: managerId
        })
        .eq('id', shiftId);

    if (error) throw error;
}

// ==========================================
// 6. UDHAARI (CREDIT) MANAGEMENT & LEDGER
// ==========================================

export async function fetchCustomers() {
    let localCustomers = JSON.parse(localStorage.getItem('petrocorp_customers') || '[]');
    let localTxs = JSON.parse(localStorage.getItem('petrocorp_credit_transactions') || '[]');

    try {
        // 1. Try precomputed customer_balances view
        const { data: viewData, error: viewErr } = await supabase
            .from('customer_balances')
            .select('*')
            .order('name');

        if (!viewErr && viewData && viewData.length > 0) {
            localStorage.setItem('petrocorp_customers', JSON.stringify(viewData));
            return viewData;
        }

        // 2. Fallback to raw customers table and compute balances dynamically
        const { data: rawCustomers, error: custErr } = await supabase
            .from('customers')
            .select('*')
            .order('name');

        if (!custErr && rawCustomers && rawCustomers.length > 0) {
            const { data: dbTxs } = await supabase.from('credit_transactions').select('*');
            const allTxs = (dbTxs && dbTxs.length > 0) ? dbTxs : localTxs;

            const computed = rawCustomers.map(c => {
                const cTxs = allTxs.filter(t => parseInt(t.customer_id) === parseInt(c.id));
                const sales = cTxs.filter(t => t.type === 'sale').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
                const repayments = cTxs.filter(t => t.type === 'repayment').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
                const openBal = parseFloat(c.opening_balance || 0);
                return {
                    ...c,
                    total_credit_sales: sales,
                    total_repayments: repayments,
                    outstanding_balance: openBal + sales - repayments
                };
            });
            localStorage.setItem('petrocorp_customers', JSON.stringify(computed));
            return computed;
        }
    } catch (err) {
        console.warn('Notice loading customers from DB:', err);
    }

    // 3. Fallback to local cache with computed balances
    if (localCustomers.length > 0) {
        return localCustomers.map(c => {
            const cTxs = localTxs.filter(t => parseInt(t.customer_id) === parseInt(c.id));
            const sales = cTxs.filter(t => t.type === 'sale').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
            const repayments = cTxs.filter(t => t.type === 'repayment').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
            const openBal = parseFloat(c.opening_balance || 0);
            return {
                ...c,
                total_credit_sales: sales,
                total_repayments: repayments,
                outstanding_balance: openBal + sales - repayments
            };
        });
    }

    return [];
}

export async function createCustomer({ name, vehicle_number, contact_info, opening_balance }) {
    const newCust = {
        name: name.trim().toUpperCase(),
        vehicle_number: vehicle_number ? vehicle_number.trim().toUpperCase() : null,
        contact_info: contact_info ? contact_info.trim() : null,
        opening_balance: parseFloat(opening_balance || 0),
        is_active: true
    };

    let created = null;
    try {
        const { data, error } = await supabase
            .from('customers')
            .insert([newCust])
            .select()
            .single();
        if (!error && data) created = data;
    } catch (err) {
        console.warn('Notice creating customer in DB:', err);
    }

    const localCustomers = JSON.parse(localStorage.getItem('petrocorp_customers') || '[]');
    const nextId = created ? created.id : (localCustomers.reduce((max, c) => Math.max(max, parseInt(c.id) || 0), 0) + 1);
    const finalized = created || { ...newCust, id: nextId, created_at: new Date().toISOString() };

    finalized.total_credit_sales = 0;
    finalized.total_repayments = 0;
    finalized.outstanding_balance = finalized.opening_balance;

    localCustomers.push(finalized);
    localStorage.setItem('petrocorp_customers', JSON.stringify(localCustomers));
    return finalized;
}

export async function recordCreditTransaction({
    customer_id,
    shift_id,
    type,
    fuel_type_id,
    quantity,
    rate,
    amount,
    vehicle_number,
    payment_method_id,
    recorded_by,
    notes
}) {
    const tx = {
        customer_id: parseInt(customer_id),
        shift_id: shift_id ? parseInt(shift_id) : null,
        type, // 'sale' or 'repayment'
        fuel_type_id: fuel_type_id ? parseInt(fuel_type_id) : null,
        quantity: quantity ? parseFloat(quantity) : null,
        rate: rate ? parseFloat(rate) : null,
        amount: parseFloat(amount),
        vehicle_number: vehicle_number ? vehicle_number.trim().toUpperCase() : null,
        payment_method_id: payment_method_id ? parseInt(payment_method_id) : null,
        recorded_by,
        notes: notes || null
    };

    let created = null;
    try {
        const { data, error } = await supabase
            .from('credit_transactions')
            .insert([tx])
            .select()
            .single();
        if (!error && data) created = data;
    } catch (err) {
        console.warn('Notice recording credit transaction in DB:', err);
    }

    const localTxs = JSON.parse(localStorage.getItem('petrocorp_credit_transactions') || '[]');
    const nextId = created ? created.id : (localTxs.reduce((max, t) => Math.max(max, parseInt(t.id) || 0), 0) + 1);
    const finalized = created || { ...tx, id: nextId, created_at: new Date().toISOString() };

    localTxs.push(finalized);
    localStorage.setItem('petrocorp_credit_transactions', JSON.stringify(localTxs));
    return finalized;
}

export async function fetchShiftCredits(shiftId) {
    if (!shiftId) return [];
    try {
        const { data, error } = await supabase
            .from('credit_transactions')
            .select('*')
            .eq('shift_id', parseInt(shiftId))
            .eq('type', 'sale');
        if (!error && data && data.length > 0) return data;
    } catch {}

    const localTxs = JSON.parse(localStorage.getItem('petrocorp_credit_transactions') || '[]');
    return localTxs.filter(t => parseInt(t.shift_id) === parseInt(shiftId) && t.type === 'sale');
}

export async function deleteCreditTransaction(txId) {
    try {
        await supabase.from('credit_transactions').delete().eq('id', parseInt(txId));
    } catch {}
    const localTxs = JSON.parse(localStorage.getItem('petrocorp_credit_transactions') || '[]');
    const filtered = localTxs.filter(t => parseInt(t.id) !== parseInt(txId));
    localStorage.setItem('petrocorp_credit_transactions', JSON.stringify(filtered));
    return true;
}

export async function fetchCustomerHistory(customerId) {
    const cId = parseInt(customerId);
    let txs = [];
    try {
        const { data, error } = await supabase
            .from('credit_transactions')
            .select('*')
            .eq('customer_id', cId)
            .order('created_at', { ascending: false });
        if (!error && data && data.length > 0) txs = data;
    } catch {}

    if (txs.length === 0) {
        const localTxs = JSON.parse(localStorage.getItem('petrocorp_credit_transactions') || '[]');
        txs = localTxs.filter(t => parseInt(t.customer_id) === cId);
    }

    return txs.map(t => {
        const fuelName = t.fuel_type_id === 1 ? 'Petrol (MS)' : (t.fuel_type_id === 2 ? 'Diesel (HSD)' : (t.fuel_type || '-'));
        const modeMap = { 1: 'Cash', 2: 'Credit Card', 3: 'Paytm QR', 4: 'BharatPe QR', 5: 'PhonePe QR', 7: 'Bank Transfer / Cheque' };
        return {
            ...t,
            fuel_types: { name: fuelName },
            payment_methods: { name: modeMap[t.payment_method_id] || 'Cash' }
        };
    });
}

// ==========================================
// 7. TANKS, DIPS & FUEL RECEIPTS
// ==========================================

export async function saveTankDip({ date, tank_id, dip_reading_mm, water_dip_mm, calculated_litres, recorded_by }) {
    const payload = {
        date,
        tank_id: parseInt(tank_id),
        dip_reading_mm: parseFloat(dip_reading_mm || 0),
        water_dip_mm: parseFloat(water_dip_mm || 0),
        calculated_litres: parseFloat(calculated_litres),
        recorded_by
    };

    let res = await supabase
        .from('tank_dip_readings')
        .upsert(payload, { onConflict: 'date, tank_id' });

    if (res.error) {
        // Fallback to tank_readings
        res = await supabase
            .from('tank_readings')
            .upsert({
                date,
                tank_id: parseInt(tank_id),
                fuel_dip: parseFloat(dip_reading_mm || 0),
                water_dip: parseFloat(water_dip_mm || 0),
                calculated_stock: parseFloat(calculated_litres)
            }, { onConflict: 'date, tank_id' });
    }

    if (res.error) throw res.error;
    return res;
}

export async function saveFuelReceipt({ date, tank_id, quantity_litres, invoice_number, recorded_by }) {
    const payload = {
        date,
        tank_id: parseInt(tank_id),
        quantity_litres: parseFloat(quantity_litres),
        invoice_number: invoice_number || null,
        recorded_by
    };

    let res = await supabase
        .from('fuel_receipts')
        .insert([payload]);

    if (res.error) {
        // Fallback to fuel_deliveries
        res = await supabase
            .from('fuel_deliveries')
            .insert([{
                date,
                tank_id: parseInt(tank_id),
                receipt_quantity: parseFloat(quantity_litres)
            }]);
    }

    if (res.error) throw res.error;
    return res;
}

export async function fetchTankDipsForDate(date) {
    const { data, error } = await supabase
        .from('tank_dip_readings')
        .select('*, tanks(id, name, capacity_litres, fuel_types(id, name))')
        .eq('date', date);

    if (error || !data) {
        const fallback = await supabase
            .from('tank_readings')
            .select('*, tanks(id, name, capacity, fuel_types(id, name))')
            .eq('date', date);
        return fallback.data || [];
    }
    return data || [];
}

export async function fetchFuelReceiptsForDate(date) {
    const { data, error } = await supabase
        .from('fuel_receipts')
        .select('*, tanks(id, name, fuel_types(id, name))')
        .eq('date', date);

    if (error || !data) {
        const fallback = await supabase
            .from('fuel_deliveries')
            .select('*, tanks(id, name, fuel_types(id, name))')
            .eq('date', date);
        return fallback.data || [];
    }
    return data || [];
}

// ==========================================
// 8. DSSR & REPORT GENERATION ENGINE
// ==========================================

export async function generateDSSRData(date) {
    // 1. Get yesterday's date
    const targetDate = new Date(date);
    const prevDateObj = new Date(targetDate);
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = prevDateObj.toISOString().split('T')[0];

    // 2. Fetch Fuel Types
    const fuelTypes = await fetchFuelTypes();

    // 3. Fetch Nozzles
    const nozzles = await fetchNozzles();

    // 4. Fetch Tanks
    const tanks = await fetchTanks();

    // 5. Fetch all shift readings for this date
    const { data: shiftsToday } = await supabase
        .from('shifts')
        .select('id, status')
        .eq('date', date);

    const shiftIds = (shiftsToday || []).map(s => s.id);

    let nozzleReadings = [];
    if (shiftIds.length > 0) {
        const { data: readings } = await supabase
            .from('shift_nozzle_readings')
            .select('*, nozzles(id, name, fuel_type_id)')
            .in('shift_id', shiftIds);
        
        if (readings && readings.length > 0) {
            nozzleReadings = readings;
        } else {
            // fallback
            const { data: fbReadings } = await supabase
                .from('shift_readings')
                .select('*, nozzles(id, name, fuel_type_id)')
                .in('shift_id', shiftIds);
            nozzleReadings = fbReadings || [];
        }
    }

    // 6. Fetch Today and Yesterday's Tank Dips
    const todayDips = await fetchTankDipsForDate(date);
    const yesterdayDips = await fetchTankDipsForDate(prevDate);

    // 7. Fetch Today's Fuel Receipts
    const todayReceipts = await fetchFuelReceiptsForDate(date);

    // 8. Fetch Today's Daily Rates
    const todayRates = await fetchDailyRates(date);

    // 9. Build per-fuel-type DSSR objects
    const dssrResults = fuelTypes.map(ft => {
        // Filter nozzles for this fuel type
        const ftNozzles = nozzles.filter(n => n.fuel_type_id === ft.id);
        
        // Sum pump readings
        const pumpSales = ftNozzles.map(n => {
            const readingsForNozzle = nozzleReadings.filter(r => r.nozzle_id === n.id);
            const totalGross = readingsForNozzle.reduce((sum, r) => sum + (parseFloat(r.closing_reading) - parseFloat(r.opening_reading) || 0), 0);
            const totalTesting = readingsForNozzle.reduce((sum, r) => sum + (parseFloat(r.testing_qty) || 0), 0);
            const totalNet = Math.max(0, totalGross - totalTesting);
            const opening = readingsForNozzle.length > 0 ? readingsForNozzle[0].opening_reading : n.master_reading;
            const closing = readingsForNozzle.length > 0 ? readingsForNozzle[readingsForNozzle.length - 1].closing_reading : n.master_reading;

            return {
                nozzle_name: n.name,
                opening,
                closing,
                gross: totalGross,
                testing: totalTesting,
                net_sales: totalNet
            };
        });

        const totalMeterSales = pumpSales.reduce((sum, p) => sum + p.net_sales, 0);

        // Filter tanks for this fuel type
        const ftTanks = tanks.filter(t => t.fuel_type_id === ft.id);
        let totalOpeningStock = 0;
        let totalClosingStock = 0;

        const tankDetails = ftTanks.map(t => {
            // Opening stock is yesterday's dip or tank's current stock
            const yDip = yesterdayDips.find(d => d.tank_id === t.id);
            const tDip = todayDips.find(d => d.tank_id === t.id);

            const openStock = yDip ? parseFloat(yDip.calculated_litres || yDip.calculated_stock || 0) : parseFloat(t.current_stock_litres || 0);
            const closeStock = tDip ? parseFloat(tDip.calculated_litres || tDip.calculated_stock || 0) : openStock;

            totalOpeningStock += openStock;
            totalClosingStock += closeStock;

            return {
                tank_name: t.name,
                opening_stock: openStock,
                closing_stock: closeStock,
                fuel_dip_mm: tDip ? (tDip.dip_reading_mm || tDip.fuel_dip || 0) : 0,
                water_dip_mm: tDip ? (tDip.water_dip_mm || tDip.water_dip || 0) : 0
            };
        });

        // Fuel receipts for this fuel type
        const ftReceipts = todayReceipts.filter(r => {
            const tank = tanks.find(t => t.id === r.tank_id);
            return tank && tank.fuel_type_id === ft.id;
        });
        const totalReceipts = ftReceipts.reduce((sum, r) => sum + (parseFloat(r.quantity_litres || r.receipt_quantity || 0)), 0);

        // Calculate Stock Sales & Variation
        // stock_sales = (opening + receipts) - closing
        const stockSales = (totalOpeningStock + totalReceipts) - totalClosingStock;
        const stockVariation = totalMeterSales - stockSales;

        const rateObj = todayRates.find(r => r.fuel_type_id === ft.id);
        const rate = rateObj ? parseFloat(rateObj.rate) : 0;
        const totalRevenue = totalMeterSales * rate;

        return {
            fuel_type: ft.name,
            display_name: ft.display_name,
            rate,
            pump_sales: pumpSales,
            total_meter_sales: totalMeterSales,
            tank_details: tankDetails,
            total_opening_stock: totalOpeningStock,
            total_receipts: totalReceipts,
            total_closing_stock: totalClosingStock,
            stock_sales: stockSales,
            stock_variation: stockVariation,
            total_revenue: totalRevenue
        };
    });

    return {
        date,
        previous_date: prevDate,
        fuel_results: dssrResults
    };
}

// ==========================================
// 9. GENERIC DATABASE CONSOLE (MANAGER CRUD)
// ==========================================

/** Known PetroCorp tables for the Database Console */
const KNOWN_TABLES = [
    { name: 'profiles', display: 'Profiles (Users)', icon: '👥' },
    { name: 'fuel_types', display: 'Fuel Types', icon: '⛽' },
    { name: 'pumps', display: 'Pumps', icon: '🔧' },
    { name: 'nozzles', display: 'Nozzles / Dispensers', icon: '⛽' },
    { name: 'tanks', display: 'Tanks', icon: '🛢️' },
    { name: 'payment_methods', display: 'Payment Methods', icon: '💳' },
    { name: 'shift_types', display: 'Shift Types', icon: '🕐' },
    { name: 'expense_categories', display: 'Expense Categories', icon: '📂' },
    { name: 'customers', display: 'Customers (Udhaari)', icon: '📘' },
    { name: 'station_settings', display: 'Station Settings', icon: '⚙️' },
    { name: 'operator_nozzle_assignments', display: 'Operator Assignments', icon: '🔗' },
    { name: 'daily_rates', display: 'Daily Fuel Rates', icon: '💵' },
    { name: 'shifts', display: 'Shifts', icon: '📋' },
    { name: 'shift_rate_snapshots', display: 'Shift Rate Snapshots', icon: '📸' },
    { name: 'shift_nozzle_readings', display: 'Nozzle Readings', icon: '📊' },
    { name: 'shift_payments', display: 'Shift Payments', icon: '💰' },
    { name: 'shift_expenses', display: 'Shift Expenses', icon: '🧾' },
    { name: 'credit_transactions', display: 'Credit Transactions', icon: '💳' },
    { name: 'tank_dip_readings', display: 'Tank Dip Readings', icon: '📏' },
    { name: 'fuel_receipts', display: 'Fuel Receipts / Deliveries', icon: '🚛' }
];

export function listAvailableTables() {
    return KNOWN_TABLES;
}

export async function fetchTableData(tableName, { limit = 100, offset = 0, orderBy = 'id', ascending = false } = {}) {
    const { data, error, count } = await supabase
        .from(tableName)
        .select('*', { count: 'exact' })
        .order(orderBy, { ascending })
        .range(offset, offset + limit - 1);

    if (error) throw error;
    return { rows: data || [], totalCount: count || 0 };
}

export async function fetchTableRowById(tableName, id, idColumn = 'id') {
    const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq(idColumn, id)
        .single();

    if (error) throw error;
    return data;
}

export async function insertTableRow(tableName, rowData) {
    const { data, error } = await supabase
        .from(tableName)
        .insert([rowData])
        .select()
        .single();

    if (error) throw error;

    // Invalidate related local caches
    invalidateLocalCache(tableName);
    return data;
}

export async function updateTableRow(tableName, id, updates, idColumn = 'id') {
    const { data, error } = await supabase
        .from(tableName)
        .update(updates)
        .eq(idColumn, id)
        .select()
        .single();

    if (error) throw error;

    invalidateLocalCache(tableName);
    return data;
}

export async function deleteTableRow(tableName, id, idColumn = 'id') {
    const { error } = await supabase
        .from(tableName)
        .delete()
        .eq(idColumn, id);

    if (error) throw error;

    invalidateLocalCache(tableName);
    return true;
}

/** Clear any localStorage caches related to the given table */
function invalidateLocalCache(tableName) {
    try {
        const cacheMap = {
            'nozzles': ['petrocorp_custom_nozzles'],
            'customers': ['petrocorp_customers'],
            'credit_transactions': ['petrocorp_credit_transactions'],
            'operator_nozzle_assignments': ['petrocorp_operator_pump_assignments']
        };
        const keys = cacheMap[tableName];
        if (keys) keys.forEach(k => localStorage.removeItem(k));

        // Clear daily rates caches
        if (tableName === 'daily_rates') {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && key.startsWith('petrocorp_daily_rates_')) {
                    localStorage.removeItem(key);
                }
            }
        }
    } catch {}
}
