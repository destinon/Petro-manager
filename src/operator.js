/**
 * PetroCorp Station Management - Operator Shift Controller
 */
import {
    fetchActiveShift,
    createShift,
    fetchNozzles,
    fetchNozzlesForOperator,
    createNozzle,
    updateNozzle,
    deleteNozzle,
    fetchShiftTypes,
    fetchPaymentMethods,
    fetchExpenseCategories,
    fetchCustomers,
    fetchDailyRates,
    saveNozzleReading,
    saveShiftPayments,
    saveShiftExpense,
    fetchShiftExpenses,
    deleteShiftExpense,
    recordCreditTransaction,
    fetchShiftCredits,
    deleteCreditTransaction,
    submitShift,
    saveShiftAsDraft
} from './services/api.js';
import {
    calculateGrossQuantity,
    calculateNetQuantity,
    calculateSalesAmount,
    validateReadings,
    calculateExtraShort,
    calculateTotalCollections,
    calculateTotalDeductions
} from './calculations/calculations.js';
import { formatCurrency, formatLitres, getTodayDateString } from './utils/formatters.js';
import { toast } from './utils/toast.js';

let appState = null;
let shiftState = {
    shiftId: null,
    date: null,
    shiftTypeName: '',
    rates: { MS: 0, HSD: 0 },
    nozzles: [],
    readings: {}, // nozzleId -> { opening, closing, testing, net, amount, valid }
    payments: {}, // methodId -> amount
    expenses: [],
    credits: [],
    customers: [],
    paymentMethods: [],
    expenseCategories: []
};

export async function initOperatorDashboard(state) {
    appState = state;
    setupOperatorTabNavigation();
    setupOperatorForms();

    await loadStationReferenceData();
    await checkOrRestoreActiveShift();
}

function setupOperatorTabNavigation() {
    const tabButtons = document.querySelectorAll('[data-op-tab]');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-op-tab');
            switchOperatorTab(targetId);
        });
    });

    // Quick action buttons in summary bar
    document.getElementById('bar-quick-save-btn')?.addEventListener('click', () => handleSaveShift(false));
    document.getElementById('bar-quick-submit-btn')?.addEventListener('click', () => handleSaveShift(true));
    document.getElementById('save-all-readings-btn')?.addEventListener('click', saveAllMeterReadings);
    document.getElementById('op-add-pump-btn')?.addEventListener('click', openAddPumpModal);
    document.getElementById('op-manage-pumps-btn')?.addEventListener('click', openManagePumpsModal);
    document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
    document.getElementById('save-draft-btn')?.addEventListener('click', () => handleSaveShift(false));
    document.getElementById('submit-shift-btn')?.addEventListener('click', () => handleSaveShift(true));
}

function switchOperatorTab(tabId) {
    document.querySelectorAll('.op-tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('[data-op-tab]').forEach(b => b.classList.remove('active'));

    const targetSection = document.getElementById(tabId);
    if (targetSection) targetSection.classList.remove('hidden');

    const activeBtn = document.querySelector(`[data-op-tab="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    if (tabId === 'recon-view') {
        recalculateShiftTotals();
    }
}

async function loadStationReferenceData() {
    try {
        const [customers, methods, categories] = await Promise.all([
            fetchCustomers(),
            fetchPaymentMethods(),
            fetchExpenseCategories()
        ]);

        shiftState.customers = customers || [];
        shiftState.paymentMethods = methods || [];
        shiftState.expenseCategories = categories || [];

        populateCustomerDropdown();
        populateExpenseCategoriesDropdown();
        renderPaymentMethodInputs();
    } catch (err) {
        console.error('Failed to load operator reference data:', err);
    }
}

function populateCustomerDropdown() {
    const select = document.getElementById('cred-customer');
    if (!select) return;
    select.innerHTML = '<option value="">Choose customer...</option>';
    shiftState.customers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} ${c.vehicle_number ? `(${c.vehicle_number})` : ''}`;
        select.appendChild(opt);
    });
}

function populateExpenseCategoriesDropdown() {
    const select = document.getElementById('exp-category');
    if (!select) return;
    select.innerHTML = '<option value="">Select category...</option>';
    shiftState.expenseCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        select.appendChild(opt);
    });
}

function renderPaymentMethodInputs() {
    const container = document.getElementById('payment-methods-grid');
    if (!container) return;
    container.innerHTML = '';

    shiftState.paymentMethods.forEach(pm => {
        const wrap = document.createElement('div');
        wrap.className = 'form-group';
        wrap.style.marginBottom = '8px';
        wrap.innerHTML = `
            <label style="display: flex; justify-content: space-between;">
                <span>${pm.name}</span>
                <span class="mono" style="color: var(--text-muted); font-size: 0.8rem;">Amount</span>
            </label>
            <div class="input-icon-group">
                <span class="icon">₹</span>
                <input type="number" step="0.01" class="recon-payment-input" 
                       data-method-id="${pm.id}" 
                       placeholder="0.00" 
                       value="${shiftState.payments[pm.id] || ''}">
            </div>
        `;

        const input = wrap.querySelector('input');
        input.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) || 0;
            shiftState.payments[pm.id] = val;
            recalculateShiftTotals();
        });

        container.appendChild(wrap);
    });
}

