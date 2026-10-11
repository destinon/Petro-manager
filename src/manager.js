/**
 * PetroCorp Station Management - Manager Operations & DSSR Controller
 */
import {
    fetchDailyRates,
    saveDailyRates,
    fetchTanks,
    saveTankDip,
    saveFuelReceipt,
    fetchNozzles,
    createNozzle,
    updateNozzle,
    deleteNozzle,
    updateNozzleMasterReading,
    fetchEmployees,
    toggleEmployeeStatus,
    createOperator,
    fetchCustomers,
    createCustomer,
    recordCreditTransaction,
    fetchCustomerHistory,
    generateDSSRData,
    fetchSubmittedShifts,
    fetchShiftFullDetails,
    approveShift,
    rejectShift,
    fetchStationSettings,
    updateStationSetting,
    fetchOperatorNozzleAssignments,
    saveOperatorNozzleAssignments,
    listAvailableTables,
    fetchTableData,
    insertTableRow,
    updateTableRow,
    deleteTableRow
} from './services/api.js';
import { formatCurrency, formatLitres, formatDate, getTodayDateString } from './utils/formatters.js';
import { exportToCSV } from './utils/exportCsv.js';
import { toast } from './utils/toast.js';

let appState = null;
let currentDssrData = null;

export async function initManagerDashboard(state) {
    appState = state;
    setupManagerNavigation();
    setupManagerForms();
    setupOperatorPumpAssignmentEvents();
    setupDatabaseConsole();

    // Default to today
    const today = getTodayDateString();
    const dssrDateInput = document.getElementById('dssr-date-input');
    const rateDateInput = document.getElementById('rate-date-input');
    const dipDateInput = document.getElementById('dip-date');
    const recDateInput = document.getElementById('rec-date');

    if (dssrDateInput) dssrDateInput.value = today;
    if (rateDateInput) rateDateInput.value = today;
    if (dipDateInput) dipDateInput.value = today;
    if (recDateInput) recDateInput.value = today;

    // Load initial manager data
    await Promise.all([
        loadTodayRates(today),
        loadTanksDropdowns(),
        loadDSSR(today),
        loadHardwareList(),
        loadStationSettingsForm()
    ]);
}

function setupManagerNavigation() {
    const navButtons = document.querySelectorAll('[data-mgr-tab]');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-mgr-tab');
            switchManagerTab(targetId);
        });
    });

    document.getElementById('load-dssr-btn')?.addEventListener('click', () => {
        const date = document.getElementById('dssr-date-input')?.value || getTodayDateString();
        loadDSSR(date);
    });

    document.getElementById('export-dssr-btn')?.addEventListener('click', handleExportDSSR);
    document.getElementById('refresh-approvals-btn')?.addEventListener('click', loadPendingApprovals);
    document.getElementById('export-credit-btn')?.addEventListener('click', handleExportCreditLedger);
    document.getElementById('add-customer-modal-btn')?.addEventListener('click', openAddCustomerModal);
    document.getElementById('add-pump-modal-btn')?.addEventListener('click', openAddPumpModal);
    document.getElementById('add-operator-modal-btn')?.addEventListener('click', openAddOperatorModal);
    document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
    const modalOverlay = document.getElementById('app-modal');
    modalOverlay?.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
}

