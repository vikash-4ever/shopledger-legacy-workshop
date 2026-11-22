'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');
const reports = require('../lib/reports');

test('CURRENT BEHAVIOUR: order pricing uses the HSN slab and taxes the post-discount amount', function () {
  const totals = pricing.computeTotals([
    { id: 1, name: 'Rice', hsn: '1006', price: 1000, qty: 1 }
  ], 'SAVE10');

  assert.deepEqual({
    subtotal: totals.subtotal,
    discount: totals.discount,
    taxable: totals.taxable,
    tax: totals.tax,
    cgst: totals.cgst,
    sgst: totals.sgst,
    total: totals.total,
    lineGstPercent: totals.lines[0].gstPercent
  }, {
    subtotal: 1000,
    discount: 100,
    taxable: 900,
    tax: 45,
    cgst: 22.5,
    sgst: 22.5,
    total: 945,
    lineGstPercent: 5
  });
});

test('CURRENT BEHAVIOUR: invoice ignores HSN when gstRate is absent and applies default GST to gross price', function () {
  const figures = invoice.computeInvoiceFigures({
    items: [{ name: 'Rice', sku: 'RICE-1', hsn: '1006', price: 1000, qty: 1 }]
  });

  assert.deepEqual({
    subtotal: figures.subtotal,
    tax: figures.tax,
    cgst: figures.cgst,
    sgst: figures.sgst,
    total: figures.total,
    lineGstPercent: figures.rows[0].gstPercent,
    lineTax: figures.rows[0].lineTax
  }, {
    subtotal: 1000,
    tax: 180,
    cgst: 90,
    sgst: 90,
    total: 1180,
    lineGstPercent: 18,
    lineTax: 180
  });
});

test('CURRENT BEHAVIOUR: invoice and order ledger GST breakdowns diverge for an HSN-rated coupon order', function () {
  const items = [{ id: 1, name: 'Rice', hsn: '1006', price: 1000, qty: 1 }];
  const ledgerFigures = pricing.computeTotals(items, 'SAVE10');
  const invoiceFigures = invoice.computeInvoiceFigures({ items, coupon: 'SAVE10' });

  assert.deepEqual({
    ledgerDiscount: ledgerFigures.discount,
    ledgerTax: ledgerFigures.tax,
    ledgerTotal: ledgerFigures.total,
    invoiceDiscount: invoiceFigures.discount,
    invoiceTax: invoiceFigures.tax,
    invoiceTotal: invoiceFigures.total
  }, {
    ledgerDiscount: 100,
    ledgerTax: 45,
    ledgerTotal: 945,
    invoiceDiscount: 118,
    invoiceTax: 180,
    invoiceTotal: 1062
  });
});

test('CURRENT BEHAVIOUR: invoice percent coupon ignores configured maximum discount', function () {
  const items = [{ id: 1, name: 'Rice', hsn: '1006', price: 2000, qty: 1 }];
  const ledgerFigures = pricing.computeTotals(items, 'SAVE10');
  const invoiceFigures = invoice.computeInvoiceFigures({ items, coupon: 'SAVE10' });

  assert.deepEqual({
    configuredCap: 150,
    ledgerDiscount: ledgerFigures.discount,
    invoiceDiscount: invoiceFigures.discount,
    ledgerTax: ledgerFigures.tax,
    invoiceTax: invoiceFigures.tax,
    ledgerTotal: ledgerFigures.total,
    invoiceTotal: invoiceFigures.total
  }, {
    configuredCap: 150,
    ledgerDiscount: 150,
    invoiceDiscount: 236,
    ledgerTax: 92.5,
    invoiceTax: 360,
    ledgerTotal: 1942.5,
    invoiceTotal: 2124
  });
});

test('CURRENT BEHAVIOUR: GST reconciliation compares invoice figures with stored totals in memory', function () {
  const order = {
    id: 42,
    date: '22/11/2026',
    customer: 'Test Customer',
    coupon: 'SAVE10',
    status: 'completed',
    items: [{ id: 1, name: 'Rice', hsn: '1006', price: 1000, qty: 1 }],
    subtotal: 1000,
    discount: 100,
    tax: 45,
    total: 945
  };
  const result = reports.getGstReconciliation({
    orders: [order],
    customers: [],
    products: []
  });

  assert.deepEqual({
    totalChecked: result.totalChecked,
    mismatchCount: result.mismatchCount,
    totalDelta: result.totalDelta,
    ledgerTax: result.rows[0].ledgerTax,
    invoiceTax: result.rows[0].invoiceTax,
    ledgerTotal: result.rows[0].ledgerTotal,
    invoiceTotal: result.rows[0].invoiceTotal,
    delta: result.rows[0].delta,
    matched: result.rows[0].matched
  }, {
    totalChecked: 1,
    mismatchCount: 1,
    totalDelta: 117,
    ledgerTax: 45,
    invoiceTax: 180,
    ledgerTotal: 945,
    invoiceTotal: 1062,
    delta: 117,
    matched: false
  });
});

test('CURRENT BEHAVIOUR: invoice HTML displays combined GST, not separate CGST and SGST amounts', function () {
  const html = invoice.render({
    id: 42,
    date: '22/11/2026',
    status: 'completed',
    items: [{ name: 'Rice', hsn: '1006', price: 1000, qty: 1 }],
    total: 1180
  });

  assert.match(html, /CGST \+ SGST \(Total GST\)/);
  assert.match(html, /₹180\.00/);
  assert.doesNotMatch(html, /CGST ₹90\.00/);
  assert.doesNotMatch(html, /SGST ₹90\.00/);
});