async function checkOrRestoreActiveShift() {
    const today = getTodayDateString();
    try {
        const activeShift = await fetchActiveShift(appState.currentUser.id, today);

        if (activeShift) {
            setupActiveShiftView(activeShift);
        } else {
            // Show setup panel
            document.getElementById('shift-setup-panel')?.classList.remove('hidden');
            document.getElementById('shift-active-panel')?.classList.add('hidden');
            await setupShiftCreationOptions(today);
        }
    } catch (err) {
        console.error('Error checking active shift:', err);
        toast.error('Unable to verify active shift status.');
    }
}

async function setupShiftCreationOptions(today) {
    const typeSelect = document.getElementById('op-shift-type');
    const ratesInfo = document.getElementById('shift-init-rates');
    const startBtn = document.getElementById('start-shift-btn');

    const [types, rates] = await Promise.all([
        fetchShiftTypes(),
        fetchDailyRates(today)
    ]);

    if (typeSelect && types) {
        typeSelect.innerHTML = types.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }

    if (!rates || rates.length === 0) {
        if (ratesInfo) {
            ratesInfo.innerHTML = `
                <div class="alert-box alert-error" style="margin-top: 8px;">
                    <strong>⚠️ Daily Fuel Rates Not Published</strong><br>
                    Fuel rates for today (${today}) have not been entered by the Station Manager.<br>
                    <small>Please contact the Station Manager to publish today's MS & HSD rates before starting this shift.</small>
                </div>
            `;
        }
        shiftState.rates = { MS: 0, HSD: 0 };
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.textContent = 'Awaiting Manager Daily Rates';
            startBtn.style.opacity = '0.5';
            startBtn.onclick = null;
        }
    } else {
        rates.forEach(r => {
            const name = r.fuel_types?.name?.toUpperCase();
            if (name === 'MS') shiftState.rates.MS = parseFloat(r.rate);
            if (name === 'HSD') shiftState.rates.HSD = parseFloat(r.rate);
        });
        if (ratesInfo) {
            ratesInfo.innerHTML = `
                <span style="color: var(--success); font-weight: 700;">✓ Today's Manager-Entered Rates:</span> 
                MS: <strong>${formatCurrency(shiftState.rates.MS)}</strong> • HSD: <strong>${formatCurrency(shiftState.rates.HSD)}</strong>
            `;
        }
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.textContent = 'Open Shift & Load Meters';
            startBtn.style.opacity = '1';
            startBtn.onclick = handleStartShift;
        }
    }
}

async function handleStartShift() {
    const typeSelect = document.getElementById('op-shift-type');
    const startBtn = document.getElementById('start-shift-btn');
    const shiftTypeId = typeSelect ? parseInt(typeSelect.value) : 1;
    const today = getTodayDateString();

    if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = 'Initializing Shift...';
    }

    try {
        const rates = [
            { fuel_type_id: 1, rate: shiftState.rates.MS || 104.50 },
            { fuel_type_id: 2, rate: shiftState.rates.HSD || 92.80 }
        ];

        const shift = await createShift({
            date: today,
            shift_type_id: shiftTypeId,
            operator_id: appState.currentUser.id,
            rates
        });

        toast.success('Shift initiated successfully!');
        await checkOrRestoreActiveShift();
    } catch (err) {
        console.error('Error starting shift:', err);
        toast.error('Failed to create shift: ' + err.message);
    } finally {
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.textContent = 'Open Shift & Load Meters';
        }
    }
}

async function setupActiveShiftView(shift) {
    shiftState.activeShift = shift;
    shiftState.shiftId = shift.id;
    shiftState.date = shift.date;
    shiftState.shiftTypeName = shift.shift_types?.name || 'Standard Shift';

    // Extract snapshot rates
    if (shift.shift_rate_snapshots && shift.shift_rate_snapshots.length > 0) {
        shift.shift_rate_snapshots.forEach(s => {
            const name = s.fuel_types?.name?.toUpperCase();
            if (name === 'MS') shiftState.rates.MS = parseFloat(s.rate);
            if (name === 'HSD') shiftState.rates.HSD = parseFloat(s.rate);
        });
    }

    // Update banner
    const badgeName = document.getElementById('shift-badge-name');
    const badgeDate = document.getElementById('shift-badge-date');
    const rateMsEl = document.getElementById('shift-rate-ms');
    const rateHsdEl = document.getElementById('shift-rate-hsd');

    if (badgeName) badgeName.textContent = shiftState.shiftTypeName;
    if (badgeDate) badgeDate.textContent = shiftState.date;
    if (rateMsEl) rateMsEl.textContent = formatCurrency(shiftState.rates.MS);
    if (rateHsdEl) rateHsdEl.textContent = formatCurrency(shiftState.rates.HSD);

    document.getElementById('shift-setup-panel')?.classList.add('hidden');
    document.getElementById('shift-active-panel')?.classList.remove('hidden');

    // Load Nozzles
    await loadNozzleCards(shift);
    // Load Shift Expenses
    await loadExistingExpenses();
    // Load Shift Credits
    await loadExistingCredits();

    recalculateShiftTotals();
}

