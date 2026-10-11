/**
 * PetroCorp Station Management - Business Calculations
 * Source of Truth: docs/calculation-rules.md
 */

/**
 * Calculates Gross Quantity (Litres) dispensed by a nozzle
 * @param {number|string} openingReading 
 * @param {number|string} closingReading 
 * @returns {number}
 */
export function calculateGrossQuantity(openingReading, closingReading) {
    const open = parseFloat(openingReading);
    const close = parseFloat(closingReading);
    if (isNaN(open) || isNaN(close)) return 0;
    return Math.max(0, parseFloat((close - open).toFixed(2)));
}

/**
 * Calculates Net Quantity (Litres) after deducting calibration testing fuel
 * @param {number|string} grossQuantity 
 * @param {number|string} testingQuantity 
 * @returns {number}
 */
export function calculateNetQuantity(grossQuantity, testingQuantity) {
    const gross = parseFloat(grossQuantity) || 0;
    const test = parseFloat(testingQuantity) || 0;
    return Math.max(0, parseFloat((gross - test).toFixed(2)));
}

/**
 * Calculates Sales Amount (Rupees) for a nozzle
 * @param {number|string} netQuantity 
 * @param {number|string} ratePerLitre 
 * @returns {number}
 */
export function calculateSalesAmount(netQuantity, ratePerLitre) {
    const net = parseFloat(netQuantity) || 0;
    const rate = parseFloat(ratePerLitre) || 0;
    return parseFloat((net * rate).toFixed(2));
}

/**
 * Validates opening, closing, and testing meter readings
 * @param {number|string} opening 
 * @param {number|string} closing 
 * @param {number|string} testing 
 * @returns {{ isValid: boolean, error: string|null }}
 */
export function validateReadings(opening, closing, testing) {
    const open = parseFloat(opening);
    const close = parseFloat(closing);
    const test = parseFloat(testing) || 0;

    if (isNaN(open)) return { isValid: false, error: 'Opening reading is required and must be numeric.' };
    if (isNaN(close)) return { isValid: false, error: 'Closing reading is required and must be numeric.' };
    if (close < open) return { isValid: false, error: 'Closing reading cannot be less than opening reading.' };
    
    const gross = close - open;
    if (test < 0) return { isValid: false, error: 'Testing quantity cannot be negative.' };
    if (test > gross) return { isValid: false, error: 'Testing quantity cannot exceed gross sales quantity.' };

    return { isValid: true, error: null };
}

/**
 * Sums payment collections across all methods
 * @param {Array<{ amount: number|string }> | Object.<string, number>} payments 
 * @returns {number}
 */
export function calculateTotalCollections(payments) {
    if (!payments) return 0;
    let total = 0;
    if (Array.isArray(payments)) {
        payments.forEach(p => {
            total += parseFloat(p.amount || 0) || 0;
        });
    } else if (typeof payments === 'object') {
        Object.values(payments).forEach(v => {
            total += parseFloat(v || 0) || 0;
        });
    }
    return parseFloat(total.toFixed(2));
}

/**
 * Calculates Total Deductions for shift reconciliation
 * total_deductions = payment_collections + new_credit_sales + cheques + expenses
 * @param {number} collections - Cash & digital payments
 * @param {number} creditSales - Total new Udhaari logged in shift
 * @param {number} expenses - Total expenses paid from cash in shift
 * @param {number} [cheques=0] - Cheque collections if tracked separately
 * @returns {number}
 */
export function calculateTotalDeductions(collections, creditSales, expenses, cheques = 0) {
    const col = parseFloat(collections) || 0;
    const cred = parseFloat(creditSales) || 0;
    const exp = parseFloat(expenses) || 0;
    const chq = parseFloat(cheques) || 0;
    return parseFloat((col + cred + exp + chq).toFixed(2));
}

/**
 * Calculates Extra / Short Cash difference
 * extra_short = total_sales_amount - total_deductions
 * Positive (> 0): Shortage (Cashier handed over less than expected)
 * Negative (< 0): Excess / Extra (Cashier handed over more than expected)
 * Zero (= 0): Perfectly balanced
 * @param {number} totalSalesAmount 
 * @param {number} totalDeductions 
 * @returns {number}
 */
export function calculateExtraShort(totalSalesAmount, totalDeductions) {
    const sales = parseFloat(totalSalesAmount) || 0;
    const deductions = parseFloat(totalDeductions) || 0;
    return parseFloat((sales - deductions).toFixed(2));
}

/**
 * DSSR: Calculates Expected Stock Sales based on Tank levels
 * stock_sales = (total_opening_stock + fuel_receipts) - closing_stock
 * @param {number} openingStock 
 * @param {number} receipts 
 * @param {number} closingStock 
 * @returns {number}
 */
export function calculateTankSales(openingStock, receipts, closingStock) {
    const open = parseFloat(openingStock) || 0;
    const rec = parseFloat(receipts) || 0;
    const close = parseFloat(closingStock) || 0;
    return parseFloat(((open + rec) - close).toFixed(2));
}

/**
 * DSSR: Calculates Stock Variation
 * stock_variation = meter_sales - stock_sales
 * Positive (> 0): Meters showed more sales than tank drop
 * Negative (< 0): Tank lost more fuel than meters recorded
 * @param {number} meterSales 
 * @param {number} stockSales 
 * @returns {number}
 */
export function calculateStockVariation(meterSales, stockSales) {
    const mSales = parseFloat(meterSales) || 0;
    const sSales = parseFloat(stockSales) || 0;
    return parseFloat((mSales - sSales).toFixed(2));
}

/**
 * Calculates Customer Outstanding Balance
 * outstanding = opening_balance + credit_sales - repayments
 * @param {number} openingBalance 
 * @param {number} creditSales 
 * @param {number} repayments 
 * @returns {number}
 */
export function calculateCustomerBalance(openingBalance, creditSales, repayments) {
    const open = parseFloat(openingBalance) || 0;
    const sales = parseFloat(creditSales) || 0;
    const reps = parseFloat(repayments) || 0;
    return parseFloat((open + sales - reps).toFixed(2));
}
