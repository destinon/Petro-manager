/**
 * Unit Tests for PetroCorp Calculations
 * Run with: node tests/calculations.test.js
 */
import assert from 'node:assert';
import test from 'node:test';
import {
    calculateGrossQuantity,
    calculateNetQuantity,
    calculateSalesAmount,
    validateReadings,
    calculateTotalCollections,
    calculateTotalDeductions,
    calculateExtraShort,
    calculateTankSales,
    calculateStockVariation,
    calculateCustomerBalance
} from '../src/calculations/calculations.js';

test('1. calculateGrossQuantity calculates difference correctly', () => {
    assert.strictEqual(calculateGrossQuantity(100.5, 250.75), 150.25);
    assert.strictEqual(calculateGrossQuantity('1000', '1500'), 500);
    assert.strictEqual(calculateGrossQuantity('abc', 100), 0);
    assert.strictEqual(calculateGrossQuantity(200, 100), 0); // No negative gross
});

test('2. calculateNetQuantity deducts testing quantity correctly', () => {
    assert.strictEqual(calculateNetQuantity(150.25, 5), 145.25);
    assert.strictEqual(calculateNetQuantity(500, 0), 500);
    assert.strictEqual(calculateNetQuantity(10, 15), 0); // Testing > gross returns 0
});

test('3. calculateSalesAmount multiplies net quantity by rate', () => {
    // 145.25 litres @ ₹96.72/litre
    const amount = calculateSalesAmount(145.25, 96.72);
    assert.strictEqual(amount, 14048.58);
    assert.strictEqual(calculateSalesAmount(0, 96.72), 0);
});

test('4. validateReadings catches invalid inputs', () => {
    assert.deepStrictEqual(validateReadings(100, 200, 5), { isValid: true, error: null });
    assert.strictEqual(validateReadings('abc', 200, 0).isValid, false);
    assert.strictEqual(validateReadings(200, 100, 0).isValid, false); // closing < opening
    assert.strictEqual(validateReadings(100, 200, 150).isValid, false); // testing > gross
    assert.strictEqual(validateReadings(100, 200, -5).isValid, false); // testing < 0
});

test('5. calculateTotalCollections sums various payment formats', () => {
    const arrayPayments = [
        { amount: 1500.50 },
        { amount: 2000 },
        { amount: 499.50 }
    ];
    assert.strictEqual(calculateTotalCollections(arrayPayments), 4000);

    const objectPayments = {
        cash: 1000,
        paytm: 500,
        phonepe: 500
    };
    assert.strictEqual(calculateTotalCollections(objectPayments), 2000);
});

test('6. calculateTotalDeductions sums collections, credits, expenses, and cheques', () => {
    // collections: 50000, creditSales: 15000, expenses: 2500, cheques: 5000
    const deductions = calculateTotalDeductions(50000, 15000, 2500, 5000);
    assert.strictEqual(deductions, 72500);
});

test('7. calculateExtraShort detects shortage, excess, and balanced', () => {
    // Sales: 75,000, Deductions: 74,500 => Shortage of ₹500 (+500)
    assert.strictEqual(calculateExtraShort(75000, 74500), 500);

    // Sales: 75,000, Deductions: 75,200 => Excess/Extra of ₹200 (-200)
    assert.strictEqual(calculateExtraShort(75000, 75200), -200);

    // Sales: 75,000, Deductions: 75,000 => Balanced (0)
    assert.strictEqual(calculateExtraShort(75000, 75000), 0);
});

test('8. calculateTankSales derives tank drop', () => {
    // Opening: 10,000 L, Receipts: 5,000 L, Closing: 8,000 L => Sales: 7,000 L
    assert.strictEqual(calculateTankSales(10000, 5000, 8000), 7000);
});

test('9. calculateStockVariation compares meters to tanks', () => {
    // Meter sales: 7,050 L, Tank sales: 7,000 L => +50 L variation
    assert.strictEqual(calculateStockVariation(7050, 7000), 50);

    // Meter sales: 6,950 L, Tank sales: 7,000 L => -50 L variation (loss)
    assert.strictEqual(calculateStockVariation(6950, 7000), -50);
});

test('10. calculateCustomerBalance tracks outstanding credit correctly', () => {
    // Opening: ₹5,000, New Credit: ₹12,000, Repayment: ₹10,000 => ₹7,000 outstanding
    assert.strictEqual(calculateCustomerBalance(5000, 12000, 10000), 7000);
});

console.log('All calculation tests defined successfully.');