async function loadNozzleCards(shift) {
    const container = document.getElementById('nozzles-container');
    if (!container) return;
    container.innerHTML = '<p>Loading dispenser nozzles...</p>';

    try {
        const assignedNozzles = await fetchNozzlesForOperator(appState?.currentUser?.id);
        const nozzles = (assignedNozzles && assignedNozzles.length > 0) ? assignedNozzles : [];
        shiftState.nozzles = nozzles;
        container.innerHTML = '';

        if (!nozzles || nozzles.length === 0) {
            container.innerHTML = `
                <div class="card" style="padding: 36px 20px; text-align: center; grid-column: 1 / -1; background: var(--bg-surface);">
                    <div style="font-size: 2.4rem; margin-bottom: 12px;">🔒</div>
                    <h3 style="font-size: 1.25rem; margin-bottom: 8px;">No Dispenser Pumps Assigned</h3>
                    <p style="color: var(--text-secondary); max-width: 460px; margin: 0 auto 16px; font-size: 0.92rem;">
                        The Station Manager has not assigned any dispenser bays or nozzles to your account.
                        You only have access to your assigned pumps. Please request your manager to assign your pumps in the Manager Workstation.
                    </p>
                </div>
            `;
            return;
        }

        const existingReadings = shift.shift_nozzle_readings || [];
        const activeNozzles = nozzles.filter(n => n.is_active !== false);

        activeNozzles.forEach(nozzle => {
            const fuelName = nozzle.fuel_types?.name?.toUpperCase() || (nozzle.name.includes('MS') ? 'MS' : 'HSD');
            const rate = fuelName === 'MS' ? shiftState.rates.MS : shiftState.rates.HSD;
            const existing = existingReadings.find(r => r.nozzle_id === nozzle.id);

            const openingReading = existing ? parseFloat(existing.opening_reading) : parseFloat(nozzle.master_reading || 0);
            const closingReading = existing ? parseFloat(existing.closing_reading) : '';
            const testingQty = existing ? parseFloat(existing.testing_qty) : 0;

            shiftState.readings[nozzle.id] = {
                opening: openingReading,
                closing: closingReading,
                testing: testingQty,
                fuelName,
                rate
            };

            const card = document.createElement('div');
            card.className = 'nozzle-card';
            card.id = `nozzle-card-${nozzle.id}`;

            const badgeClass = fuelName === 'MS' ? 'fuel-ms' : 'fuel-hsd';

            card.innerHTML = `
                <div class="nozzle-header">
                    <div class="nozzle-title" style="display: flex; align-items: center; gap: 8px;">
                        <span>⛽</span>
                        <span>${nozzle.name}</span>
                        <button class="btn btn-icon op-card-edit-btn" data-edit-nozzle="${nozzle.id}" title="Edit ${nozzle.name} & Reading History" style="padding: 2px 6px; font-size: 0.85rem; border-radius: 4px; border: 1px solid var(--border-subtle); background: var(--bg-surface-muted); cursor: pointer;">
                            ✏️
                        </button>
                    </div>
                    <span class="badge-fuel ${badgeClass}">${fuelName} @ ${formatCurrency(rate)}</span>
                </div>

                <div class="reading-preview">
                    <span class="reading-preview-label">Opening Meter:</span>
                    <span class="reading-preview-value mono">${openingReading.toFixed(2)}</span>
                </div>

                <div class="form-group" style="margin-bottom: 10px;">
                    <label for="close-${nozzle.id}">Closing Meter Reading</label>
                    <input type="number" step="0.01" id="close-${nozzle.id}" 
                           class="mono" placeholder="Enter reading" 
                           value="${closingReading !== '' ? closingReading : ''}">
                </div>

                <div class="form-group" style="margin-bottom: 12px;">
                    <label for="test-${nozzle.id}">Testing Quantity (Litres)</label>
                    <input type="number" step="0.01" id="test-${nozzle.id}" 
                           class="mono" placeholder="0.00" 
                           value="${testingQty}">
                </div>

                <div class="calc-breakdown">
                    <div class="calc-breakdown-item">
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Net Litres:</span>
                        <strong id="net-litres-${nozzle.id}" class="mono">0.00 L</strong>
                    </div>
                    <div class="calc-breakdown-item">
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Sales Amount:</span>
                        <strong id="sales-amt-${nozzle.id}" class="mono">₹0.00</strong>
                    </div>
                </div>

                <div id="nozzle-err-${nozzle.id}" class="alert-box alert-error hidden" style="margin-top: 8px; padding: 6px 10px; font-size: 0.8rem;"></div>
            `;

            // Bind live inputs
            const closeInput = card.querySelector(`#close-${nozzle.id}`);
            const testInput = card.querySelector(`#test-${nozzle.id}`);

            const onReadingChange = () => {
                updateNozzleCalculations(nozzle.id);
                recalculateShiftTotals();
            };

            closeInput.addEventListener('input', onReadingChange);
            testInput.addEventListener('input', onReadingChange);

            // Bind pencil button
            card.querySelector(`[data-edit-nozzle="${nozzle.id}"]`)?.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditPumpModal(nozzle.id);
            });

            container.appendChild(card);
            updateNozzleCalculations(nozzle.id);
        });
    } catch (err) {
        console.error('Error loading nozzles:', err);
        container.innerHTML = '<p style="color:var(--danger)">Failed to load nozzles.</p>';
    }
}