function switchManagerTab(tabId) {
    document.querySelectorAll('.mgr-tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('[data-mgr-tab]').forEach(b => b.classList.remove('active'));

    const targetSection = document.getElementById(tabId);
    if (targetSection) targetSection.classList.remove('hidden');

    const activeBtn = document.querySelector(`[data-mgr-tab="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Lazy load tab data
    if (tabId === 'mgr-approvals-view') loadPendingApprovals();
    if (tabId === 'mgr-hardware-view') loadHardwareList();
    if (tabId === 'mgr-credits-view') loadCreditLedger();
    if (tabId === 'mgr-employees-view') loadEmployeesRoster();
    if (tabId === 'mgr-settings-view') loadStationSettingsForm();
    if (tabId === 'mgr-database-view') initDatabaseConsoleView();
}


// ==========================================
// 1. DSSR REPORT ENGINE
// ==========================================

async function loadDSSR(date) {
    const container = document.getElementById('dssr-tables-container');
    if (!container) return;
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Generating DSSR calculation matrix...</div>';

    try {
        currentDssrData = await generateDSSRData(date);
        renderDSSRTables(currentDssrData);
    } catch (err) {
        console.error('Error generating DSSR:', err);
        container.innerHTML = `<div class="alert-box alert-error">Failed to generate DSSR report: ${err.message}</div>`;
    }
}

function renderDSSRTables(dssr) {
    const container = document.getElementById('dssr-tables-container');
    if (!container) return;

    let totalRevenue = 0;
    let msLitres = 0;
    let hsdLitres = 0;
    let totalVariation = 0;

    container.innerHTML = '';

    dssr.fuel_results.forEach(fr => {
        totalRevenue += fr.total_revenue;
        if (fr.fuel_type === 'MS') msLitres += fr.total_meter_sales;
        if (fr.fuel_type === 'HSD') hsdLitres += fr.total_meter_sales;
        totalVariation += fr.stock_variation;

        const isPositive = fr.stock_variation >= 0;
        const variationColor = Math.abs(fr.stock_variation) > 50 ? 'var(--danger)' : (isPositive ? 'var(--success)' : 'var(--warning)');

        const section = document.createElement('div');
        section.className = 'card';
        section.style.padding = '24px';
        section.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--border-subtle); padding-bottom: 14px; margin-bottom: 18px; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.4rem;">⛽</span>
                    <h3 style="font-size: 1.25rem;">${fr.display_name} (${fr.fuel_type})</h3>
                </div>
                <div style="display: flex; gap: 18px; font-size: 0.95rem;">
                    <span>Retail Rate: <strong class="mono" style="color: var(--accent-primary);">${formatCurrency(fr.rate)}/L</strong></span>
                    <span>Total Revenue: <strong class="mono">${formatCurrency(fr.total_revenue)}</strong></span>
                </div>
            </div>

            <!-- Dispensers & Pumps Meter Reading Table -->
            <h4 style="font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); margin-bottom: 10px;">1. Pump Meter Sales (Dispensers)</h4>
            <div class="table-responsive" style="margin-bottom: 20px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Nozzle / Pump</th>
                            <th>Opening Meter</th>
                            <th>Closing Meter</th>
                            <th>Gross Litres</th>
                            <th>Testing (L)</th>
                            <th>Net Sales (Litres)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${fr.pump_sales.map(p => `
                            <tr>
                                <td><strong>${p.nozzle_name}</strong></td>
                                <td class="mono">${parseFloat(p.opening).toFixed(2)}</td>
                                <td class="mono">${parseFloat(p.closing).toFixed(2)}</td>
                                <td class="mono">${p.gross.toFixed(2)}</td>
                                <td class="mono">${p.testing.toFixed(2)}</td>
                                <td class="mono" style="font-weight: 700; color: var(--accent-primary);">${formatLitres(p.net_sales)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background: var(--bg-surface-muted); font-weight: 700;">
                            <td colspan="5" style="text-align: right;">Total Net Meter Sales:</td>
                            <td class="mono" style="color: var(--accent-primary); font-size: 1rem;">${formatLitres(fr.total_meter_sales)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <!-- Tank Stock & Delivery Record -->
            <h4 style="font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); margin-bottom: 10px;">2. Underground Tank Inventory & Receipts</h4>
            <div class="table-responsive" style="margin-bottom: 20px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Storage Tank</th>
                            <th>Opening Stock (Litres)</th>
                            <th>Fuel Dip (mm)</th>
                            <th>Water Dip (mm)</th>
                            <th>Closing Stock (Litres)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${fr.tank_details.map(t => `
                            <tr>
                                <td><strong>${t.tank_name}</strong></td>
                                <td class="mono">${formatLitres(t.opening_stock)}</td>
                                <td class="mono">${t.fuel_dip_mm} mm</td>
                                <td class="mono">${t.water_dip_mm} mm</td>
                                <td class="mono" style="font-weight: 700;">${formatLitres(t.closing_stock)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <!-- DSSR Mathematical Balance Box -->
            <div style="background: var(--bg-surface-muted); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
                <div>
                    <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Total Opening Stock</span>
                    <div class="mono" style="font-size: 1.15rem; font-weight: 700;">${formatLitres(fr.total_opening_stock)}</div>
                </div>
                <div>
                    <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">+ Receipts / Deliveries</span>
                    <div class="mono" style="font-size: 1.15rem; font-weight: 700; color: var(--info);">${formatLitres(fr.total_receipts)}</div>
                </div>
                <div>
                    <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">- Closing Tank Stock</span>
                    <div class="mono" style="font-size: 1.15rem; font-weight: 700;">${formatLitres(fr.total_closing_stock)}</div>
                </div>
                <div>
                    <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">= Sales As Per Tanks</span>
                    <div class="mono" style="font-size: 1.15rem; font-weight: 700;">${formatLitres(fr.stock_sales)}</div>
                </div>
                <div style="border-left: 2px solid var(--border-subtle); padding-left: 14px;">
                    <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Stock Variation (Meter - Tank)</span>
                    <div class="mono" style="font-size: 1.3rem; font-weight: 800; color: ${variationColor};">
                        ${fr.stock_variation >= 0 ? '+' : ''}${formatLitres(fr.stock_variation)}
                    </div>
                </div>
            </div>
        `;

        container.appendChild(section);
    });

    // Update KPI Header Cards
    const kpiRev = document.getElementById('dssr-kpi-revenue');
    const kpiMs = document.getElementById('dssr-kpi-ms-litres');
    const kpiHsd = document.getElementById('dssr-kpi-hsd-litres');
    const kpiVar = document.getElementById('dssr-kpi-variation');

    if (kpiRev) kpiRev.textContent = formatCurrency(totalRevenue);
    if (kpiMs) kpiMs.textContent = formatLitres(msLitres);
    if (kpiHsd) kpiHsd.textContent = formatLitres(hsdLitres);
    if (kpiVar) {
        kpiVar.textContent = `${totalVariation >= 0 ? '+' : ''}${formatLitres(totalVariation)}`;
        kpiVar.style.color = Math.abs(totalVariation) > 100 ? 'var(--danger)' : 'var(--text-primary)';
    }
}

function handleExportDSSR() {
    if (!currentDssrData || !currentDssrData.fuel_results) {
        toast.warning('No DSSR report loaded to export.');
        return;
    }

    const rows = [];
    currentDssrData.fuel_results.forEach(fr => {
        fr.pump_sales.forEach(p => {
            rows.push([
                currentDssrData.date,
                fr.fuel_type,
                p.nozzle_name,
                p.opening,
                p.closing,
                p.gross,
                p.testing,
                p.net_sales,
                fr.rate,
                (p.net_sales * fr.rate).toFixed(2),
                fr.stock_sales,
                fr.stock_variation
            ]);
        });
    });

    const headers = [
        'Date', 'Fuel Grade', 'Dispenser Nozzle', 'Opening Meter',
        'Closing Meter', 'Gross Litres', 'Testing Litres', 'Net Sales Litres',
        'Rate (Rs)', 'Sales Revenue (Rs)', 'Tank Sales Litres', 'Stock Variation Litres'
    ];

    exportToCSV(`DSSR_Report_${currentDssrData.date}`, rows, headers);
    toast.success('DSSR CSV exported successfully!');
}

// ==========================================
// 2. SHIFT APPROVALS
// ==========================================

async function loadPendingApprovals() {
    const tbody = document.getElementById('approvals-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Fetching submitted shifts...</td></tr>';

    try {
        const shifts = await fetchSubmittedShifts();
        if (!shifts || shifts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No shifts currently pending review.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        shifts.forEach(s => {
            const tr = document.createElement('tr');
            const operatorName = s.profiles?.full_name || s.employees?.full_name || 'Operator';
            const extraShort = parseFloat(s.short_extra_cash || 0);
            const varColor = extraShort > 0 ? 'var(--danger)' : (extraShort < 0 ? 'var(--success)' : 'var(--text-primary)');
            const varText = extraShort > 0 ? `Short: ${formatCurrency(extraShort)}` : (extraShort < 0 ? `Extra: ${formatCurrency(Math.abs(extraShort))}` : 'Balanced');

            tr.innerHTML = `
                <td class="mono">#${s.id}</td>
                <td>${formatDate(s.date)}</td>
                <td>${s.shift_types?.name || 'Shift'}</td>
                <td><strong>${operatorName}</strong></td>
                <td class="mono font-weight-bold">${formatCurrency(s.total_sales_amount)}</td>
                <td class="mono">${formatCurrency(s.total_deductions)}</td>
                <td class="mono" style="color: ${varColor}; font-weight: 700;">${varText}</td>
                <td>
                    <button class="btn btn-primary" style="padding: 4px 10px; font-size: 0.82rem;" data-review-shift="${s.id}">Review & Approve</button>
                </td>
            `;

            tr.querySelector(`[data-review-shift="${s.id}"]`)?.addEventListener('click', () => openShiftReviewModal(s.id));
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Error loading approvals:', err);
        tbody.innerHTML = `<tr><td colspan="8" style="color: var(--danger); text-align: center;">Error loading shifts: ${err.message}</td></tr>`;
    }
}

async function openShiftReviewModal(shiftId) {
    try {
        const details = await fetchShiftFullDetails(shiftId);
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        const modalFooter = document.getElementById('modal-footer');

        if (modalTitle) modalTitle.textContent = `Review Shift #${details.id} - ${details.shift_types?.name} (${details.date})`;

        const operatorName = details.profiles?.full_name || 'Operator';
        const extraShort = parseFloat(details.short_extra_cash || 0);

        if (modalBody) {
            modalBody.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 16px; background: var(--bg-surface-muted); padding: 12px; border-radius: var(--radius-sm);">
                    <div>Operator: <strong>${operatorName}</strong></div>
                    <div>Sales Revenue: <strong class="mono">${formatCurrency(details.total_sales_amount)}</strong></div>
                    <div>Variance: <strong class="mono" style="color: ${extraShort > 0 ? 'var(--danger)' : 'var(--success)'};">${formatCurrency(extraShort)}</strong></div>
                </div>

                <h4 style="margin: 12px 0 6px;">Nozzle Meter Readings</h4>
                <div class="table-responsive" style="max-height: 180px; overflow-y: auto; margin-bottom: 14px;">
                    <table class="data-table" style="font-size: 0.82rem;">
                        <thead>
                            <tr><th>Nozzle</th><th>Open</th><th>Close</th><th>Testing</th><th>Net (L)</th><th>Amount</th></tr>
                        </thead>
                        <tbody>
                            ${(details.shift_nozzle_readings || []).map(r => `
                                <tr>
                                    <td>${r.nozzles?.name || r.nozzle_id}</td>
                                    <td>${r.opening_reading}</td>
                                    <td>${r.closing_reading}</td>
                                    <td>${r.testing_qty}</td>
                                    <td>${r.net_sale_qty || (r.closing_reading - r.opening_reading - r.testing_qty)} L</td>
                                    <td>${formatCurrency(r.sales_amount)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="form-group" style="margin-top: 14px;">
                    <label for="rejection-reason">Rejection Reason (Required if rejecting):</label>
                    <input type="text" id="rejection-reason" placeholder="e.g. Closing reading on MS 3 doesn't match photo...">
                </div>
            `;
        }

        if (modalFooter) {
            modalFooter.innerHTML = `
                <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
                <button class="btn btn-danger" id="modal-reject-btn">Reject Shift</button>
                <button class="btn btn-success" id="modal-approve-btn">Approve & Advance Meters</button>
            `;

            document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);

            document.getElementById('modal-reject-btn')?.addEventListener('click', async () => {
                const reason = document.getElementById('rejection-reason')?.value.trim();
                if (!reason) {
                    toast.error('Please enter a rejection reason.');
                    return;
                }
                await rejectShift(shiftId, appState.currentUser.id, reason);
                toast.warning(`Shift #${shiftId} rejected.`);
                closeModal();
                loadPendingApprovals();
            });

            document.getElementById('modal-approve-btn')?.addEventListener('click', async () => {
                await approveShift(shiftId, appState.currentUser.id);
                toast.success(`Shift #${shiftId} approved! Dispenser meters updated.`);
                closeModal();
                loadPendingApprovals();
                loadHardwareList();
            });
        }

        openModal();
    } catch (err) {
        console.error('Error opening review modal:', err);
        toast.error('Failed to load shift details: ' + err.message);
    }
}

// ==========================================
// 3. DAILY FUEL RATES
// ==========================================

async function loadTodayRates(date) {
    try {
        const rates = await fetchDailyRates(date);
        const msInput = document.getElementById('rate-ms-input');
        const hsdInput = document.getElementById('rate-hsd-input');

        rates.forEach(r => {
            const name = r.fuel_types?.name?.toUpperCase();
            if (name === 'MS' && msInput) msInput.value = r.rate;
            if (name === 'HSD' && hsdInput) hsdInput.value = r.rate;
        });
    } catch (err) {
        console.warn('Notice loading rates:', err);
    }
}

function setupManagerForms() {
    // 1. Rates Form
    document.getElementById('mgr-rates-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const date = document.getElementById('rate-date-input')?.value;
        const msRate = parseFloat(document.getElementById('rate-ms-input')?.value);
        const hsdRate = parseFloat(document.getElementById('rate-hsd-input')?.value);

        if (!date || isNaN(msRate) || isNaN(hsdRate)) {
            toast.error('Enter valid rates for both MS and HSD.');
            return;
        }

        try {
            await saveDailyRates(date, [
                { fuel_type_id: 1, rate: msRate },
                { fuel_type_id: 2, rate: hsdRate }
            ], appState.currentUser.id);

            toast.success(`Daily fuel rates published for ${date}!`);
            loadDSSR(date);
        } catch (err) {
            toast.error('Failed to save rates: ' + err.message);
        }
    });

    // 2. Tank Dip Form
    document.getElementById('mgr-dip-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const date = document.getElementById('dip-date')?.value;
        const tankId = document.getElementById('dip-tank')?.value;
        const dipMm = parseFloat(document.getElementById('dip-reading')?.value);
        const waterMm = parseFloat(document.getElementById('dip-water')?.value || 0);
        const netStock = parseFloat(document.getElementById('dip-net-stock')?.value);

        if (!date || !tankId || isNaN(netStock)) {
            toast.error('Fill in all required dip fields.');
            return;
        }

        try {
            await saveTankDip({
                date,
                tank_id: tankId,
                dip_reading_mm: dipMm,
                water_dip_mm: waterMm,
                calculated_litres: netStock,
                recorded_by: appState.currentUser.id
            });

            toast.success('Physical tank dip recorded!');
            document.getElementById('mgr-dip-form')?.reset();
            document.getElementById('dip-date').value = date;
            loadDSSR(date);
        } catch (err) {
            toast.error('Failed to save tank dip: ' + err.message);
        }
    });

    // 3. Fuel Delivery Form
    document.getElementById('mgr-delivery-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const date = document.getElementById('rec-date')?.value;
        const tankId = document.getElementById('rec-tank')?.value;
        const qty = parseFloat(document.getElementById('rec-quantity')?.value);
        const invoice = document.getElementById('rec-invoice')?.value;

        if (!date || !tankId || isNaN(qty) || qty <= 0) {
            toast.error('Enter a valid delivered quantity.');
            return;
        }

        try {
            await saveFuelReceipt({
                date,
                tank_id: tankId,
                quantity_litres: qty,
                invoice_number: invoice,
                recorded_by: appState.currentUser.id
            });

            toast.success(`Delivery of ${formatLitres(qty)} logged!`);
            document.getElementById('mgr-delivery-form')?.reset();
            document.getElementById('rec-date').value = date;
            loadDSSR(date);
        } catch (err) {
            toast.error('Failed to log fuel receipt: ' + err.message);
        }
    });

    // 4. Station Settings Form
    document.getElementById('station-settings-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('set-station-name')?.value;
        const code = document.getElementById('set-station-code')?.value;
        const stockWarn = document.getElementById('set-stock-warning')?.value;
        const cashWarn = document.getElementById('set-cash-warning')?.value;

        try {
            await Promise.all([
                updateStationSetting('station_name', name),
                updateStationSetting('station_code', code),
                updateStationSetting('stock_variation_warning_litres', stockWarn),
                updateStationSetting('cash_shortage_warning_rupees', cashWarn)
            ]);

            toast.success('Station settings saved successfully!');
            const badge = document.getElementById('station-badge');
            if (badge) badge.textContent = `${name.toUpperCase()} • ${code.toUpperCase()}`;
        } catch (err) {
            toast.error('Failed to update settings: ' + err.message);
        }
    });
}

async function loadStationSettingsForm() {
    try {
        const settings = await fetchStationSettings();
        const nameInput = document.getElementById('set-station-name');
        const codeInput = document.getElementById('set-station-code');
        const stockInput = document.getElementById('set-stock-warning');
        const cashInput = document.getElementById('set-cash-warning');

        if (nameInput && settings.station_name) nameInput.value = settings.station_name;
        if (codeInput && settings.station_code) codeInput.value = settings.station_code;
        if (stockInput && settings.stock_variation_warning_litres) stockInput.value = settings.stock_variation_warning_litres;
        if (cashInput && settings.cash_shortage_warning_rupees) cashInput.value = settings.cash_shortage_warning_rupees;
    } catch (err) {
        console.warn('Notice loading settings form:', err);
    }
}


async function loadTanksDropdowns() {
    try {
        const tanks = await fetchTanks();
        const dipSelect = document.getElementById('dip-tank');
        const recSelect = document.getElementById('rec-tank');

        if (dipSelect) {
            dipSelect.innerHTML = '<option value="">Select storage tank...</option>';
            tanks.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = `${t.name} (${t.fuel_types?.name || 'Fuel'}) - ${t.capacity_litres} L`;
                dipSelect.appendChild(opt);
            });
        }

        if (recSelect) {
            recSelect.innerHTML = '<option value="">Select storage tank...</option>';
            tanks.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = `${t.name} (${t.fuel_types?.name || 'Fuel'})`;
                recSelect.appendChild(opt);
            });
        }
    } catch (err) {
        console.warn('Error loading tanks dropdowns:', err);
    }
}

// ==========================================
// 4. HARDWARE MANAGEMENT (DYNAMIC DISPENSERS & PUMPS)
// ==========================================

async function loadHardwareList() {
    const tbody = document.getElementById('hardware-nozzles-tbody');
    if (!tbody) return;

    try {
        const nozzles = await fetchNozzles();
        tbody.innerHTML = '';

        if (!nozzles || nozzles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">No dispenser pumps configured. Click "Add New Pump / Nozzle" to create one.</td></tr>';
            return;
        }

        nozzles.forEach(n => {
            const tr = document.createElement('tr');
            const fuelName = n.fuel_types?.name || (n.name.includes('MS') ? 'MS' : 'HSD');
            const badgeClass = fuelName === 'MS' ? 'fuel-ms' : 'fuel-hsd';
            const isActive = n.is_active !== false;

            tr.innerHTML = `
                <td><strong>${n.name}</strong></td>
                <td><span class="badge-fuel ${badgeClass}">${n.fuel_types?.display_name || fuelName}</span></td>
                <td class="mono font-weight-bold">${parseFloat(n.master_reading || 0).toFixed(2)}</td>
                <td><span style="color: ${isActive ? 'var(--success)' : 'var(--danger)'}; font-weight: 600;">${isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-sm" data-edit-nozzle="${n.id}" title="Edit Pump & Meter Settings">
                            <span>✏️</span> Edit
                        </button>
                        <button class="btn btn-danger btn-sm" data-delete-nozzle="${n.id}" data-name="${n.name}" title="Delete Pump & History">
                            <span>🗑️</span> Delete
                        </button>
                    </div>
                </td>
            `;

            tr.querySelector(`[data-edit-nozzle="${n.id}"]`)?.addEventListener('click', () => openEditPumpModal(n.id));
            tr.querySelector(`[data-delete-nozzle="${n.id}"]`)?.addEventListener('click', () => handleDeletePump(n.id, n.name));

            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Error loading hardware list:', err);
        tbody.innerHTML = `<tr><td colspan="5" style="color: var(--danger); text-align: center;">Error loading hardware: ${err.message}</td></tr>`;
    }
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
                    <label for="new-pump-name">Pump / Nozzle Name or Number</label>
                    <input type="text" id="new-pump-name" required placeholder="e.g. MS 11, HSD 12, or Bay 3 - Petrol">
                    <small style="color: var(--text-muted); font-size: 0.8rem;">Enter a descriptive name for this dispenser nozzle.</small>
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
                    <small style="color: var(--text-muted); font-size: 0.8rem;">Baseline starting totalizer reading on the physical dispenser meter.</small>
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
                toast.error('Please enter a pump name or number.');
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

                toast.success(`Pump "${created.name}" created successfully!`);
                closeModal();
                loadHardwareList();
                const dssrDate = document.getElementById('dssr-date-input')?.value || getTodayDateString();
                loadDSSR(dssrDate);
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
            const isMs = (nozzle.fuel_type_id === 1 || nozzle.fuel_types?.name === 'MS');
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
                        <label for="edit-pump-reading">Master / Baseline Meter Reading</label>
                        <input type="number" step="0.01" id="edit-pump-reading" required value="${parseFloat(nozzle.master_reading || 0).toFixed(2)}">
                        <small style="color: var(--text-muted); font-size: 0.8rem;">Updates starting meter reading for upcoming shifts.</small>
                    </div>
                    <div class="form-group">
                        <label for="edit-pump-status">Pump Operational Status</label>
                        <select id="edit-pump-status">
                            <option value="true" ${nozzle.is_active !== false ? 'selected' : ''}>Active (In Service)</option>
                            <option value="false" ${nozzle.is_active === false ? 'selected' : ''}>Inactive (Maintenance / Offline)</option>
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
                    toast.error('Valid master meter reading is required.');
                    return;
                }

                try {
                    await updateNozzle(nozzle.id, {
                        name,
                        fuel_type_id: fuelTypeId,
                        master_reading: reading,
                        is_active: isActive
                    });

                    toast.success(`Pump "${name}" updated successfully!`);
                    closeModal();
                    loadHardwareList();
                    const dssrDate = document.getElementById('dssr-date-input')?.value || getTodayDateString();
                    loadDSSR(dssrDate);
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
        `Are you sure you want to permanently delete pump "${nozzleName}"?\n\nThis will remove the pump and clear its historical meter readings from shifts. This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
        await deleteNozzle(nozzleId, true);
        toast.success(`Pump "${nozzleName}" and its reading history were deleted.`);
        closeModal();
        loadHardwareList();
        const dssrDate = document.getElementById('dssr-date-input')?.value || getTodayDateString();
        loadDSSR(dssrDate);
    } catch (err) {
        console.error('Error deleting pump:', err);
        toast.error('Failed to delete pump: ' + err.message);
    }
}

// ==========================================
// 5. UDHAARI (CREDIT) LEDGER & REPAYMENTS
// ==========================================

async function loadCreditLedger() {
    const tbody = document.getElementById('mgr-credits-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Fetching customer accounts...</td></tr>';

    try {
        const customers = await fetchCustomers();
        if (!customers || customers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No credit customers configured yet.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        customers.forEach(c => {
            const tr = document.createElement('tr');
            const outstanding = parseFloat(c.outstanding_balance ?? (c.opening_balance || 0));
            const outColor = outstanding > 0 ? 'var(--danger)' : 'var(--success)';

            tr.innerHTML = `
                <td><strong>${c.name}</strong></td>
                <td>${c.vehicle_number || '-'}</td>
                <td class="mono">${formatCurrency(c.opening_balance || 0)}</td>
                <td class="mono" style="color: var(--danger);">${formatCurrency(c.total_credit_sales || 0)}</td>
                <td class="mono" style="color: var(--success);">${formatCurrency(c.total_repayments || 0)}</td>
                <td class="mono" style="color: ${outColor}; font-weight: 700; font-size: 1rem;">${formatCurrency(outstanding)}</td>
                <td>
                    <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" data-repay-cust="${c.id}" data-name="${c.name}">💵 Repay</button>
                    <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" data-hist-cust="${c.id}" data-name="${c.name}">📜 History</button>
                </td>
            `;

            tr.querySelector(`[data-repay-cust="${c.id}"]`)?.addEventListener('click', () => openRepaymentModal(c.id, c.name));
            tr.querySelector(`[data-hist-cust="${c.id}"]`)?.addEventListener('click', () => openCustomerHistoryModal(c.id, c.name));

            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Error loading credits:', err);
        tbody.innerHTML = `<tr><td colspan="7" style="color: var(--danger); text-align: center;">Error loading ledger: ${err.message}</td></tr>`;
    }
}

function openAddCustomerModal() {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');

    if (modalTitle) modalTitle.textContent = 'Register New Credit (Udhaari) Customer';
    if (modalBody) {
        modalBody.innerHTML = `
            <form id="new-customer-form">
                <div class="form-group">
                    <label for="new-cust-name">Customer / Account Name</label>
                    <input type="text" id="new-cust-name" required placeholder="e.g. KONARK HOME">
                </div>
                <div class="form-group">
                    <label for="new-cust-veh">Primary Vehicle Number</label>
                    <input type="text" id="new-cust-veh" placeholder="e.g. MH 14 DA 9999">
                </div>
                <div class="form-group">
                    <label for="new-cust-contact">Contact Phone / Info</label>
                    <input type="text" id="new-cust-contact" placeholder="e.g. +91 9822000000">
                </div>
                <div class="form-group">
                    <label for="new-cust-open">Opening Balance (₹)</label>
                    <input type="number" step="0.01" id="new-cust-open" value="0.00">
                </div>
            </form>
        `;
    }

    if (modalFooter) {
        modalFooter.innerHTML = `
            <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="save-new-cust-btn">Create Customer</button>
        `;

        document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);
        document.getElementById('save-new-cust-btn')?.addEventListener('click', async () => {
            const name = document.getElementById('new-cust-name')?.value;
            const veh = document.getElementById('new-cust-veh')?.value;
            const contact = document.getElementById('new-cust-contact')?.value;
            const openBal = document.getElementById('new-cust-open')?.value;

            if (!name) {
                toast.error('Customer name is required.');
                return;
            }

            try {
                await createCustomer({
                    name,
                    vehicle_number: veh,
                    contact_info: contact,
                    opening_balance: openBal
                });
                toast.success(`Customer "${name.toUpperCase()}" registered.`);
                closeModal();
                loadCreditLedger();
            } catch (err) {
                toast.error('Failed to create customer: ' + err.message);
            }
        });
    }

    openModal();
}

function openRepaymentModal(customerId, customerName) {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');

    if (modalTitle) modalTitle.textContent = `Record Repayment - ${customerName}`;
    if (modalBody) {
        modalBody.innerHTML = `
            <div class="form-group">
                <label for="repay-amount">Repayment Amount (₹)</label>
                <input type="number" step="0.01" id="repay-amount" required placeholder="0.00">
            </div>
            <div class="form-group">
                <label for="repay-method">Payment Mode</label>
                <select id="repay-method">
                    <option value="1">Cash</option>
                    <option value="3">Paytm QR</option>
                    <option value="5">PhonePe QR</option>
                    <option value="7">Cheque / Bank Transfer</option>
                </select>
            </div>
            <div class="form-group">
                <label for="repay-notes">Transaction Reference / Remarks</label>
                <input type="text" id="repay-notes" placeholder="e.g. Received via Cheque #492810">
            </div>
        `;
    }

    if (modalFooter) {
        modalFooter.innerHTML = `
            <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
            <button class="btn btn-success" id="save-repay-btn">Post Repayment</button>
        `;

        document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);
        document.getElementById('save-repay-btn')?.addEventListener('click', async () => {
            const amount = parseFloat(document.getElementById('repay-amount')?.value);
            const methodId = document.getElementById('repay-method')?.value;
            const notes = document.getElementById('repay-notes')?.value;

            if (isNaN(amount) || amount <= 0) {
                toast.error('Enter a valid repayment amount.');
                return;
            }

            try {
                await recordCreditTransaction({
                    customer_id: customerId,
                    type: 'repayment',
                    amount,
                    payment_method_id: methodId ? parseInt(methodId) : 1,
                    notes,
                    recorded_by: appState.currentUser.id
                });
                toast.success(`Repayment of ${formatCurrency(amount)} credited!`);
                closeModal();
                loadCreditLedger();
            } catch (err) {
                toast.error('Failed to post repayment: ' + err.message);
            }
        });
    }

    openModal();
}

async function openCustomerHistoryModal(customerId, customerName) {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');

    if (modalTitle) modalTitle.textContent = `Transaction Ledger - ${customerName}`;
    if (modalBody) {
        modalBody.innerHTML = '<p>Loading transactions...</p>';
    }

    if (modalFooter) {
        modalFooter.innerHTML = '<button class="btn btn-secondary" id="modal-cancel-btn">Close</button>';
        document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);
    }

    openModal();

    try {
        const history = await fetchCustomerHistory(customerId);
        if (!history || history.length === 0) {
            modalBody.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">No transaction records found for this customer.</p>';
            return;
        }

        modalBody.innerHTML = `
            <div class="table-responsive" style="max-height: 340px; overflow-y: auto;">
                <table class="data-table" style="font-size: 0.82rem;">
                    <thead>
                        <tr><th>Date</th><th>Type</th><th>Fuel / Mode</th><th>Qty</th><th>Amount</th><th>Notes</th></tr>
                    </thead>
                    <tbody>
                        ${history.map(h => `
                            <tr>
                                <td>${formatDate(h.created_at)}</td>
                                <td><span style="font-weight: 700; color: ${h.type === 'sale' ? 'var(--danger)' : 'var(--success)'};">${h.type.toUpperCase()}</span></td>
                                <td>${h.fuel_types?.name || h.payment_methods?.name || '-'}</td>
                                <td>${h.quantity ? `${h.quantity} L` : '-'}</td>
                                <td class="mono font-weight-bold">${formatCurrency(h.amount)}</td>
                                <td>${h.notes || h.vehicle_number || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        modalBody.innerHTML = `<p style="color: var(--danger)">Error loading history: ${err.message}</p>`;
    }
}

function handleExportCreditLedger() {
    fetchCustomers().then(customers => {
        if (!customers || !customers.length) {
            toast.warning('No customer data to export.');
            return;
        }

        const rows = customers.map(c => [
            c.name,
            c.vehicle_number || '',
            c.contact_info || '',
            c.opening_balance || 0,
            c.total_credit_sales || 0,
            c.total_repayments || 0,
            c.outstanding_balance ?? (c.opening_balance || 0)
        ]);

        const headers = ['Customer Name', 'Vehicle Number', 'Contact Info', 'Opening Balance', 'Total Credit Sales', 'Total Repayments', 'Outstanding Balance'];
        exportToCSV(`Credit_Ledger_${getTodayDateString()}`, rows, headers);
        toast.success('Customer credit ledger exported to CSV!');
    });
}

// ==========================================
// 6. EMPLOYEES ROSTER
// ==========================================

async function loadEmployeesRoster() {
    const tbody = document.getElementById('mgr-employees-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading staff roster & pump assignments...</td></tr>';

    try {
        const [emps, nozzles] = await Promise.all([
            fetchEmployees(),
            fetchNozzles()
        ]);
        tbody.innerHTML = '';

        const activeNozzles = nozzles.filter(n => n.is_active !== false);

        // Populate operator assignment dropdown
        const assignSelect = document.getElementById('assign-operator-select');
        if (assignSelect) {
            const currentSelected = assignSelect.value;
            assignSelect.innerHTML = '<option value="">Choose an operator...</option>';
            emps.filter(e => e.role === 'operator').forEach(op => {
                const opt = document.createElement('option');
                opt.value = op.id;
                opt.textContent = `${op.full_name} (${op.phone || 'No phone'})`;
                if (currentSelected && currentSelected === op.id) opt.selected = true;
                assignSelect.appendChild(opt);
            });
        }

        for (const e of emps) {
            const tr = document.createElement('tr');
            const isActive = e.is_active !== false;

            let assignedPumpsHtml = '<span style="color: var(--text-muted); font-size: 0.85rem;">N/A (Manager)</span>';
            if (e.role === 'operator') {
                const assignedIds = await fetchOperatorNozzleAssignments(e.id);
                if (!assignedIds || assignedIds.length === 0) {
                    assignedPumpsHtml = '<span style="color: var(--danger); font-weight: 600; font-size: 0.85rem;">🔒 No Pumps (Blocked)</span>';
                } else {
                    const assignedNames = activeNozzles
                        .filter(n => assignedIds.includes(parseInt(n.id)))
                        .map(n => `<span class="badge-fuel ${n.name.includes('MS') ? 'fuel-ms' : 'fuel-hsd'}" style="margin: 2px;">${n.name}</span>`)
                        .join('');
                    assignedPumpsHtml = assignedNames || '<span style="color: var(--warning); font-size: 0.85rem;">Pumps Inactive</span>';
                }
            }

            tr.innerHTML = `
                <td><strong>${e.full_name}</strong></td>
                <td><span class="user-role-badge ${e.role === 'manager' ? 'role-manager' : 'role-operator'}">${e.role}</span></td>
                <td>${e.phone || '-'}</td>
                <td><div style="display: flex; flex-wrap: wrap; gap: 4px; max-width: 280px;">${assignedPumpsHtml}</div></td>
                <td><span style="color: ${isActive ? 'var(--success)' : 'var(--danger)'}; font-weight: 600;">${isActive ? 'Active' : 'Deactivated'}</span></td>
                <td>
                    <div style="display: flex; gap: 6px;">
                        ${e.role === 'operator' ? `<button class="btn btn-primary btn-sm" data-assign-emp="${e.id}" title="Assign Dispenser Bays">⚙️ Assign</button>` : ''}
                        <button class="btn btn-secondary btn-sm" data-toggle-emp="${e.id}" data-active="${isActive}">
                            ${isActive ? 'Deactivate' : 'Activate'}
                        </button>
                    </div>
                </td>
            `;

            tr.querySelector(`[data-assign-emp="${e.id}"]`)?.addEventListener('click', () => {
                if (assignSelect) {
                    assignSelect.value = e.id;
                    renderOperatorPumpCheckboxes(e.id);
                    assignSelect.scrollIntoView({ behavior: 'smooth' });
                }
            });

            tr.querySelector(`[data-toggle-emp="${e.id}"]`)?.addEventListener('click', async () => {
                const nextState = !isActive;
                await toggleEmployeeStatus(e.id, nextState);
                toast.info(`Updated status for ${e.full_name}`);
                loadEmployeesRoster();
            });

            tbody.appendChild(tr);
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="color: var(--danger); text-align: center;">Error loading employees: ${err.message}</td></tr>`;
    }
}

async function renderOperatorPumpCheckboxes(operatorId) {
    const container = document.getElementById('assign-nozzles-checkboxes');
    const saveBtn = document.getElementById('save-operator-pumps-btn');
    if (!container) return;

    if (!operatorId) {
        container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Select an operator on the left to configure pump permissions...</span>';
        if (saveBtn) saveBtn.disabled = true;
        return;
    }

    try {
        const [nozzles, assignedIds] = await Promise.all([
            fetchNozzles(),
            fetchOperatorNozzleAssignments(operatorId)
        ]);

        const activeNozzles = nozzles.filter(n => n.is_active !== false);
        if (activeNozzles.length === 0) {
            container.innerHTML = '<span style="color: var(--danger); font-size: 0.85rem;">No active dispenser pumps configured. Please add pumps in Pumps & Tanks first.</span>';
            if (saveBtn) saveBtn.disabled = true;
            return;
        }

        container.innerHTML = '';
        activeNozzles.forEach(n => {
            const isChecked = (assignedIds || []).includes(parseInt(n.id));
            const fuelName = n.fuel_types?.name || (n.name.includes('MS') ? 'MS' : 'HSD');

            const item = document.createElement('label');
            item.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 0.9rem; font-weight: 500; cursor: pointer; padding: 6px 10px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 4px;';
            item.innerHTML = `
                <input type="checkbox" value="${n.id}" class="op-pump-checkbox" ${isChecked ? 'checked' : ''}>
                <span>${n.name} <small class="badge-fuel ${fuelName === 'MS' ? 'fuel-ms' : 'fuel-hsd'}" style="font-size: 0.72rem;">${fuelName}</small></span>
            `;
            container.appendChild(item);
        });

        if (saveBtn) saveBtn.disabled = false;
    } catch (err) {
        console.error('Error rendering pump checkboxes:', err);
        container.innerHTML = '<span style="color: var(--danger)">Error loading pump checklist.</span>';
    }
}

function setupOperatorPumpAssignmentEvents() {
    const selectEl = document.getElementById('assign-operator-select');
    selectEl?.addEventListener('change', () => {
        renderOperatorPumpCheckboxes(selectEl.value);
    });

    document.getElementById('assign-select-all-btn')?.addEventListener('click', () => {
        document.querySelectorAll('.op-pump-checkbox').forEach(cb => cb.checked = true);
    });

    document.getElementById('assign-clear-all-btn')?.addEventListener('click', () => {
        document.querySelectorAll('.op-pump-checkbox').forEach(cb => cb.checked = false);
    });

    document.getElementById('save-operator-pumps-btn')?.addEventListener('click', async () => {
        const operatorId = selectEl?.value;
        if (!operatorId) {
            toast.error('Please select an operator first.');
            return;
        }

        const selectedIds = Array.from(document.querySelectorAll('.op-pump-checkbox:checked'))
            .map(cb => parseInt(cb.value));

        try {
            await saveOperatorNozzleAssignments(operatorId, selectedIds);
            const opName = selectEl.options[selectEl.selectedIndex]?.text.split('(')[0].trim() || 'Operator';
            toast.success(`Successfully assigned ${selectedIds.length} dispenser pump(s) to ${opName}!`);
            loadEmployeesRoster();
        } catch (err) {
            toast.error('Failed to save pump assignment: ' + err.message);
        }
    });
}

async function openAddOperatorModal() {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');

    if (modalTitle) modalTitle.textContent = 'Add New Station Operator';

    // Fetch available nozzles for pump assignment checklist
    let activeNozzles = [];
    try {
        const nozzles = await fetchNozzles();
        activeNozzles = (nozzles || []).filter(n => n.is_active !== false);
    } catch (err) {
        console.warn('Could not load nozzles for operator modal:', err);
    }

    const nozzlesChecklistHtml = activeNozzles.length > 0
        ? activeNozzles.map(n => {
            const fuelName = n.fuel_types?.name || (n.name.includes('MS') ? 'MS' : 'HSD');
            return `
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; padding: 6px 10px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 4px; cursor: pointer;">
                    <input type="checkbox" value="${n.id}" class="new-op-pump-cb">
                    <span>${n.name} <small class="badge-fuel ${fuelName === 'MS' ? 'fuel-ms' : 'fuel-hsd'}" style="font-size: 0.7rem;">${fuelName}</small></span>
                </label>
            `;
        }).join('')
        : '<p style="color: var(--text-muted); font-size: 0.85rem; grid-column: 1 / -1;">No active dispenser pumps found. Configure pumps under Hardware tab.</p>';

    if (modalBody) {
        modalBody.innerHTML = `
            <form id="new-operator-form" onsubmit="return false;">
                <div class="form-group">
                    <label for="new-op-name">Operator Full Name <span style="color: var(--danger)">*</span></label>
                    <input type="text" id="new-op-name" required placeholder="e.g. Ramesh Kumar">
                </div>
                <div class="form-group">
                    <label for="new-op-email">Work Email / Login Identifier <span style="color: var(--danger)">*</span></label>
                    <input type="email" id="new-op-email" required placeholder="e.g. ramesh.op@petrocorp.com">
                    <small style="color: var(--text-muted); font-size: 0.78rem;">Used by the operator to sign into the PetroCorp terminal.</small>
                </div>
                <div class="form-group">
                    <label for="new-op-phone">Contact Mobile Number</label>
                    <input type="tel" id="new-op-phone" placeholder="e.g. +91 98765 43210">
                </div>
                <div class="form-group">
                    <label for="new-op-password">Initial Password <span style="color: var(--danger)">*</span></label>
                    <div style="position: relative;">
                        <input type="password" id="new-op-password" required value="" placeholder="Initial password (min 6 characters)">
                        <button type="button" id="toggle-new-op-pw-btn" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 0.9rem;" title="Toggle password visibility">👁️</button>
                    </div>
                    <small style="color: var(--text-muted); font-size: 0.78rem;">Provide a secure initial password for the operator's first sign-in.</small>
                </div>
                <div class="form-group" style="margin-top: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <label style="font-weight: 600; font-size: 0.88rem; margin: 0;">Authorized Dispenser Pumps</label>
                        <div style="display: flex; gap: 6px;">
                            <button type="button" class="btn btn-secondary btn-sm" id="new-op-select-all" style="padding: 2px 8px; font-size: 0.75rem;">All</button>
                            <button type="button" class="btn btn-secondary btn-sm" id="new-op-clear-all" style="padding: 2px 8px; font-size: 0.75rem;">None</button>
                        </div>
                    </div>
                    <div id="new-op-pumps-checklist" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; max-height: 140px; overflow-y: auto; padding: 10px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                        ${nozzlesChecklistHtml}
                    </div>
                    <small style="color: var(--text-muted); font-size: 0.78rem;">Assigned pumps will be immediately accessible in their shift console.</small>
                </div>
            </form>
        `;

        document.getElementById('toggle-new-op-pw-btn')?.addEventListener('click', () => {
            const pwInput = document.getElementById('new-op-password');
            if (pwInput) {
                pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
            }
        });

        document.getElementById('new-op-select-all')?.addEventListener('click', () => {
            document.querySelectorAll('.new-op-pump-cb').forEach(cb => cb.checked = true);
        });

        document.getElementById('new-op-clear-all')?.addEventListener('click', () => {
            document.querySelectorAll('.new-op-pump-cb').forEach(cb => cb.checked = false);
        });
    }

    if (modalFooter) {
        modalFooter.innerHTML = `
            <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="save-new-op-btn">
                <span>➕</span> Add Operator
            </button>
        `;

        document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);
        document.getElementById('save-new-op-btn')?.addEventListener('click', async () => {
            const name = document.getElementById('new-op-name')?.value?.trim();
            const email = document.getElementById('new-op-email')?.value?.trim();
            const phone = document.getElementById('new-op-phone')?.value?.trim();
            const password = document.getElementById('new-op-password')?.value;

            if (!name) {
                toast.error('Operator Full Name is required.');
                document.getElementById('new-op-name')?.focus();
                return;
            }

            if (!email || !email.includes('@') || !email.includes('.')) {
                toast.error('Please enter a valid email address.');
                document.getElementById('new-op-email')?.focus();
                return;
            }

            if (!password || password.length < 6) {
                toast.error('Password must be at least 6 characters long.');
                document.getElementById('new-op-password')?.focus();
                return;
            }

            const selectedNozzleIds = Array.from(document.querySelectorAll('.new-op-pump-cb:checked'))
                .map(cb => parseInt(cb.value));

            const saveBtn = document.getElementById('save-new-op-btn');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Registering Operator...';
            }

            try {
                const newOp = await createOperator({
                    full_name: name,
                    email,
                    phone,
                    password,
                    nozzle_ids: selectedNozzleIds
                });

                toast.success(`Operator "${name}" registered successfully!`);
                closeModal();
                await loadEmployeesRoster();

                const assignSelect = document.getElementById('assign-operator-select');
                if (assignSelect && newOp?.id) {
                    assignSelect.value = newOp.id;
                    renderOperatorPumpCheckboxes(newOp.id);
                }
            } catch (err) {
                console.error('Error creating operator:', err);
                toast.error('Failed to register operator: ' + err.message);
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<span>➕</span> Add Operator';
                }
            }
        });
    }

    openModal();
}

// Modal Utility Helpers
function openModal() {
    document.getElementById('app-modal')?.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('app-modal')?.classList.add('hidden');
}


// ==========================================
// 8. DATABASE CONSOLE (FULL CRUD)
// ==========================================

let dbConsoleState = {
    currentTable: '',
    currentPage: 0,
    pageSize: 50,
    totalCount: 0,
    columns: [],
    rows: [],
    tablesMeta: []
};

function setupDatabaseConsole() {
    const tableSelect = document.getElementById('db-table-select');
    if (!tableSelect) return;

    // Populate table selector
    dbConsoleState.tablesMeta = listAvailableTables();
    dbConsoleState.tablesMeta.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.name;
        opt.textContent = `${t.icon} ${t.display}`;
        tableSelect.appendChild(opt);
    });

    tableSelect.addEventListener('change', () => {
        dbConsoleState.currentTable = tableSelect.value;
        dbConsoleState.currentPage = 0;
        if (dbConsoleState.currentTable) {
            loadDatabaseTable();
        }
    });

    document.getElementById('db-refresh-btn')?.addEventListener('click', () => loadDatabaseTable());
    document.getElementById('db-insert-btn')?.addEventListener('click', () => openDbInsertModal());

    document.getElementById('db-prev-page')?.addEventListener('click', () => {
        if (dbConsoleState.currentPage > 0) {
            dbConsoleState.currentPage--;
            loadDatabaseTable();
        }
    });

    document.getElementById('db-next-page')?.addEventListener('click', () => {
        const maxPage = Math.ceil(dbConsoleState.totalCount / dbConsoleState.pageSize) - 1;
        if (dbConsoleState.currentPage < maxPage) {
            dbConsoleState.currentPage++;
            loadDatabaseTable();
        }
    });

    // Real-time table search/filter
    const searchInput = document.getElementById('db-search-input');
    searchInput?.addEventListener('input', () => {
        const query = (searchInput.value || '').trim().toLowerCase();
        const pkCol = dbConsoleState.currentTable === 'station_settings' ? 'key' : 'id';
        if (!query) {
            renderDatabaseTable(dbConsoleState.rows, dbConsoleState.columns, dbConsoleState.currentTable, pkCol);
        } else {
            const filtered = dbConsoleState.rows.filter(r => {
                return Object.values(r).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(query));
            });
            renderDatabaseTable(filtered, dbConsoleState.columns, dbConsoleState.currentTable, pkCol);
        }
    });
}