function updateNozzleCalculations(nozzleId) {
    const item = shiftState.readings[nozzleId];
    if (!item) return;

    const closeInput = document.getElementById(`close-${nozzleId}`);
    const testInput = document.getElementById(`test-${nozzleId}`);
    const netEl = document.getElementById(`net-litres-${nozzleId}`);
    const amtEl = document.getElementById(`sales-amt-${nozzleId}`);
    const errEl = document.getElementById(`nozzle-err-${nozzleId}`);

    const closeVal = closeInput ? closeInput.value : '';
    const testVal = testInput ? testInput.value : 0;

    item.closing = closeVal !== '' ? parseFloat(closeVal) : '';
    item.testing = parseFloat(testVal) || 0;

    if (item.closing === '' || isNaN(item.closing)) {
        if (netEl) netEl.textContent = '0.00 L';
        if (amtEl) amtEl.textContent = '₹0.00';
        if (errEl) errEl.classList.add('hidden');
        item.valid = true;
        item.net = 0;
        item.amount = 0;
        return;
    }

    const validation = validateReadings(item.opening, item.closing, item.testing);
    if (!validation.isValid) {
        if (errEl) {
            errEl.textContent = validation.error;
            errEl.classList.remove('hidden');
        }
        if (closeInput) closeInput.classList.add('is-invalid');
        item.valid = false;
        item.net = 0;
        item.amount = 0;
    } else {
        if (errEl) errEl.classList.add('hidden');
        if (closeInput) closeInput.classList.remove('is-invalid');
        item.valid = true;

        const gross = calculateGrossQuantity(item.opening, item.closing);
        const net = calculateNetQuantity(gross, item.testing);
        const amount = calculateSalesAmount(net, item.rate);

        item.net = net;
        item.amount = amount;

        if (netEl) netEl.textContent = formatLitres(net);
        if (amtEl) amtEl.textContent = formatCurrency(amount);
    }
}

async function saveAllMeterReadings() {
    if (!shiftState.shiftId) return;

    const saveBtn = document.getElementById('save-all-readings-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving Readings...';
    }

    try {
        let hasErrors = false;
        const saves = [];

        Object.keys(shiftState.readings).forEach(nozzleId => {
            const r = shiftState.readings[nozzleId];
            if (r.closing !== '' && !isNaN(r.closing)) {
                if (!r.valid) {
                    hasErrors = true;
                    return;
                }
                saves.push(saveNozzleReading(shiftState.shiftId, {
                    nozzle_id: parseInt(nozzleId),
                    opening_reading: r.opening,
                    closing_reading: r.closing,
                    testing_qty: r.testing,
                    rate: r.rate,
                    sales_amount: r.amount
                }));
            }
        });

        if (hasErrors) {
            toast.error('Some meter readings are invalid. Fix red highlighted fields before saving.');
            return;
        }

        if (saves.length === 0) {
            toast.warning('No closing readings entered yet.');
            return;
        }

        await Promise.all(saves);
        toast.success(`Successfully saved meter readings!`);
    } catch (err) {
        console.error('Error saving readings:', err);
        toast.error('Failed to save readings: ' + err.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Save Meter Readings';
        }
    }
}

function setupOperatorForms() {
    // 1. Credit Form
    const credForm = document.getElementById('op-credit-form');
    const credQty = document.getElementById('cred-quantity');
    const credFuel = document.getElementById('cred-fuel');

    const updateCreditCalc = () => {
        const qty = parseFloat(credQty ? credQty.value : 0) || 0;
        const fuel = credFuel ? credFuel.value : 'MS';
        const rate = fuel === 'MS' ? shiftState.rates.MS : shiftState.rates.HSD;
        const amt = calculateSalesAmount(qty, rate);
        const display = document.getElementById('cred-calc-amount');
        if (display) display.textContent = formatCurrency(amt);
    };

    credQty?.addEventListener('input', updateCreditCalc);
    credFuel?.addEventListener('change', updateCreditCalc);

    credForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const customerId = document.getElementById('cred-customer')?.value;
        const vehicle = document.getElementById('cred-vehicle')?.value;
        const fuel = credFuel?.value || 'MS';
        const qty = parseFloat(credQty?.value);

        if (!customerId || isNaN(qty) || qty <= 0) {
            toast.error('Select a customer and enter a valid quantity.');
            return;
        }

        const rate = fuel === 'MS' ? shiftState.rates.MS : shiftState.rates.HSD;
        const amount = calculateSalesAmount(qty, rate);
        const fuelTypeId = fuel === 'MS' ? 1 : 2;

        try {
            await recordCreditTransaction({
                customer_id: customerId,
                shift_id: shiftState.shiftId,
                type: 'sale',
                fuel_type_id: fuelTypeId,
                quantity: qty,
                rate,
                amount,
                vehicle_number: vehicle,
                recorded_by: appState.currentUser.id
            });

            toast.success(`Recorded credit sale of ${formatCurrency(amount)}`);
            credForm.reset();
            updateCreditCalc();
            await loadExistingCredits();
            recalculateShiftTotals();
        } catch (err) {
            toast.error('Failed to log credit: ' + err.message);
        }
    });

    // 2. Expense Form
    const expForm = document.getElementById('op-expense-form');
    expForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const catId = document.getElementById('exp-category')?.value;
        const amount = parseFloat(document.getElementById('exp-amount')?.value);
        const desc = document.getElementById('exp-desc')?.value;

        if (isNaN(amount) || amount <= 0) {
            toast.error('Enter a valid expense amount.');
            return;
        }

        try {
            await saveShiftExpense(shiftState.shiftId, {
                category_id: catId ? parseInt(catId) : null,
                amount,
                description: desc
            });

            toast.success(`Expense of ${formatCurrency(amount)} recorded.`);
            expForm.reset();
            await loadExistingExpenses();
            recalculateShiftTotals();
        } catch (err) {
            toast.error('Failed to record expense: ' + err.message);
        }
    });
}

async function loadExistingExpenses() {
    if (!shiftState.shiftId) return;
    try {
        const expenses = await fetchShiftExpenses(shiftState.shiftId);
        shiftState.expenses = expenses;
        renderExpensesTable();
    } catch (err) {
        console.error('Failed to load expenses:', err);
    }
}