function initDatabaseConsoleView() {
    // If a table is already selected, refresh its data
    if (dbConsoleState.currentTable) {
        loadDatabaseTable();
    }
}

async function loadDatabaseTable() {
    const tableName = dbConsoleState.currentTable;
    if (!tableName) return;

    const container = document.getElementById('db-results-container');
    const infoBar = document.getElementById('db-info-bar');
    const refreshBtn = document.getElementById('db-refresh-btn');
    const insertBtn = document.getElementById('db-insert-btn');
    const searchInput = document.getElementById('db-search-input');

    if (refreshBtn) refreshBtn.disabled = false;
    if (insertBtn) insertBtn.disabled = false;
    if (searchInput) {
        searchInput.disabled = false;
        searchInput.value = '';
    }
    if (infoBar) infoBar.style.display = '';

    if (container) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Loading table data\u2026</div>';
    }

    try {
        // Determine primary key column
        const pkCol = tableName === 'station_settings' ? 'key' : 'id';
        const orderBy = tableName === 'station_settings' ? 'key' : 'id';

        const { rows, totalCount } = await fetchTableData(tableName, {
            limit: dbConsoleState.pageSize,
            offset: dbConsoleState.currentPage * dbConsoleState.pageSize,
            orderBy,
            ascending: true
        });

        dbConsoleState.rows = rows;
        dbConsoleState.totalCount = totalCount;

        // Get table meta
        const meta = dbConsoleState.tablesMeta.find(t => t.name === tableName);
        const tableIcon = document.getElementById('db-table-icon');
        const tableNameEl = document.getElementById('db-table-name');
        const rowCountEl = document.getElementById('db-row-count');
        const pageInfoEl = document.getElementById('db-page-info');
        const prevBtn = document.getElementById('db-prev-page');
        const nextBtn = document.getElementById('db-next-page');

        if (tableIcon) tableIcon.textContent = meta?.icon || '\ud83d\uddc4\ufe0f';
        if (tableNameEl) tableNameEl.textContent = meta?.display || tableName;
        if (rowCountEl) rowCountEl.textContent = `${totalCount} row${totalCount !== 1 ? 's' : ''}`;

        const totalPages = Math.max(1, Math.ceil(totalCount / dbConsoleState.pageSize));
        if (pageInfoEl) pageInfoEl.textContent = `Page ${dbConsoleState.currentPage + 1} of ${totalPages}`;
        if (prevBtn) prevBtn.disabled = dbConsoleState.currentPage === 0;
        if (nextBtn) nextBtn.disabled = dbConsoleState.currentPage >= totalPages - 1;

        if (!rows || rows.length === 0) {
            if (container) {
                container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <p style="font-weight: 600;">Table "${tableName}" is empty</p>
                    <p style="font-size: 0.85rem;">Click "➕ Insert Row" to add data.</p>
                </div>`;
            }
            return;
        }

        // Extract columns from first row
        dbConsoleState.columns = Object.keys(rows[0]);

        renderDatabaseTable(rows, dbConsoleState.columns, tableName, pkCol);

    } catch (err) {
        console.error('Error loading table:', err);
        if (container) {
            container.innerHTML = `<div class="alert-box alert-error" style="margin: 20px;">
                Failed to load table "${tableName}": ${err.message}
            </div>`;
        }
    }
}

function renderDatabaseTable(rows, columns, tableName, pkCol) {
    const container = document.getElementById('db-results-container');
    if (!container) return;

    const truncate = (val, max = 60) => {
        const str = String(val);
        return str.length > max ? str.substring(0, max) + '\u2026' : str;
    };

    const formatCellValue = (val) => {
        if (val === null || val === undefined) return '<span style="color: var(--text-muted); font-style: italic;">null</span>';
        if (typeof val === 'boolean') return `<span style="color: ${val ? 'var(--success)' : 'var(--danger)'}; font-weight: 600;">${val}</span>`;
        if (typeof val === 'object') return `<code style="font-size: 0.78rem; word-break: break-all;">${truncate(JSON.stringify(val), 80)}</code>`;
        return truncate(String(val));
    };

    container.innerHTML = `
        <table class="data-table" style="font-size: 0.82rem;">
            <thead>
                <tr>
                    <th style="min-width: 100px;">Actions</th>
                    ${columns.map(c => `<th style="white-space: nowrap;">${c}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${rows.map((row, idx) => `
                    <tr>
                        <td style="white-space: nowrap;">
                            <div style="display: flex; gap: 4px;">
                                <button class="btn btn-secondary btn-icon" data-db-edit="${idx}" title="Edit Row">\u270f\ufe0f</button>
                                <button class="btn btn-danger btn-icon" data-db-delete="${idx}" title="Delete Row">\ud83d\uddd1\ufe0f</button>
                            </div>
                        </td>
                        ${columns.map(c => `<td class="mono" style="max-width: 280px; overflow: hidden; text-overflow: ellipsis;">${formatCellValue(row[c])}</td>`).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    // Attach edit and delete listeners
    container.querySelectorAll('[data-db-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-db-edit'));
            openDbEditModal(tableName, rows[idx], pkCol);
        });
    });

    container.querySelectorAll('[data-db-delete]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-db-delete'));
            handleDbDeleteRow(tableName, rows[idx], pkCol);
        });
    });
}