function renderExpensesTable() {
    const tbody = document.getElementById('shift-expenses-tbody');
    if (!tbody) return;

    if (shiftState.expenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No expenses recorded yet.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    shiftState.expenses.forEach(exp => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${exp.expense_categories?.name || 'General'}</td>
            <td>${exp.description || '-'}</td>
            <td class="mono font-weight-bold">${formatCurrency(exp.amount)}</td>
            <td><button class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.78rem;" data-del-exp="${exp.id}">Delete</button></td>
        `;

        tr.querySelector(`[data-del-exp="${exp.id}"]`)?.addEventListener('click', async () => {
            if (confirm(`Remove expense of ${formatCurrency(exp.amount)}?`)) {
                await deleteShiftExpense(exp.id);
                await loadExistingExpenses();
                recalculateShiftTotals();
            }
        });

        tbody.appendChild(tr);
    });
}

async function loadExistingCredits() {
    if (!shiftState.shiftId) return;
    try {
        const credits = await fetchShiftCredits(shiftState.shiftId);
        shiftState.credits = credits || [];
        renderCreditsTable();
    } catch (err) {
        console.error('Failed to load shift credits:', err);
    }
}

function renderCreditsTable() {
    const tbody = document.getElementById('shift-credit-tbody');
    if (!tbody) return;

    if (!shiftState.credits || shiftState.credits.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 18px;">No credit transactions logged during this shift.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    shiftState.credits.forEach(cred => {
        const customer = shiftState.customers.find(c => parseInt(c.id) === parseInt(cred.customer_id));
        const custName = customer?.name || `Customer #${cred.customer_id}`;
        const fuelName = cred.fuel_type_id === 1 ? 'Petrol (MS)' : (cred.fuel_type_id === 2 ? 'Diesel (HSD)' : 'Fuel');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${custName}</strong></td>
            <td>${cred.vehicle_number || '-'}</td>
            <td><span class="badge-fuel ${cred.fuel_type_id === 1 ? 'fuel-ms' : 'fuel-hsd'}">${fuelName}</span></td>
            <td class="mono">${cred.quantity ? `${parseFloat(cred.quantity).toFixed(2)} L` : '-'}</td>
            <td class="mono font-weight-bold" style="color: var(--danger);">${formatCurrency(cred.amount)}</td>
            <td>
                <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.78rem;" data-del-cred="${cred.id}">Delete</button>
            </td>
        `;

        tr.querySelector(`[data-del-cred="${cred.id}"]`)?.addEventListener('click', async () => {
            if (confirm(`Cancel credit sale of ${formatCurrency(cred.amount)} for ${custName}?`)) {
                await deleteCreditTransaction(cred.id);
                await loadExistingCredits();
                recalculateShiftTotals();
            }
        });

        tbody.appendChild(tr);
    });
}

function recalculateShiftTotals() {
    // 1. Total Net Litres & Sales Amount from readings
    let totalLitres = 0;
    let totalSales = 0;

    Object.values(shiftState.readings).forEach(r => {
        if (r.net) totalLitres += r.net;
        if (r.amount) totalSales += r.amount;
    });

    // 2. Total Payment Collections (Cash + Digital)
    let totalCollections = 0;
    Object.values(shiftState.payments).forEach(amt => {
        totalCollections += parseFloat(amt || 0);
    });

    // 3. Total Udhaari / Credit Fuel
    let totalCredit = 0;
    shiftState.credits.forEach(c => {
        totalCredit += parseFloat(c.amount || 0);
    });

    // 4. Total Expenses
    let totalExpenses = 0;
    shiftState.expenses.forEach(e => {
        totalExpenses += parseFloat(e.amount || 0);
    });

    // 5. Total Deductions & Variance
    const totalDeductions = calculateTotalDeductions(totalCollections, totalCredit, totalExpenses);
    const extraShort = calculateExtraShort(totalSales, totalDeductions);

    // Update Bottom Summary Bar
    const barLitres = document.getElementById('bar-litres');
    const barSales = document.getElementById('bar-sales');
    const barDeductions = document.getElementById('bar-deductions');
    const barVariance = document.getElementById('bar-variance');

    if (barLitres) barLitres.textContent = formatLitres(totalLitres);
    if (barSales) barSales.textContent = formatCurrency(totalSales);
    if (barDeductions) barDeductions.textContent = formatCurrency(totalDeductions);

    if (barVariance) {
        const absVal = Math.abs(extraShort);
        if (extraShort > 0) {
            barVariance.textContent = `Short: ${formatCurrency(absVal)}`;
            barVariance.style.color = 'var(--danger)';
        } else if (extraShort < 0) {
            barVariance.textContent = `Extra: ${formatCurrency(absVal)}`;
            barVariance.style.color = 'var(--success)';
        } else {
            barVariance.textContent = 'Balanced: ₹0.00';
            barVariance.style.color = 'var(--text-primary)';
        }
    }

    // Update Recon Tab View
    const recSales = document.getElementById('recon-summary-sales');
    const recCols = document.getElementById('recon-summary-collections');
    const recCred = document.getElementById('recon-summary-credit');
    const recExp = document.getElementById('recon-summary-expenses');
    const recDed = document.getElementById('recon-summary-total-deductions');
    const recVar = document.getElementById('recon-variance-display');
    const recNote = document.getElementById('recon-variance-note');

    if (recSales) recSales.textContent = formatCurrency(totalSales);
    if (recCols) recCols.textContent = formatCurrency(totalCollections);
    if (recCred) recCred.textContent = formatCurrency(totalCredit);
    if (recExp) recExp.textContent = formatCurrency(totalExpenses);
    if (recDed) recDed.textContent = formatCurrency(totalDeductions);

    if (recVar) {
        const absVal = Math.abs(extraShort);
        if (extraShort > 0) {
            recVar.textContent = `- ${formatCurrency(absVal)}`;
            recVar.style.color = 'var(--danger)';
            if (recNote) recNote.textContent = 'Cash shortage detected (Collected less than expected).';
        } else if (extraShort < 0) {
            recVar.textContent = `+ ${formatCurrency(absVal)}`;
            recVar.style.color = 'var(--success)';
            if (recNote) recNote.textContent = 'Surplus / excess cash collected.';
        } else {
            recVar.textContent = '₹0.00';
            recVar.style.color = 'var(--text-primary)';
            if (recNote) recNote.textContent = 'Collections perfectly match meter sales.';
        }
    }

    return { totalLitres, totalSales, totalCollections, totalCredit, totalExpenses, totalDeductions, extraShort };
}

async function handleSaveShift(isSubmitting) {
    if (!shiftState.shiftId) return;

    const totals = recalculateShiftTotals();
    const notes = document.getElementById('shift-notes')?.value || '';

    // Check for reading validation
    let hasInvalidReading = false;
    Object.values(shiftState.readings).forEach(r => {
        if (r.closing !== '' && !r.valid) hasInvalidReading = true;
    });

    if (hasInvalidReading) {
        toast.error('Cannot save: Invalid meter readings detected.');
        return;
    }

    if (isSubmitting) {
        const absVal = Math.abs(totals.extraShort);
        const varianceTxt = totals.extraShort > 0 ? `Shortage of ${formatCurrency(absVal)}` : (totals.extraShort < 0 ? `Surplus of ${formatCurrency(absVal)}` : 'Balanced');
        
        if (!confirm(`Submit shift for manager approval?\n\nTotal Sales: ${formatCurrency(totals.totalSales)}\nAccounted: ${formatCurrency(totals.totalDeductions)}\nVariance: ${varianceTxt}\n\nProceed?`)) {
            return;
        }
    }

    try {
        // 1. Save all readings
        await saveAllMeterReadings();

        // 2. Save payment breakdown
        const paymentsArray = Object.keys(shiftState.payments).map(methodId => ({
            payment_method_id: parseInt(methodId),
            amount: shiftState.payments[methodId] || 0
        }));
        await saveShiftPayments(shiftState.shiftId, paymentsArray);

        // 3. Update shift status & totals
        if (isSubmitting) {
            await submitShift(shiftState.shiftId, {
                totalSales: totals.totalSales,
                totalDeductions: totals.totalDeductions,
                extraShort: totals.extraShort,
                notes
            });
            toast.success('Shift submitted to Station Manager for approval!');
            // Reset to clean state
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            await saveShiftAsDraft(shiftState.shiftId, {
                totalSales: totals.totalSales,
                totalDeductions: totals.totalDeductions,
                extraShort: totals.extraShort,
                notes
            });
            toast.success('Shift progress saved as draft.');
        }
    } catch (err) {
        console.error('Error saving shift:', err);
        toast.error('Failed to save shift: ' + err.message);
    }
}

// ==========================================
// PUMP / NOZZLE MANAGEMENT MODALS (OPERATOR CONSOLE)
// ==========================================

function openModal() {
    document.getElementById('app-modal')?.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('app-modal')?.classList.add('hidden');
}

function openAddPumpModal() {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');

    if (modalTitle) modalTitle.textContent = 'Add New Dispenser Pump / Nozzle';
    if (modalBody) {
        modalBody.innerHTML = `
            <form id="new-pump-form">
                <div class="form-group">
                    <label for="new-pump-name">Pump / Nozzle Label</label>
                    <input type="text" id="new-pump-name" required placeholder="e.g. MS 11, HSD 12, or Bay 3 - Petrol">
                    <small style="color: var(--text-muted); font-size: 0.8rem;">Descriptive name for this dispenser nozzle.</small>
                </div>
                <div class="form-group">
                    <label for="new-pump-fuel">Fuel Grade</label>
                    <select id="new-pump-fuel" required>
                        <option value="1">Petrol (MS)</option>
                        <option value="2">Diesel (HSD)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="new-pump-reading">Initial / Master Meter Reading</label>
                    <input type="number" step="0.01" id="new-pump-reading" required value="0.00" placeholder="0.00">
                    <small style="color: var(--text-muted); font-size: 0.8rem;">Current baseline totalizer reading on the physical pump meter.</small>
                </div>
            </form>
        `;
    }

    if (modalFooter) {
        modalFooter.innerHTML = `
            <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="save-new-pump-btn">➕ Create Pump</button>
        `;

        document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);
        document.getElementById('save-new-pump-btn')?.addEventListener('click', async () => {
            const name = document.getElementById('new-pump-name')?.value.trim();
            const fuelTypeId = document.getElementById('new-pump-fuel')?.value;
            const reading = document.getElementById('new-pump-reading')?.value;

            if (!name) {
                toast.error('Please enter a pump name or label.');
                return;
            }

            if (reading === '' || isNaN(parseFloat(reading))) {
                toast.error('Please enter a valid initial meter reading.');
                return;
            }

            try {
                const created = await createNozzle({
                    name,
                    fuel_type_id: parseInt(fuelTypeId),
                    master_reading: parseFloat(reading)
                });

                toast.success(`Pump "${created.name}" created and added to shift!`);
                closeModal();
                await loadNozzleCards(shiftState.activeShift || { id: shiftState.shiftId });
                recalculateShiftTotals();
            } catch (err) {
                toast.error('Failed to create pump: ' + err.message);
            }
        });
    }

    openModal();
}

async function openEditPumpModal(nozzleId) {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');

    try {
        const nozzles = await fetchNozzles();
        const nozzle = nozzles.find(n => n.id === parseInt(nozzleId));

        if (!nozzle) {
            toast.error('Selected pump not found.');
            return;
        }

        if (modalTitle) modalTitle.textContent = `Edit Dispenser Pump - ${nozzle.name}`;
        if (modalBody) {
            const isMs = (nozzle.fuel_type_id === 1 || nozzle.fuel_types?.name === 'MS' || nozzle.name.includes('MS'));
            modalBody.innerHTML = `
                <form id="edit-pump-form">
                    <div class="form-group">
                        <label for="edit-pump-name">Pump / Nozzle Label</label>
                        <input type="text" id="edit-pump-name" required value="${nozzle.name}" placeholder="e.g. MS 1">
                    </div>
                    <div class="form-group">
                        <label for="edit-pump-fuel">Fuel Grade</label>
                        <select id="edit-pump-fuel" required>
                            <option value="1" ${isMs ? 'selected' : ''}>Petrol (MS)</option>
                            <option value="2" ${!isMs ? 'selected' : ''}>Diesel (HSD)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="edit-pump-reading">Master / Opening Reading</label>
                        <input type="number" step="0.01" id="edit-pump-reading" required value="${parseFloat(nozzle.master_reading || 0).toFixed(2)}">
                        <small style="color: var(--text-muted); font-size: 0.8rem;">Calibrates the baseline reading for this dispenser unit.</small>
                    </div>
                    <div class="form-group">
                        <label for="edit-pump-status">Pump Operational Status</label>
                        <select id="edit-pump-status">
                            <option value="true" ${nozzle.is_active !== false ? 'selected' : ''}>Active (In Service)</option>
                            <option value="false" ${nozzle.is_active === false ? 'selected' : ''}>Inactive (Decommissioned / Off)</option>
                        </select>
                    </div>
                </form>
            `;
        }

        if (modalFooter) {
            modalFooter.innerHTML = `
                <button class="btn btn-danger" id="modal-delete-pump-btn" style="margin-right: auto;">🗑️ Delete Pump & History</button>
                <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
                <button class="btn btn-primary" id="save-edit-pump-btn">💾 Save Changes</button>
            `;

            document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);

            document.getElementById('modal-delete-pump-btn')?.addEventListener('click', () => {
                handleDeletePump(nozzle.id, nozzle.name);
            });

            document.getElementById('save-edit-pump-btn')?.addEventListener('click', async () => {
                const name = document.getElementById('edit-pump-name')?.value.trim();
                const fuelTypeId = parseInt(document.getElementById('edit-pump-fuel')?.value);
                const reading = parseFloat(document.getElementById('edit-pump-reading')?.value);
                const isActive = document.getElementById('edit-pump-status')?.value === 'true';

                if (!name) {
                    toast.error('Pump name is required.');
                    return;
                }

                if (isNaN(reading)) {
                    toast.error('Valid master reading is required.');
                    return;
                }

                try {
                    await updateNozzle(nozzle.id, {
                        name,
                        fuel_type_id: fuelTypeId,
                        master_reading: reading,
                        is_active: isActive
                    });

                    toast.success(`Pump "${name}" updated!`);
                    closeModal();
                    await loadNozzleCards(shiftState.activeShift || { id: shiftState.shiftId });
                    recalculateShiftTotals();
                } catch (err) {
                    toast.error('Failed to update pump: ' + err.message);
                }
            });
        }

        openModal();
    } catch (err) {
        console.error('Error opening edit pump modal:', err);
        toast.error('Failed to load pump details.');
    }
}

async function handleDeletePump(nozzleId, nozzleName) {
    const confirmed = window.confirm(
        `Are you sure you want to permanently delete pump "${nozzleName}"?\n\nThis will remove the pump and clear its meter reading histories from this and past shifts. This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
        await deleteNozzle(nozzleId, true);
        delete shiftState.readings[nozzleId];
        toast.success(`Pump "${nozzleName}" and history deleted.`);
        closeModal();
        await loadNozzleCards(shiftState.activeShift || { id: shiftState.shiftId });
        recalculateShiftTotals();
    } catch (err) {
        console.error('Error deleting pump:', err);
        toast.error('Failed to delete pump: ' + err.message);
    }
}

async function openManagePumpsModal() {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');

    try {
        const nozzles = await fetchNozzles();
        if (modalTitle) modalTitle.textContent = 'Manage Dispenser Pumps & History';

        if (modalBody) {
            modalBody.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                    <p style="margin: 0; color: var(--text-secondary); font-size: 0.88rem;">Configure dispensers, edit meter calibrations, or delete pumps.</p>
                    <button class="btn btn-primary btn-sm" id="modal-sub-add-pump-btn">➕ Add New Pump</button>
                </div>
                <div class="table-responsive" style="max-height: 320px; overflow-y: auto;">
                    <table class="data-table" style="font-size: 0.85rem;">
                        <thead>
                            <tr>
                                <th>Pump / Nozzle</th>
                                <th>Fuel</th>
                                <th>Opening / Master</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${nozzles.map(n => `
                                <tr>
                                    <td><strong>${n.name}</strong></td>
                                    <td><span class="badge-fuel ${n.fuel_types?.name === 'MS' || n.name.includes('MS') ? 'fuel-ms' : 'fuel-hsd'}">${n.fuel_types?.name || (n.name.includes('MS') ? 'MS' : 'HSD')}</span></td>
                                    <td class="mono">${parseFloat(n.master_reading || 0).toFixed(2)}</td>
                                    <td><span style="color: ${n.is_active !== false ? 'var(--success)' : 'var(--danger)'}; font-weight: 600;">${n.is_active !== false ? 'Active' : 'Inactive'}</span></td>
                                    <td>
                                        <div style="display: flex; gap: 6px;">
                                            <button class="btn btn-secondary btn-sm" data-modal-edit="${n.id}">✏️ Edit</button>
                                            <button class="btn btn-danger btn-sm" data-modal-del="${n.id}" data-name="${n.name}">🗑️ Delete</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            document.getElementById('modal-sub-add-pump-btn')?.addEventListener('click', () => {
                openAddPumpModal();
            });

            modalBody.querySelectorAll('[data-modal-edit]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-modal-edit');
                    openEditPumpModal(id);
                });
            });

            modalBody.querySelectorAll('[data-modal-del]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-modal-del');
                    const name = btn.getAttribute('data-name');
                    handleDeletePump(id, name);
                });
            });
        }

        if (modalFooter) {
            modalFooter.innerHTML = '<button class="btn btn-secondary" id="modal-cancel-btn">Close</button>';
            document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);
        }

        openModal();
    } catch (err) {
        console.error('Error opening manage pumps modal:', err);
        toast.error('Failed to load pump list.');
    }
}