function openDbEditModal(tableName, row, pkCol) {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');

    const pkValue = row[pkCol];

    if (modalTitle) modalTitle.textContent = `Edit Row in "${tableName}" (${pkCol}: ${pkValue})`;

    const columns = Object.keys(row);
    const readOnlyFields = ['id', 'created_at', 'updated_at', 'assigned_at', 'approved_at'];

    if (modalBody) {
        modalBody.innerHTML = `
            <form id="db-edit-form" onsubmit="return false;" style="max-height: 55vh; overflow-y: auto;">
                ${columns.map(col => {
                    const val = row[col];
                    const isReadOnly = readOnlyFields.includes(col) || col === pkCol;
                    const displayVal = val === null ? '' : (typeof val === 'object' ? JSON.stringify(val) : String(val));
                    const isBool = typeof val === 'boolean';

                    if (isBool) {
                        return `
                            <div class="form-group">
                                <label>${col} ${isReadOnly ? '<span style="color: var(--text-muted); font-size: 0.75rem;">(read-only)</span>' : ''}</label>
                                <select data-db-field="${col}" ${isReadOnly ? 'disabled' : ''}>
                                    <option value="true" ${val === true ? 'selected' : ''}>true</option>
                                    <option value="false" ${val === false ? 'selected' : ''}>false</option>
                                </select>
                            </div>
                        `;
                    }

                    return `
                        <div class="form-group">
                            <label>${col} ${isReadOnly ? '<span style="color: var(--text-muted); font-size: 0.75rem;">(read-only)</span>' : ''}</label>
                            <input type="text" data-db-field="${col}" value="${displayVal.replace(/"/g, '&quot;')}" ${isReadOnly ? 'disabled style="opacity: 0.5;"' : ''}>
                        </div>
                    `;
                }).join('')}
            </form>
        `;
    }

    if (modalFooter) {
        modalFooter.innerHTML = `
            <button class="btn btn-danger" id="modal-db-delete-btn" style="margin-right: auto;">\ud83d\uddd1\ufe0f Delete Row</button>
            <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="modal-db-save-btn">\ud83d\udcbe Save Changes</button>
        `;

        document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);

        document.getElementById('modal-db-delete-btn')?.addEventListener('click', () => {
            closeModal();
            handleDbDeleteRow(tableName, row, pkCol);
        });

        document.getElementById('modal-db-save-btn')?.addEventListener('click', async () => {
            const updates = {};
            const form = document.getElementById('db-edit-form');
            if (!form) return;

            form.querySelectorAll('[data-db-field]').forEach(input => {
                const col = input.getAttribute('data-db-field');
                if (input.disabled) return;

                let val = input.value;

                // Type coerce
                if (input.tagName === 'SELECT') {
                    val = val === 'true';
                } else if (val === '' || val === 'null') {
                    val = null;
                } else if (typeof val === 'string' && (val.trim().startsWith('{') || val.trim().startsWith('['))) {
                    try {
                        val = JSON.parse(val);
                    } catch {}
                } else if (!isNaN(val) && val.trim() !== '' && !col.includes('name') && !col.includes('email') && !col.includes('phone') && !col.includes('description') && !col.includes('notes') && !col.includes('reason') && !col.includes('invoice') && !col.includes('vehicle') && !col.includes('contact') && !col.includes('code') && !col.includes('key') && !col.includes('value') && !col.includes('shift_type') && !col.includes('status') && !col.includes('date') && !col.includes('time')) {
                    val = parseFloat(val);
                }

                updates[col] = val;
            });

            if (Object.keys(updates).length === 0) {
                toast.warning('No changes detected.');
                return;
            }

            try {
                await updateTableRow(tableName, pkValue, updates, pkCol);
                toast.success(`Row updated in "${tableName}"!`);
                closeModal();
                loadDatabaseTable();
            } catch (err) {
                toast.error(`Update failed: ${err.message}`);
            }
        });
    }

    openModal();
}

function openDbInsertModal() {
    const tableName = dbConsoleState.currentTable;
    if (!tableName) return;

    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');

    if (modalTitle) modalTitle.textContent = `Insert New Row into "${tableName}"`;

    // Use columns from existing data, or provide a text area for JSON
    const columns = dbConsoleState.columns.length > 0
        ? dbConsoleState.columns.filter(c => c !== 'id' && c !== 'created_at' && c !== 'updated_at')
        : [];

    if (columns.length > 0) {
        if (modalBody) {
            modalBody.innerHTML = `
                <form id="db-insert-form" onsubmit="return false;" style="max-height: 55vh; overflow-y: auto;">
                    ${columns.map(col => `
                        <div class="form-group">
                            <label>${col}</label>
                            <input type="text" data-db-field="${col}" placeholder="Enter value\u2026">
                        </div>
                    `).join('')}
                </form>
            `;
        }
    } else {
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="form-group">
                    <label>Row Data (JSON Object)</label>
                    <textarea id="db-insert-json" rows="10" placeholder='{"column_name": "value", ...}' style="font-family: 'JetBrains Mono', monospace; font-size: 0.85rem;"></textarea>
                    <small style="color: var(--text-muted);">Enter a valid JSON object. Table has no existing rows to infer columns from.</small>
                </div>
            `;
        }
    }

    if (modalFooter) {
        modalFooter.innerHTML = `
            <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="modal-db-insert-btn">\u2795 Insert Row</button>
        `;

        document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);
        document.getElementById('modal-db-insert-btn')?.addEventListener('click', async () => {
            let rowData = {};

            if (columns.length > 0) {
                const form = document.getElementById('db-insert-form');
                if (!form) return;

                form.querySelectorAll('[data-db-field]').forEach(input => {
                    const col = input.getAttribute('data-db-field');
                    let val = input.value;
                    if (val === '' || val === 'null') return; // Skip empty fields
                    if (val === 'true') val = true;
                    else if (val === 'false') val = false;
                    else if (typeof val === 'string' && (val.trim().startsWith('{') || val.trim().startsWith('['))) {
                        try {
                            val = JSON.parse(val);
                        } catch {}
                    } else if (!isNaN(val) && val.trim() !== '' && !col.includes('name') && !col.includes('email') && !col.includes('phone') && !col.includes('description') && !col.includes('notes') && !col.includes('reason') && !col.includes('invoice') && !col.includes('vehicle') && !col.includes('contact') && !col.includes('code') && !col.includes('key') && !col.includes('value') && !col.includes('shift_type') && !col.includes('status') && !col.includes('date') && !col.includes('time')) {
                        val = parseFloat(val);
                    }
                    rowData[col] = val;
                });
            } else {
                const jsonText = document.getElementById('db-insert-json')?.value;
                try {
                    rowData = JSON.parse(jsonText);
                } catch {
                    toast.error('Invalid JSON format. Please enter a valid JSON object.');
                    return;
                }
            }

            if (Object.keys(rowData).length === 0) {
                toast.error('Please fill in at least one field.');
                return;
            }

            try {
                await insertTableRow(tableName, rowData);
                toast.success(`Row inserted into "${tableName}"!`);
                closeModal();
                loadDatabaseTable();
            } catch (err) {
                toast.error(`Insert failed: ${err.message}`);
            }
        });
    }

    openModal();
}

async function handleDbDeleteRow(tableName, row, pkCol) {
    const pkValue = row[pkCol];
    const displayId = typeof pkValue === 'string' && pkValue.length > 20 ? pkValue.substring(0, 20) + '\u2026' : pkValue;

    const confirmed = window.confirm(
        `Are you sure you want to DELETE this row from "${tableName}"?\n\n${pkCol}: ${pkValue}\n\nThis action is irreversible and directly modifies Supabase.`
    );

    if (!confirmed) return;

    try {
        await deleteTableRow(tableName, pkValue, pkCol);
        toast.success(`Row deleted from "${tableName}" (${pkCol}: ${displayId})`);
        loadDatabaseTable();
    } catch (err) {
        toast.error(`Delete failed: ${err.message}`);
    }
}
