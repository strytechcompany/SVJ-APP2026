import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { settingsAPI } from './api';
import { safeNumber } from '../utils/safeNumber';

// ─── Module-level singleton lock ──────────────────────────────────────────────
// expo-print's native layer only allows ONE print/file operation at a time.
// Using printToFileAsync+shareAsync completely avoids the Print.printAsync
// singleton lock that causes "Another print request is already in progress".
let _busy = false;
const acquire = () => { if (_busy) return false; _busy = true; return true; };
const release = () => { _busy = false; };

const THERMAL_PAPER_MM = 58;
const THERMAL_WIDTH_PTS = Math.round((THERMAL_PAPER_MM * 72) / 25.4);

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatMoney = (value) => safeNumber(Number(value)).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const formatMoneyInt = (value) => safeNumber(Number(value)).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const formatGram = (value) => `${Number(value || 0).toFixed(3)}g`;
// 4 decimal places; returns '' when value is zero (no trailing zeros shown)
const fmt4 = (v) => { const n = Number(v || 0); return n === 0 ? '' : n.toFixed(4); };
// Purity/touch: up to 2 decimal places, strips trailing zeros (91.60 → "91.6")
const fmtPurity = (v) => { const n = Number(v || 0); return n === 0 ? '' : parseFloat(n.toFixed(2)).toString(); };

// Remainder Table (Wastage's Subtraction Amount / Plus's Reminder Pure): an
// optional final adjustment subtracted from whichever balance is currently
// active, converting a sign flip instead of ever leaving either negative.
// A subtraction of 0 is a no-op. Mirrors the backend's applyRemainderSubtraction.
const applyRemainderSubtraction = (oldBalance, advanceBalance, subtraction) => {
  if (advanceBalance > 0 && oldBalance === 0) {
    const bal = safeNumber(advanceBalance - subtraction);
    return bal < 0
      ? { oldBalance: safeNumber(Math.abs(bal)), advanceBalance: 0 }
      : { oldBalance: 0, advanceBalance: bal };
  }
  const bal = safeNumber(oldBalance - subtraction);
  return bal < 0
    ? { oldBalance: 0, advanceBalance: safeNumber(advanceBalance + Math.abs(bal)) }
    : { oldBalance: bal, advanceBalance: advanceBalance };
};
const splitLines = (value, fallback = '') =>
  String(value ?? fallback)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const renderRow = (label, value, valueClass = '') => `
  <div class="detail-row">
    <div class="detail-label">${escapeHtml(label)}</div>
    <div class="detail-value ${valueClass}">${value}</div>
  </div>
`;

const generateHTML = async (transaction, isThermal = true, customTamilMsg) => {
  const settingsReq = await settingsAPI.getSettings();
  const settings = settingsReq.data.data;
  const { shopProfile, billSettings } = settings;
  const tamilMsg = customTamilMsg ?? billSettings.tamilMessage;
  const footerMsg = billSettings.footerMessage;
  const shopName = shopProfile?.shopName || 'Sri Vaishnavi Jewellers';
  const addressLines = (shopProfile?.address || 'No 370, Big Bazaar Street\n(Opp. B.G. Naidu Sweets)')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const phoneLines = [shopProfile?.phone1, shopProfile?.phone2].filter(Boolean);
  const {
    _id,
    createdAt,
    transactionType,
    customerId,
    issueItems = [],
    receiptItems = [],
    paymentMode,
    paymentDetails,
    issueTotalWeight,
    issueTotalAmount,
    receiptTotalWeight,
    receiptTotalAmount,
    finalAmount,
    goldRate,
    description,
    goldPaymentWeight,
    goldPaymentPurity,
    goldConvertedAmount,
    oldBalanceBefore,
    oldBalanceAfter,
    advanceBalanceBefore,
    advanceBalanceAfter,
    convertedGram,
    gstDetails,
  } = transaction;

  const dateStr = new Date(createdAt).toLocaleDateString('en-GB');
  const timeStr = new Date(createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const row = (label, value, className = '') => `
    <div class="info-row ${className}">
      <div class="label-cell">${label}</div>
      <div class="value-cell">${value}</div>
    </div>
  `;

  const thermalStyles = `
    @page { size: 58mm auto; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      width: 58mm;
      height: auto;
      background: #fff;
      color: #000;
      font-family: monospace;
      font-size: 12px;
      font-weight: 700;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    * { box-sizing: border-box; color: #000; background: #fff; }
    .receipt-container {
      width: 100%;
      height: auto;
      margin: 0;
      padding: 2mm;
      font-family: monospace;
      font-size: 12px;
      font-weight: 600;
      color: #000;
      background: #fff;
      text-align: left;
    }
    .center { text-align: center; }
    .left { text-align: left; }
    .right { text-align: right; }
    .bold { font-weight: 700; }
    .shop-name { font-size: 18px; font-weight: 700; line-height: 1.05; }
    .subline { font-size: 12px; line-height: 1.15; }
    .divider {
      border: none;
      border-top: 1px dashed #000;
      margin: 4px 0;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      gap: 2mm;
      margin: 1px 0;
      width: 100%;
    }
    .label-cell {
      flex: 0 0 42%;
      text-align: left;
    }
    .value-cell {
      flex: 1;
      text-align: right;
      word-break: break-word;
      white-space: pre-wrap;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 4px 0;
      font-size: 11px;
      color: #000;
      background: #fff;
    }
    th, td {
      text-align: left;
      padding: 2px 0;
      vertical-align: top;
      white-space: normal;
      word-break: break-word;
      color: #000;
      background: #fff;
    }
    th { border-bottom: 1px dashed #000; font-weight: 700; white-space: nowrap; }
    .amt-col { text-align: right; }
    .item-col { width: 36%; }
    .weight-col { width: 22%; }
    .purity-col { width: 18%; }
    .amount-col { width: 24%; text-align: right; }
    .rate-banner {
      width: 100%;
      text-align: center;
      padding: 2mm 1mm;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      margin: 4px 0;
      font-weight: 700;
    }
  `;

  const styles = thermalStyles; // Standardize all printing to 80mm Thermal Receipt

  const customerInfo = (customerId && typeof customerId === 'object')
    ? customerId
    : (transaction.customer || {});

  let issueRows = '';
  issueItems.forEach(item => {
    issueRows += `
      <tr>
        <td class="item-col">${item.itemName || '-'}</td>
        <td class="weight-col">${fmt4(item.weight) || '-'}</td>
        <td class="purity-col">${fmtPurity(item.purity) || '-'}</td>
        <td class="amount-col">${formatMoneyInt(item.amount) || '-'}</td>
      </tr>
    `;
  });

  let receiptRows = '';
  receiptItems.forEach(item => {
    receiptRows += `
      <tr>
        <td class="item-col">${item.receiptType || '-'}</td>
        <td class="weight-col">${fmt4(item.weight) || '-'}</td>
        <td class="purity-col">${fmtPurity(item.purity) || '-'}</td>
        <td class="amount-col">${formatMoneyInt(item.amount) || '-'}</td>
      </tr>
    `;
  });

  const cgst = gstDetails?.cgstAmount || 0;
  const sgst = gstDetails?.sgstAmount || 0;
  const collectedAmount = paymentMode === 'Gold' ? goldConvertedAmount : (paymentDetails?.amount || 0);

  return `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>${styles}</style>
      </head>
      <body>
        <div class="receipt-container">
        <div class="divider"></div>
        <div class="center bold">${escapeHtml((transactionType || 'B2C') + ' BILL')}</div>
        <div class="divider"></div>

        ${transaction.commonBillNo ? row('Bill No:', escapeHtml(transaction.commonBillNo)) : ''}
        ${row('Date/Time:', `${dateStr} ${timeStr}`)}

        <div class="divider"></div>
        <div class="bold">CUSTOMER DETAILS</div>
        ${row('Name:', escapeHtml(customerInfo.customerName || 'N/A'))}
        ${row('Phone:', escapeHtml(customerInfo.phoneNumber || 'N/A'))}
        ${Number(oldBalanceBefore) ? row('Old Bal:', `${Number(oldBalanceBefore).toFixed(3)}g`) : ''}
        ${Number(advanceBalanceBefore) ? row('Advance:', `${Number(advanceBalanceBefore).toFixed(3)}g`) : ''}

        ${issueItems.length > 0 ? `
          <div class="divider"></div>
          <div class="bold">ISSUED PRODUCTS</div>
          <table>
            <thead>
              <tr><th>Item</th><th>Wt(g)</th><th>Purity</th><th class="amt-col">Amt(\u20B9)</th></tr>
            </thead>
            <tbody>${issueRows}</tbody>
          </table>
        ` : ''}

        ${receiptItems.length > 0 ? `
          <div class="divider"></div>
          <div class="bold">RECEIVED ITEMS</div>
          <table>
            <thead>
              <tr><th>Type</th><th>Wt(g)</th><th>Purity</th><th class="amt-col">Amt(\u20B9)</th></tr>
            </thead>
            <tbody>${receiptRows}</tbody>
          </table>
        ` : ''}

        <div class="divider"></div>
        <div class="bold">PAYMENT DETAILS</div>
        ${row('Mode:', paymentMode)}
        ${paymentMode === 'Gold' ? `
          ${row('Gold Wt:', `${goldPaymentWeight}g (${goldPaymentPurity})`)}
        ` : ''}
        ${row('Collected Amt:', collectedAmount.toLocaleString('en-IN', {maximumFractionDigits:2}))}
        ${description ? row('Desc:', description) : ''}

        <div class="divider"></div>
        <div class="bold">PAYMENT SUMMARY</div>
        ${row('Subtotal:', (issueTotalAmount - receiptTotalAmount).toLocaleString('en-IN', {maximumFractionDigits:2}))}
        ${gstDetails?.isOn ? `
          ${gstDetails.hsnCode ? row('HSN Code:', escapeHtml(gstDetails.hsnCode)) : ''}
          ${row(`CGST (${gstDetails.cgstPercent || ''}%):`, cgst.toLocaleString('en-IN', {maximumFractionDigits:2}))}
          ${row(`SGST (${gstDetails.sgstPercent || ''}%):`, sgst.toLocaleString('en-IN', {maximumFractionDigits:2}))}
        ` : ''}
        ${row('FINAL AMOUNT:', `\u20B9${finalAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}`, 'bold')}
        ${row('PAID:', `- \u20B9${collectedAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}`, 'bold')}
        ${row('BALANCE DUE:', `\u20B9${Math.max(0, finalAmount - collectedAmount).toLocaleString('en-IN', {maximumFractionDigits:2})}`, 'bold')}
        </div>
      </body>
    </html>
  `;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────
const generateThermalReceiptHTML = async (transaction, customTamilMsg) => {
  const settingsReq = await settingsAPI.getSettings();
  const settings = settingsReq.data.data;
  const { shopProfile, billSettings } = settings;
  const tamilMsg = customTamilMsg ?? billSettings.tamilMessage;
  const footerMsg = billSettings.footerMessage;
  const {
    _id,
    createdAt,
    transactionType,
    customerId,
    issueItems = [],
    receiptItems = [],
    paymentMode,
    paymentDetails,
    issueTotalWeight,
    issueTotalPurity,
    issueTotalAmount,
    receiptTotalWeight,
    receiptTotalPurity,
    receiptTotalAmount,
    finalAmount,
    balanceAmount,
    isWastage,
    goldRate,
    description,
    goldPaymentWeight,
    goldPaymentPurity,
    goldConvertedAmount,
    oldBalanceBefore,
    oldBalanceAfter,
    advanceBalanceBefore,
    advanceBalanceAfter,
    convertedGram,
    gstDetails,
    status,
    plusCashAmount,
    plusCashRate,
    plusFinalGram,
    plusCashRows = [],
    plusGramRows = [],
    plusTotalGram,
    plusOutstanding,
    wastageSubtractionAmount,
    plusReminderPure,
    reminderDate,
  } = transaction;

  const shopName = shopProfile?.shopName || 'Sri Vaishnavi Jewellers';
  const addressLines = splitLines(
    shopProfile?.address,
    'No 370, Big Bazaar Street\n(Opp. B.G. Naidu Sweets)'
  );
  const phoneLine = [shopProfile?.phone1, shopProfile?.phone2].filter(Boolean).join(' / ');
  const billTitle = `${transactionType || 'B2C'} BILL`;
  const dateStr = new Date(createdAt).toLocaleDateString('en-GB');
  const timeStr = new Date(createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const cgst = gstDetails?.cgstAmount || 0;
  const sgst = gstDetails?.sgstAmount || 0;
  const collectedAmount = paymentMode === 'Gold' ? goldConvertedAmount : (paymentDetails?.amount || 0);
  const balanceDue = Math.max(0, finalAmount - collectedAmount);
  // Wastage: Final Cash mirrors the manually-entered Amount Collected directly
  // (confirmed business rule) — it no longer nets against Issue/Receipt totals.
  const wastageNetFinalCash = safeNumber(collectedAmount);
  // B2D is a gram-only ledger (no money): Issue/Receipt Gram, Outstanding Balance.
  // Wastage uses a cash model (WW × Rate) and is handled separately below.
  const isB2DBill = transactionType === 'B2D';
  const isGramOnly = isB2DBill;
  // Plus: every non-Wastage B2C bill — a Pure-weight (gram) ledger, no cash/GST involved.
  const isPlusBill = transactionType === 'B2C' && !isWastage;

  const commonBillNo = transaction.commonBillNo || '';
  const customerInfo = (customerId && typeof customerId === 'object')
    ? customerId
    : (transaction.customer || {});

  const issueRows = isWastage
    ? issueItems.map((item) => `
        <tr>
          <td class="wc-item">${escapeHtml(item.itemName || '-')}</td>
          <td class="wc-ww">${fmt4(item.value1) || '-'}</td>
          <td class="wc-rate">${formatMoneyInt(item.rate) || '-'}</td>
          <td class="wc-cash">${formatMoneyInt(item.amount) || '-'}</td>
        </tr>
      `).join('')
    : isB2DBill
    ? issueItems.map((item) => `
        <tr>
          <td class="bd-item">${escapeHtml(item.itemName || '-')}</td>
          <td class="bd-wt">${fmt4(item.weight) || '-'}</td>
          <td class="bd-touch">${fmtPurity(item.actualTouch) || '-'}</td>
          <td class="bd-purity">${fmtPurity(item.purity) || '-'}</td>
        </tr>
      `).join('')
    : issueItems.map((item) => `
        <tr>
          <td class="item-col">${escapeHtml(item.itemName || '-')}</td>
          <td class="weight-col">${fmt4(item.weight) || '-'}</td>
          <td class="purity-col">${fmtPurity(item.sriBill) || '-'}</td>
          <td class="amount-col">${fmt4(safeNumber(item.purity)) || '-'}</td>
        </tr>
      `).join('');

  const receiptRows = isWastage
    ? receiptItems.map((item) => `
        <tr>
          <td class="wc-item">${escapeHtml(item.receiptType || '-')}</td>
          <td class="wc-ww">${fmt4(item.weight) || '-'}</td>
          <td class="wc-rate">${formatMoneyInt(item.rate) || '-'}</td>
          <td class="wc-cash">${formatMoneyInt(item.amount) || '-'}</td>
        </tr>
      `).join('')
    : isB2DBill
    ? receiptItems.map((item) => `
        <tr>
          <td class="bd-item">${escapeHtml(item.receiptType || '-')}</td>
          <td class="bd-wt">${fmt4(item.weight) || '-'}</td>
          <td class="bd-touch">${fmtPurity(item.sriCost) || '-'}</td>
          <td class="bd-purity">${fmtPurity(item.purity) || '-'}</td>
        </tr>
      `).join('')
    : receiptItems.map((item) => `
        <tr>
          <td class="item-col">${escapeHtml(item.receiptType || '-')}</td>
          <td class="weight-col">${fmt4(item.weight) || '-'}</td>
          <td class="purity-col">${fmtPurity(item.actualTouch) || '-'}</td>
          <td class="amount-col">${fmt4(safeNumber(item.purity)) || '-'}</td>
        </tr>
      `).join('');

  return `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          @page { size: 58mm auto; margin: 0; }
          html, body {
            width: 58mm;
            margin: 0;
            padding: 0;
            background: #fff;
            color: #000;
            font-family: monospace;
            font-size: 12px;
            font-weight: 600;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          * { box-sizing: border-box; }
          .receipt {
            width: 100%;
            max-width: 58mm;
            margin: 0 auto;
            padding: 2mm;
          }
          .center { text-align: center; }
          .shop-header { width: 100%; text-align: center; }
          .shop-name { font-size: 18px; font-weight: 700; line-height: 1.05; }
          .subline { font-size: 12px; line-height: 1.15; white-space: pre-wrap; word-break: break-word; }
          .divider { border: none; border-top: 1px dashed #000; margin: 2px 0; }
          .detail-row { display: flex; justify-content: space-between; gap: 2mm; margin: 0; width: 100%; }
          .detail-label { flex: 0 0 42%; text-align: left; }
          .detail-value { flex: 1; text-align: right; word-break: break-word; white-space: pre-wrap; }
          .rate-banner { width: 100%; text-align: center; font-weight: 700; padding: 1mm; border-top: 1px dashed #000; border-bottom: 1px dashed #000; margin: 2px 0; }
          .section-title { text-align: center; font-weight: 700; margin: 2px 0 1px; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 2px 0; font-size: 11px; }
          th, td { padding: 2px 0; vertical-align: top; white-space: normal; word-break: break-word; }
          th { text-align: left; border-bottom: 1px dashed #000; font-weight: 700; white-space: nowrap; }
          .item-col { width: 36%; }
          .weight-col { width: 22%; }
          .purity-col { width: 18%; }
          .amount-col { width: 24%; text-align: right; }
          .wi-item { width: 28%; }
          .wi-wt { width: 18%; }
          .wi-wst { width: 18%; }
          .wi-touch { width: 16%; }
          .wi-purity { width: 20%; text-align: right; }
          .wc-item { width: 34%; }
          .wc-ww { width: 22%; }
          .wc-rate { width: 20%; }
          .wc-cash { width: 24%; text-align: right; }
          .bd-item { width: 34%; }
          .bd-wt { width: 22%; }
          .bd-touch { width: 20%; }
          .bd-purity { width: 24%; text-align: right; }
          .footer { text-align: center; white-space: pre-wrap; word-break: break-word; margin-top: 4px; }
          .right { text-align: right; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <hr class="divider" />
          <div class="center section-title">${escapeHtml(billTitle)}</div>
          <hr class="divider" />

          ${commonBillNo ? renderRow('Bill No:', escapeHtml(commonBillNo)) : ''}
          ${renderRow('Date:', escapeHtml(dateStr))}
          ${renderRow('Time:', escapeHtml(timeStr))}

          <hr class="divider" />
          <div class="section-title">CUSTOMER DETAILS</div>
          ${renderRow('Customer Name:', escapeHtml(customerInfo.customerName || 'N/A'))}
          ${renderRow('Phone:', escapeHtml(customerInfo.phoneNumber || 'N/A'))}
          ${Number(oldBalanceBefore) ? renderRow('Old Balance:', isWastage ? `₹${formatMoney(safeNumber(oldBalanceBefore))}` : formatGram(oldBalanceBefore)) : ''}
          ${!isWastage && Number(advanceBalanceBefore) ? renderRow('Advance:', formatGram(advanceBalanceBefore)) : ''}

          ${issueItems.length > 0 ? `
            <hr class="divider" />
            <div class="section-title">ISSUED PRODUCTS</div>
            <table>
              <thead>
                <tr>
                  ${isWastage ? `
                    <th class="wc-item">Item</th>
                    <th class="wc-ww">WW(g)</th>
                    <th class="wc-rate">Rate(\u20B9)</th>
                    <th class="wc-cash">Cash(\u20B9)</th>
                  ` : isB2DBill ? `
                    <th class="bd-item">Item</th>
                    <th class="bd-wt">Wt(g)</th>
                    <th class="bd-touch">A.Tch%</th>
                    <th class="bd-purity">Purity</th>
                  ` : `
                    <th class="item-col">Item</th>
                    <th class="weight-col">Wt(g)</th>
                    <th class="purity-col">SRI Bill</th>
                    <th class="amount-col">Pure</th>
                  `}
                </tr>
              </thead>
              <tbody>${issueRows}</tbody>
            </table>
          ` : ''}

          ${receiptItems.length > 0 ? `
            <hr class="divider" />
            <div class="section-title">RECEIVED ITEMS</div>
            <table>
              <thead>
                <tr>
                  ${isWastage ? `
                    <th class="wc-item">Type</th>
                    <th class="wc-ww">Wt(g)</th>
                    <th class="wc-rate">Rate(₹)</th>
                    <th class="wc-cash">Cash(₹)</th>
                  ` : isB2DBill ? `
                    <th class="bd-item">Item</th>
                    <th class="bd-wt">Wt(g)</th>
                    <th class="bd-touch">SRI%</th>
                    <th class="bd-purity">Purity</th>
                  ` : `
                    <th class="item-col">Item</th>
                    <th class="weight-col">Wt(g)</th>
                    <th class="purity-col">Buying %</th>
                    <th class="amount-col">Pure</th>
                  `}
                </tr>
              </thead>
              <tbody>${receiptRows}</tbody>
            </table>
          ` : ''}

          ${!isGramOnly && !isPlusBill ? `
            <hr class="divider" />
            <div class="section-title">PAYMENT DETAILS</div>
            ${renderRow('Payment Mode', escapeHtml(paymentMode || 'N/A'))}
            ${paymentMode === 'Gold' ? renderRow('Gold Wt:', `${escapeHtml(goldPaymentWeight)}g (${escapeHtml(goldPaymentPurity)})`) : ''}
            ${renderRow('Collected Amount', `\u20B9${formatMoney(collectedAmount)}`)}
            ${description ? renderRow('Description', escapeHtml(description)) : ''}
          ` : ''}

          ${isPlusBill && plusCashRows.length > 0 ? `
            <hr class="divider" />
            <div class="section-title">CASH CONVERSION DETAILS</div>
            ${plusCashRows.map(row => renderRow(`₹${formatMoney(safeNumber(row.cash))} @ ₹${formatMoney(safeNumber(row.rate))}`, formatGram(safeNumber(row.finalGram)))).join('')}
          ` : ''}

          ${isPlusBill && plusGramRows.length > 0 ? `
            <hr class="divider" />
            <div class="section-title">GRAM DETAILS</div>
            ${plusGramRows.map((row, idx) => renderRow(`Item ${idx + 1}`, formatGram(safeNumber(row.gram)))).join('')}
          ` : ''}

          <hr class="divider" />
          <div class="section-title">SUMMARY</div>
          ${isWastage ? `
            ${renderRow('Issue Cash', `₹${formatMoney(issueTotalAmount)}`)}
            ${renderRow('Receipt Cash', `- ₹${formatMoney(receiptTotalAmount)}`)}
            ${renderRow('Collected Cash', `- ₹${formatMoney(collectedAmount)}`)}
            ${renderRow('Final Cash', `₹${formatMoney(wastageNetFinalCash)}`)}
            ${renderRow('Payment Type', escapeHtml(paymentMode || 'N/A'))}
            <hr class="divider" />
            ${status ? renderRow('Payment Status', status === 'PAID' ? 'Paid' : 'Balance') : ''}
            ${renderRow('Previous Old Balance', `₹${formatMoney(safeNumber(oldBalanceBefore))}`)}
            ${renderRow('Previous Advance Balance', `₹${formatMoney(safeNumber(advanceBalanceBefore))}`)}
            ${renderRow(safeNumber(oldBalanceAfter) > 0 ? 'Current Old Balance' : 'Current Advance Balance', `₹${formatMoney(safeNumber(oldBalanceAfter) > 0 ? oldBalanceAfter : advanceBalanceAfter)}`)}
            ${safeNumber(wastageSubtractionAmount) > 0 ? renderRow('Subtraction Amount', `₹${formatMoney(safeNumber(wastageSubtractionAmount))}`) : ''}
            ${reminderDate ? renderRow('Reminder Date', new Date(reminderDate).toLocaleDateString('en-GB')) : ''}
          ` : isPlusBill ? `
            ${renderRow('Total Issue Pure', formatGram(safeNumber(issueTotalPurity)))}
            ${renderRow('Total Receipt Pure', `- ${formatGram(safeNumber(receiptTotalPurity))}`)}
            ${renderRow('Total Cash', `- ${formatGram(safeNumber(plusFinalGram))}`)}
            ${renderRow('Total Gram', `- ${formatGram(safeNumber(plusTotalGram))}`)}
            <hr class="divider" />
            ${renderRow(safeNumber(advanceBalanceBefore) > 0 && safeNumber(oldBalanceBefore) === 0 ? 'Previous Advance Balance' : 'Previous Old Balance', formatGram(safeNumber(advanceBalanceBefore) > 0 && safeNumber(oldBalanceBefore) === 0 ? advanceBalanceBefore : oldBalanceBefore))}
            ${renderRow('Outstanding', formatGram(Math.abs(safeNumber(plusOutstanding))))}
            ${renderRow(safeNumber(oldBalanceAfter) > 0 ? 'Current Old Balance' : 'Current Advance Balance', formatGram(safeNumber(oldBalanceAfter) > 0 ? oldBalanceAfter : advanceBalanceAfter))}
            ${safeNumber(plusReminderPure) > 0 ? renderRow('Reminder Pure', formatGram(safeNumber(plusReminderPure))) : ''}
            ${reminderDate ? renderRow('Reminder Date', new Date(reminderDate).toLocaleDateString('en-GB')) : ''}
          ` : isGramOnly ? `
            ${renderRow('Issue Gram', formatGram(issueTotalPurity))}
            ${renderRow('Receipt Gram', `- ${formatGram(receiptTotalPurity)}`)}
            ${description ? renderRow('Description', escapeHtml(description)) : ''}
            <hr class="divider" />
            ${renderRow(safeNumber(advanceBalanceBefore) > 0 && safeNumber(oldBalanceBefore) === 0 ? 'Previous Advance Balance' : 'Previous Old Balance', formatGram(safeNumber(advanceBalanceBefore) > 0 && safeNumber(oldBalanceBefore) === 0 ? advanceBalanceBefore : oldBalanceBefore))}
            ${renderRow(safeNumber(oldBalanceAfter) > 0 ? 'Current Old Balance' : 'Current Advance Balance', formatGram(safeNumber(oldBalanceAfter) > 0 ? oldBalanceAfter : advanceBalanceAfter))}
          ` : `
            ${renderRow('Subtotal', `\u20B9${formatMoney(issueTotalAmount - receiptTotalAmount)}`)}
            ${gstDetails?.isOn ? `
              ${gstDetails.hsnCode ? renderRow('HSN Code', escapeHtml(gstDetails.hsnCode)) : ''}
              ${renderRow(`CGST (${gstDetails.cgstPercent || ''}%)`, `\u20B9${formatMoney(cgst)}`)}
              ${renderRow(`SGST (${gstDetails.sgstPercent || ''}%)`, `\u20B9${formatMoney(sgst)}`)}
            ` : ''}
            ${renderRow('Final Amount', `\u20B9${formatMoney(finalAmount)}`)}
            ${renderRow('Paid', `- \u20B9${formatMoney(collectedAmount)}`)}
            ${renderRow('Balance Due', `\u20B9${formatMoney(balanceDue)}`)}
          `}
        </div>
      </body>
    </html>`;
};

// _printViaPDF: generates a correctly-sized PDF then opens the NATIVE print
// dialog (not share sheet). Share-to-print sends raw PDF binary to thermal
// printers which they interpret as ESC/POS noise → blank paper.
const _printViaPDF = async (html, height) => {
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
    width: THERMAL_WIDTH_PTS,   // 80mm in PDF points (80 × 72/25.4 ≈ 227)
    height,
    margins: { left: 0, top: 0, right: 0, bottom: 0 },
  });
  await Print.printAsync({ uri });
};

// _sharePDF: used only for WhatsApp sharing — opens the OS share sheet.
const _sharePDF = async (html, dialogTitle, height, width = THERMAL_WIDTH_PTS) => {
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
    width,
    height,
  });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle,
    UTI: 'com.adobe.pdf',
  });
};

// Heights are in PDF points (1pt = 1/72 inch). Each row ≈ 18pt, section
// headers/dividers ≈ 14pt each. Keep estimates tight — excess = blank paper.
// Base reduced: shop header (~80), gold rate (~40), total rows per section (~36×2),
// and footer section (~120) have been removed from the print template.
const calculateTransactionHeight = (transaction) => {
  const issueCount = transaction.issueItems?.length || 0;
  const receiptCount = transaction.receiptItems?.length || 0;

  let h = 430; // fixed content: bill no, date, customer info, payment details, summary
  if (issueCount > 0) h += 40 + (issueCount * 26);
  if (receiptCount > 0) h += 40 + (receiptCount * 26);
  if (transaction.gstDetails?.isOn) h += 28;
  if (transaction.description) h += 36;

  return Math.min(Math.max(h, 520), 1500);
};

export const PrintService = {
  printThermal: async (transaction, customTamilMsg) => {
    if (!acquire()) throw new Error('A print action is already in progress.');
    try {
      const html = await generateThermalReceiptHTML(transaction, customTamilMsg);
      const height = calculateTransactionHeight(transaction);
      await _printViaPDF(html, height);
    } finally {
      release();
    }
  },

  printA4: async (transaction, customTamilMsg) => {
    if (!acquire()) throw new Error('A print action is already in progress.');
    try {
      const html = await generateHTML(transaction, false, customTamilMsg);
      // For A4, we don't specify height to use default A4 length
      await _sharePDF(html, 'Print A4 Bill', undefined, 227);
    } finally {
      release();
    }
  },

  shareWhatsApp: async (transaction, customTamilMsg) => {
    if (!acquire()) throw new Error('A share action is already in progress.');
    try {
      const html = await generateThermalReceiptHTML(transaction, customTamilMsg);
      const height = calculateTransactionHeight(transaction);
      await _sharePDF(html, 'Share Bill via WhatsApp', height);
    } finally {
      release();
    }
  },
};

// ─── Settlement HTML generator ────────────────────────────────────────────────
const generateSettlementHTML = async (settlement, originalBillNumber) => {
  const settingsReq = await settingsAPI.getSettings();
  const { billSettings } = settingsReq.data.data;
  const tamilMsg = billSettings.tamilMessage;
  const footerMsg = billSettings.footerMessage;

  const dateStr = new Date(settlement.createdAt).toLocaleDateString('en-GB');
  const timeStr = new Date(settlement.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          @page { size: 80mm auto; margin: 0; }
          body { margin: 0; padding: 0; width: 80mm; background: #fff; }
          .receipt-container { width: 75mm; margin: 0 auto; padding: 0; padding: 0; box-sizing: border-box; font-family: 'Courier New', Courier, monospace; font-size: 12px; font-weight: 600; color: #000 !important; text-align: left; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-bottom: 1px dashed #000; margin: 4px 0; }
          .row { display: flex; justify-content: space-between; margin: 2px 0; }
          .footer { margin-top: 8px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="center bold" style="font-size:16px;">SRI VAISHNAVI JEWELLERS</div>
          <div class="center">No 370, Big Bazaar Street</div>
        <div class="center">(Opp - B.G. Naidu Sweets)</div>
        <div class="center">Phone: 8248134521</div>
        <div class="divider"></div>
        <div class="center bold" style="font-size:14px;">SETTLEMENT RECEIPT</div>
        <div class="divider"></div>
        <div class="row"><div>Receipt No:</div><div class="bold">${settlement.settlementBillNumber}</div></div>
        <div class="row"><div>Original Bill:</div><div class="bold">${originalBillNumber}</div></div>
        <div class="row"><div>Date/Time:</div><div>${dateStr} ${timeStr}</div></div>
        <div class="divider"></div>
        <div class="bold">SETTLEMENT DETAILS</div>
        <div class="row"><div>Payment Mode:</div><div>${settlement.paymentMode}</div></div>
        <div class="row"><div>Gold Rate:</div><div>\u20B9${settlement.goldRateAtSettlement?.toLocaleString('en-IN') || '-'}</div></div>
        <div class="row bold"><div>Amount Paid:</div><div>\u20B9${settlement.amountPaid.toLocaleString('en-IN')}</div></div>
        <div class="row bold"><div>Gram Settled:</div><div>${settlement.gramSettled.toFixed(3)}g</div></div>
        ${settlement.description ? `<div class="row"><div>Desc:</div><div>${settlement.description}</div></div>` : ''}
        <div class="divider"></div>
        <div class="bold">BALANCE SUMMARY</div>
        <div class="row"><div>Outstanding Before:</div><div>\u20B9${settlement.outstandingBefore.toLocaleString('en-IN')}</div></div>
        <div class="row"><div>Amount Paid:</div><div>- \u20B9${settlement.amountPaid.toLocaleString('en-IN')}</div></div>
        <div class="row bold"><div>Outstanding After:</div><div>\u20B9${settlement.outstandingAfter.toLocaleString('en-IN')}</div></div>
        <div class="row bold"><div>Status:</div><div>${settlement.outstandingAfter <= 0 ? 'PAID' : 'PARTIAL'}</div></div>
        <div class="footer">
          <p>${tamilMsg}</p>
          <p>${footerMsg}</p>
        </div>
        <div class="center bold">Sri Vaishnavi Jewellers</div>
        </div>
      </body>
    </html>
  `;
};

const calculateSettlementHeight = (settlement) => {
  let h = 220; // header + settlement details + balance summary + footer
  if (settlement.description) h += 18;
  return h + 25;
};

export const SettlementPrintService = {
  printReceipt: async (settlement, originalBillNumber) => {
    if (!acquire()) throw new Error('A print action is already in progress.');
    try {
      const html = await generateSettlementHTML(settlement, originalBillNumber);
      const height = calculateSettlementHeight(settlement);
      await _printViaPDF(html, height);
    } finally {
      release();
    }
  },

  shareWhatsApp: async (settlement, originalBillNumber) => {
    if (!acquire()) throw new Error('A share action is already in progress.');
    try {
      const html = await generateSettlementHTML(settlement, originalBillNumber);
      const height = calculateSettlementHeight(settlement);
      await _sharePDF(html, 'Share Settlement Receipt', height);
    } finally {
      release();
    }
  },
};

// ─── Line Stock HTML generator ────────────────────────────────────────────────
// WASTAGE Bill structure for Line Stock — a self-contained cash-based bill
// view, matching the B2C Wastage bill layout exactly. Only used when the
// admin has selected billStyle 'WASTAGE' and built the wastageBill data;
// never touches the real (gram-only) Line Stock issue fields below.
const generateLineStockWastageBillHTML = (transaction) => {
  const wb = transaction.wastageBill || {};
  const issuedItems = wb.issuedItems || [];
  const receivedItems = wb.receivedItems || [];
  const dateStr = new Date(transaction.issueDate || transaction.createdAt).toLocaleDateString('en-GB');
  const timeStr = new Date(transaction.issueDate || transaction.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const totalWW = safeNumber(issuedItems.reduce((s, i) => s + safeNumber(i.ww), 0));
  const totalIssueCash = safeNumber(issuedItems.reduce((s, i) => s + safeNumber(i.cash), 0));
  const totalReceiptWeight = safeNumber(receivedItems.reduce((s, i) => s + safeNumber(i.weight), 0));
  const totalReceiptCash = safeNumber(receivedItems.reduce((s, i) => s + safeNumber(i.cash), 0));
  const collected = safeNumber(wb.collectedAmount);
  const finalCash = safeNumber(totalIssueCash - totalReceiptCash - collected);
  const paymentStatus = finalCash > 0 ? 'Balance' : 'Paid';
  const oldAfter = safeNumber(wb.oldBalanceAfter);
  const advanceAfter = safeNumber(wb.advanceBalanceAfter);

  const issueRows = issuedItems.map(item => `
    <tr>
      <td>${escapeHtml(item.itemName || '-')}</td>
      <td>${safeNumber(item.ww).toFixed(4)}</td>
      <td>${safeNumber(item.rate).toFixed(0)}</td>
      <td style="text-align:right;">${safeNumber(item.cash).toLocaleString('en-IN', {maximumFractionDigits:0})}</td>
    </tr>
  `).join('');
  const receiptRows = receivedItems.map(item => `
    <tr>
      <td>${escapeHtml(item.receiptType || '-')}</td>
      <td>${safeNumber(item.weight).toFixed(4)}</td>
      <td>${safeNumber(item.rate).toFixed(0)}</td>
      <td style="text-align:right;">${safeNumber(item.cash).toLocaleString('en-IN', {maximumFractionDigits:0})}</td>
    </tr>
  `).join('');

  const styles = `
    @page { size: 80mm auto; margin: 0; }
    body { margin: 0; padding: 0; width: 80mm; background: #fff; }
    .receipt-container { width: 75mm; margin: 0 auto; box-sizing: border-box; font-family: 'Courier New', Courier, monospace; font-size: 12px; font-weight: 600; color: #000 !important; text-align: left; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-bottom: 1px dashed #000; margin: 5px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin: 5px 0; font-size: 12px; font-weight: 600; color: #000; }
    th, td { text-align: left; padding: 2px; vertical-align: top; }
    th { border-bottom: 1px dashed #000; }
  `;

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>${styles}</style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="center bold" style="font-size:16px;">SRI VAISHNAVI JEWELLERS</div>
          <div class="center">No 370, Big Bazaar Street</div>
          <div class="center">(Opp - B.G. Naidu Sweets)</div>
          <div class="center">Phone: 8248134521</div>
          <div class="divider"></div>
          <div class="center bold" style="font-size:14px;">B2C BILL</div>
          <div class="divider"></div>

          <div class="row"><div>Bill No:</div><div class="bold">${escapeHtml(wb.billNo || '')}</div></div>
          <div class="row"><div>Date:</div><div>${dateStr}</div></div>
          <div class="row"><div>Time:</div><div>${timeStr}</div></div>

          <div class="divider"></div>
          <div class="bold">CUSTOMER DETAILS</div>
          <div class="row"><div>Customer Name:</div><div>${escapeHtml(transaction.customerId?.customerName || 'N/A')}</div></div>
          <div class="row"><div>Phone Number:</div><div>${escapeHtml(transaction.customerId?.phoneNumber || 'N/A')}</div></div>
          <div class="row"><div>Old Balance:</div><div>₹${safeNumber(wb.oldBalanceBefore).toLocaleString('en-IN', {maximumFractionDigits:2})}</div></div>

          <div class="divider"></div>
          <div class="bold">ISSUED PRODUCTS</div>
          <table>
            <thead><tr><th>Item</th><th>WW(g)</th><th>Rate(₹)</th><th style="text-align:right;">Cash(₹)</th></tr></thead>
            <tbody>${issueRows}</tbody>
          </table>
          <div class="row bold"><div>Total WW:</div><div>${totalWW.toFixed(4)}g</div></div>
          <div class="row bold"><div>Total Cash:</div><div>₹${totalIssueCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</div></div>

          <div class="divider"></div>
          <div class="bold">RECEIVED ITEMS</div>
          ${receivedItems.length > 0 ? `
            <table>
              <thead><tr><th>Type</th><th>Wt(g)</th><th>Rate(₹)</th><th style="text-align:right;">Cash(₹)</th></tr></thead>
              <tbody>${receiptRows}</tbody>
            </table>
          ` : ''}
          <div class="row bold"><div>Total Weight:</div><div>${totalReceiptWeight.toFixed(4)}g</div></div>
          <div class="row bold"><div>Total Cash:</div><div>₹${totalReceiptCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</div></div>

          <div class="divider"></div>
          <div class="bold">PAYMENT DETAILS</div>
          <div class="row"><div>Payment Mode:</div><div>${escapeHtml(wb.paymentMode || 'Cash')}</div></div>
          <div class="row"><div>Collected Amount:</div><div>₹${collected.toLocaleString('en-IN', {maximumFractionDigits:2})}</div></div>

          <div class="divider"></div>
          <div class="bold">SUMMARY</div>
          <div class="row"><div>Issue Cash:</div><div>₹${totalIssueCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</div></div>
          <div class="row"><div>Receipt Cash:</div><div>- ₹${totalReceiptCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</div></div>
          <div class="row"><div>Collected Cash:</div><div>- ₹${collected.toLocaleString('en-IN', {maximumFractionDigits:2})}</div></div>
          <div class="row bold"><div>Final Cash:</div><div>₹${finalCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</div></div>
          <div class="row"><div>Payment Type:</div><div>${escapeHtml(wb.paymentMode || 'Cash')}</div></div>
          <div class="row"><div>Payment Status:</div><div>${paymentStatus}</div></div>

          <div class="divider"></div>
          <div class="bold">BALANCE DETAILS</div>
          <div class="row"><div>Previous Old Balance:</div><div>₹${safeNumber(wb.oldBalanceBefore).toLocaleString('en-IN', {maximumFractionDigits:2})}</div></div>
          <div class="row"><div>Previous Advance Balance:</div><div>₹${safeNumber(wb.advanceBalanceBefore).toLocaleString('en-IN', {maximumFractionDigits:2})}</div></div>
          <div class="row bold"><div>${oldAfter > 0 ? 'Current Old Balance:' : 'Current Advance Balance:'}</div><div>₹${(oldAfter > 0 ? oldAfter : advanceAfter).toLocaleString('en-IN', {maximumFractionDigits:2})}</div></div>

          <div class="divider"></div>
          <div class="bold">REMAINDER TABLE</div>
          <div class="row"><div>Subtraction Amount:</div><div>₹${safeNumber(wb.subtractionAmount).toLocaleString('en-IN', {maximumFractionDigits:2})}</div></div>
          <div class="row bold"><div>Current Balance:</div><div>₹${(oldAfter > 0 ? oldAfter : advanceAfter).toLocaleString('en-IN', {maximumFractionDigits:2})}</div></div>
          ${wb.reminderDate ? `<div class="row"><div>Reminder Date:</div><div>${new Date(wb.reminderDate).toLocaleDateString('en-GB')}</div></div>` : ''}

          <div class="divider"></div>
          <div class="center">Thank You</div>
          <div class="center bold">Sri Vaishnavi Jewellers</div>
        </div>
      </body>
    </html>
  `;
};

const calculateLineStockWastageBillHeight = (transaction) => {
  const wb = transaction.wastageBill || {};
  let h = 520;
  h += (wb.issuedItems?.length || 0) * 20;
  h += (wb.receivedItems?.length || 0) * 20;
  return h;
};

const generateLineStockHTML = (transaction) => {
  if (transaction.billStyle === 'WASTAGE' && transaction.wastageBill) {
    return generateLineStockWastageBillHTML(transaction);
  }
  const dateStr = new Date(transaction.createdAt).toLocaleDateString('en-GB');
  const timeStr = new Date(transaction.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  let issueRows = '';
  (transaction.issuedProducts || []).forEach((item, index) => {
    issueRows += `
      <tr>
        <td>${index + 1}</td>
        <td>${item.itemNumber + (item.barcode ? '<br/><span style="font-size:10px;">' + item.barcode + '</span>' : '')}</td>
        <td>${item.itemName}</td>
        <td>${item.category}</td>
        <td>${parseFloat(item.weight).toFixed(3)}g</td>
        <td>${item.purity}</td>
        <td>${item.count}</td>
      </tr>
    `;
  });

  const styles = `
    @page { size: 80mm auto; margin: 0; }
    body { margin: 0; padding: 0; width: 80mm; background: #fff; }
    .receipt-container { width: 75mm; margin: 0 auto; padding: 0; padding: 0; box-sizing: border-box; font-family: 'Courier New', Courier, monospace; font-size: 12px; font-weight: 600; color: #000 !important; text-align: left; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-bottom: 1px dashed #000; margin: 5px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin: 5px 0; font-size: 12px; font-weight: 600; color: #000; }
    th, td { text-align: left; padding: 2px; vertical-align: top; }
    th { border-bottom: 1px dashed #000; }
  `;

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>${styles}</style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="center bold" style="font-size:16px;">SRI VAISHNAVI JEWELLERS</div>
          <div class="center">No 370, Big Bazaar Street</div>
        <div class="center">(Opp - B.G. Naidu Sweets)</div>
        <div class="center">Phone: 8248134521</div>
        <div class="divider"></div>
        <div class="center bold" style="font-size:14px;">${transaction.billStyle === 'PLUS' ? 'PLUS BILL' : transaction.billStyle === 'WASTAGE' ? 'WASTAGE BILL' : 'LINE STOCK ISSUE BILL'}</div>
        <div class="divider"></div>

        <div class="row"><div>Txn No:</div><div class="bold">${transaction.transactionNumber}</div></div>
        <div class="row"><div>Date/Time:</div><div>${dateStr} ${timeStr}</div></div>
        ${transaction.billStyle ? `<div class="row"><div>Bill Type:</div><div class="bold">${transaction.billStyle === 'PLUS' ? 'Plus' : 'Wastage'}</div></div>` : ''}

        <div class="divider"></div>
        <div class="bold">LINE STOCKER DETAILS</div>
        <div class="row"><div>Name:</div><div>${transaction.customerId?.customerName || 'N/A'}</div></div>
        <div class="row"><div>Phone:</div><div>${transaction.customerId?.phoneNumber || 'N/A'}</div></div>
        <div class="row"><div>Address:</div><div>${transaction.customerId?.address || 'N/A'}</div></div>

        <div class="divider"></div>
        <div class="bold">ISSUE DETAILS</div>
        <div class="row"><div>Issue Date:</div><div>${new Date(transaction.issueDate).toLocaleDateString('en-GB')}</div></div>
        <div class="row"><div>Expected Return:</div><div class="bold">${new Date(transaction.expectedReturnDate).toLocaleDateString('en-GB')}</div></div>
        ${transaction.description ? `<div class="row" style="font-style: italic;"><div>Desc:</div><div style="text-align:right; max-width: 60%;">${transaction.description}</div></div>` : ''}

        <div class="divider"></div>
        <div class="bold">ISSUED PRODUCTS</div>
        <table>
          <thead>
            <tr><th>#</th><th>Code</th><th>Item</th><th>Cat</th><th>Wt(g)</th><th>Purity</th><th>Qty</th></tr>
          </thead>
          <tbody>${issueRows}</tbody>
        </table>
        <div class="divider"></div>
        
        <div class="row bold"><div>Total Items:</div><div>${transaction.totalItems}</div></div>
        <div class="row bold"><div>Total Gram:</div><div>${Number(transaction.totalGram).toFixed(3)}g</div></div>
        <div class="row"><div>Old Balance Before:</div><div>${Number(transaction.oldBalanceBefore).toFixed(3)}g</div></div>
        <div class="row bold"><div>Old Balance After:</div><div>${Number(transaction.oldBalanceAfter).toFixed(3)}g</div></div>

        <div class="divider"></div>
        <div class="center">Thank You</div>
        <div class="center bold">Sri Vaishnavi Jewellers</div>
        </div>
      </body>
    </html>
  `;
};

const calculateLineStockHeight = (transaction) => {
  if (transaction.billStyle === 'WASTAGE' && transaction.wastageBill) {
    return calculateLineStockWastageBillHeight(transaction);
  }
  let h = 240; // header + stocker + issue details + totals + footer
  if (transaction.issuedProducts?.length > 0) {
    h += 25 + (transaction.issuedProducts.length * 18);
  }
  if (transaction.description) h += 18;
  return h + 25;
};

export const LineStockPrintService = {
  printBill: async (transaction) => {
    if (!acquire()) throw new Error('A print action is already in progress.');
    try {
      const html = generateLineStockHTML(transaction);
      const height = calculateLineStockHeight(transaction);
      await _printViaPDF(html, height);
    } finally {
      release();
    }
  },

  shareWhatsApp: async (transaction) => {
    if (!acquire()) throw new Error('A share action is already in progress.');
    try {
      const html = generateLineStockHTML(transaction);
      const height = calculateLineStockHeight(transaction);
      await _sharePDF(html, 'Share Line Stock Bill', height);
    } finally {
      release();
    }
  },
};

// ─── Line Stock Settlement HTML generator ─────────────────────────────────────
// Case 1 (Old Balance active, or neither): Final = (Issue Total + Previous Old) - Receipt Total.
// Case 2 (Advance active): Final = Issue Total - (Previous Advance + Receipt Total).
// Shared by both the settlement's PLUS (gram) and WASTAGE (cash) bill structures.
const computeSettlementCase1Case2Balance = (oldBefore, advanceBefore, issueTotal, receiptTotal) => {
  if (advanceBefore > 0 && oldBefore === 0) {
    const final = safeNumber(issueTotal - (advanceBefore + receiptTotal));
    return final < 0
      ? { oldAfter: safeNumber(Math.abs(final)), advanceAfter: 0 }
      : { oldAfter: 0, advanceAfter: final };
  }
  const final = safeNumber((issueTotal + oldBefore) - receiptTotal);
  return final < 0
    ? { oldAfter: 0, advanceAfter: safeNumber(Math.abs(final)) }
    : { oldAfter: final, advanceAfter: 0 };
};

const generateLineStockSettlementPlusOrWastageHTML = (settlement) => {
  const dateStr = new Date(settlement.createdAt).toLocaleDateString('en-GB');
  const timeStr = new Date(settlement.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const isPlus = settlement.billStyle === 'PLUS';
  const bill = isPlus ? (settlement.plusBill || {}) : (settlement.wastageBill || {});
  const issuedItems = bill.issuedItems || [];
  const receivedItems = bill.receivedItems || [];
  const oldBalanceBefore = safeNumber(bill.oldBalanceBefore);
  const advanceBalanceBefore = safeNumber(bill.advanceBalanceBefore);
  const oldBalanceAfter = safeNumber(bill.oldBalanceAfter);
  const advanceBalanceAfter = safeNumber(bill.advanceBalanceAfter);
  const prevIsAdvance = advanceBalanceBefore > 0 && oldBalanceBefore === 0;
  const currentIsOld = oldBalanceAfter > 0;

  const totalIssue = isPlus
    ? safeNumber(issuedItems.reduce((s, i) => s + safeNumber(i.purity), 0))
    : safeNumber(issuedItems.reduce((s, i) => s + safeNumber(i.cash), 0));
  const totalReceipt = isPlus
    ? safeNumber(receivedItems.reduce((s, i) => s + safeNumber(i.purity), 0))
    : safeNumber(receivedItems.reduce((s, i) => s + safeNumber(i.cash), 0));

  const fmtBal = (v) => isPlus ? `${Number(v).toFixed(3)}g` : `Rs.${formatMoney(v)}`;

  const issuedRows = issuedItems.map(item => isPlus ? `
    <tr>
      <td>${escapeHtml(item.itemName || '-')}</td>
      <td>${fmt4(item.weight)}</td>
      <td>${fmtPurity(item.actualTouch)}</td>
      <td>${fmt4(safeNumber(item.purity))}</td>
    </tr>
  ` : `
    <tr>
      <td>${escapeHtml(item.itemName || '-')}</td>
      <td>${fmt4(item.weight)}</td>
      <td>${formatMoneyInt(item.rate)}</td>
      <td>${formatMoneyInt(item.cash)}</td>
    </tr>
  `).join('');

  const receivedRows = receivedItems.map(item => isPlus ? `
    <tr>
      <td>${escapeHtml(item.itemName || '-')}</td>
      <td>${fmt4(item.weight)}</td>
      <td>${fmtPurity(item.buyingTouch)}</td>
      <td>${fmt4(safeNumber(item.purity))}</td>
    </tr>
  ` : `
    <tr>
      <td>${escapeHtml(item.itemName || '-')}</td>
      <td>${fmt4(item.weight)}</td>
      <td>${formatMoneyInt(item.rate)}</td>
      <td>${formatMoneyInt(item.cash)}</td>
    </tr>
  `).join('');

  const styles = `
    @page { size: 80mm auto; margin: 0; }
    body { margin: 0; padding: 0; width: 80mm; background: #fff; }
    .receipt-container { width: 75mm; margin: 0 auto; padding: 0; box-sizing: border-box; font-family: 'Courier New', Courier, monospace; font-size: 12px; font-weight: 600; color: #000 !important; text-align: left; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-bottom: 1px dashed #000; margin: 5px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin: 5px 0; font-size: 12px; font-weight: 600; color: #000; }
    th, td { text-align: left; padding: 2px; vertical-align: top; }
    th { border-bottom: 1px dashed #000; }
  `;

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>${styles}</style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="center bold" style="font-size:16px;">SRI VAISHNAVI JEWELLERS</div>
          <div class="center">No 370, Big Bazaar Street</div>
          <div class="center">(Opp - B.G. Naidu Sweets)</div>
          <div class="center">Phone: 8248134521</div>
          <div class="divider"></div>
          <div class="center bold" style="font-size:14px;">LINE STOCK BILL</div>
          <div class="divider"></div>

          <div class="row"><div>Bill No:</div><div class="bold">${settlement.settlementNumber}</div></div>
          <div class="row"><div>Date:</div><div>${dateStr}</div></div>
          <div class="row"><div>Time:</div><div>${timeStr}</div></div>

          <div class="divider"></div>
          <div class="bold">CUSTOMER DETAILS</div>
          <div class="row"><div>Customer Name:</div><div>${escapeHtml(settlement.customerId?.customerName || 'N/A')}</div></div>
          <div class="row"><div>Phone:</div><div>${escapeHtml(settlement.customerId?.phoneNumber || 'N/A')}</div></div>
          <div class="row"><div>${prevIsAdvance ? 'Previous Advance Balance:' : 'Previous Old Balance:'}</div><div>${fmtBal(prevIsAdvance ? advanceBalanceBefore : oldBalanceBefore)}</div></div>

          <div class="divider"></div>
          <div class="bold">ISSUED PRODUCTS</div>
          <table>
            <thead>
              <tr>${isPlus ? '<th>Item</th><th>Wt(g)</th><th>A.Tch%</th><th>Purity</th>' : '<th>Item</th><th>WW(g)</th><th>Rate</th><th>Cash</th>'}</tr>
            </thead>
            <tbody>${issuedRows}</tbody>
          </table>
          <div class="row bold"><div>${isPlus ? 'Total Issue Gram:' : 'Total Issue Cash:'}</div><div>${fmtBal(totalIssue)}</div></div>

          <div class="divider"></div>
          <div class="bold">RECEIVED ITEMS</div>
          <table>
            <thead>
              <tr>${isPlus ? '<th>Item</th><th>Wt(g)</th><th>B.Tch%</th><th>Purity</th>' : '<th>Item</th><th>Wt(g)</th><th>Rate</th><th>Cash</th>'}</tr>
            </thead>
            <tbody>${receivedRows}</tbody>
          </table>
          <div class="row bold"><div>${isPlus ? 'Total Receipt Gram:' : 'Total Receipt Cash:'}</div><div>${fmtBal(totalReceipt)}</div></div>

          <div class="divider"></div>
          <div class="bold">SUMMARY</div>
          <div class="row"><div>${isPlus ? 'Total Issue Gram:' : 'Total Issue Cash:'}</div><div>${fmtBal(totalIssue)}</div></div>
          <div class="row"><div>${isPlus ? 'Total Receipt Gram:' : 'Total Receipt Cash:'}</div><div>-${fmtBal(totalReceipt)}</div></div>
          <div class="row"><div>${prevIsAdvance ? 'Previous Advance Balance:' : 'Previous Old Balance:'}</div><div>${fmtBal(prevIsAdvance ? advanceBalanceBefore : oldBalanceBefore)}</div></div>
          <div class="row bold" style="color:${currentIsOld ? 'red' : 'green'};"><div>${currentIsOld ? 'Current Old Balance:' : 'Current Advance Balance:'}</div><div>${fmtBal(currentIsOld ? oldBalanceAfter : advanceBalanceAfter)}</div></div>

          ${settlement.remarks ? `<div class="divider"></div><div class="row"><div>Remarks:</div><div>${escapeHtml(settlement.remarks)}</div></div>` : ''}

          <div class="divider"></div>
          <div class="center" style="font-size:10px; margin-top:5px; font-weight:bold;">
            நீங்கள் வாங்கும் ஒவ்வொரு கிராம் தங்கமும், உங்கள் எதிர்காலத்தின் ஒளிமயமான சேமிப்பு.
          </div>
          <div class="center" style="margin-top:10px;">Thank You</div>
          <div class="center bold">Sri Vaishnavi Jewellers</div>
        </div>
      </body>
    </html>
  `;
};

const calculateLineStockSettlementPlusOrWastageHeight = (settlement) => {
  const isPlus = settlement.billStyle === 'PLUS';
  const bill = isPlus ? (settlement.plusBill || {}) : (settlement.wastageBill || {});
  const issuedCount = bill.issuedItems?.length || 0;
  const receivedCount = bill.receivedItems?.length || 0;
  let h = 340;
  if (issuedCount > 0) h += 30 + (issuedCount * 18);
  if (receivedCount > 0) h += 30 + (receivedCount * 18);
  if (settlement.remarks) h += 24;
  return Math.min(Math.max(h, 480), 1500);
};

const generateLineStockSettlementHTML = (settlement) => {
  if ((settlement.billStyle === 'PLUS' && settlement.plusBill) || (settlement.billStyle === 'WASTAGE' && settlement.wastageBill)) {
    return generateLineStockSettlementPlusOrWastageHTML(settlement);
  }
  const dateStr = new Date(settlement.createdAt).toLocaleDateString('en-GB');
  const timeStr = new Date(settlement.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  let soldRows = '';
  (settlement.soldItems || []).forEach((item, index) => {
    soldRows += `
      <tr>
        <td>${index + 1}</td>
        <td>${item.itemNumber}</td>
        <td>${item.itemName}</td>
        <td>${parseFloat(item.weight).toFixed(3)}g</td>
        <td>${item.purity}</td>
        <td>${item.amount ? `Rs.${item.amount}` : '-'}</td>
      </tr>
    `;
  });

  let returnedRows = '';
  (settlement.returnedItems || []).forEach((item, index) => {
    returnedRows += `
      <tr>
        <td>${index + 1}</td>
        <td>${item.itemNumber}</td>
        <td>${item.itemName}</td>
        <td>${parseFloat(item.weight).toFixed(3)}g</td>
        <td>${item.purity}</td>
      </tr>
    `;
  });

  const styles = `
    @page { size: 80mm auto; margin: 0; }
    body { margin: 0; padding: 0; width: 80mm; background: #fff; }
    .receipt-container { width: 75mm; margin: 0 auto; padding: 0; padding: 0; box-sizing: border-box; font-family: 'Courier New', Courier, monospace; font-size: 12px; font-weight: 600; color: #000 !important; text-align: left; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-bottom: 1px dashed #000; margin: 5px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin: 5px 0; font-size: 12px; font-weight: 600; color: #000; }
    th, td { text-align: left; padding: 2px; vertical-align: top; }
    th { border-bottom: 1px dashed #000; }
  `;

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>${styles}</style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="center bold" style="font-size:16px;">SRI VAISHNAVI JEWELLERS</div>
          <div class="center">No 370, Big Bazaar Street</div>
        <div class="center">(Opp - B.G. Naidu Sweets)</div>
        <div class="center">Phone: 8248134521</div>
        <div class="divider"></div>
        <div class="center bold" style="font-size:14px;">${settlement.billStyle === 'PLUS' ? 'PLUS BILL' : settlement.billStyle === 'WASTAGE' ? 'WASTAGE BILL' : 'LINE STOCK SETTLEMENT'}</div>
        <div class="divider"></div>

        <div class="row"><div>Settlement:</div><div class="bold">${settlement.settlementNumber}</div></div>
        <div class="row"><div>Issue Txn:</div><div>${settlement.lineStockTransactionId?.transactionNumber || ''}</div></div>
        <div class="row"><div>Date/Time:</div><div>${dateStr} ${timeStr}</div></div>
        ${settlement.billStyle ? `<div class="row"><div>Bill Type:</div><div class="bold">${settlement.billStyle === 'PLUS' ? 'Plus' : 'Wastage'}</div></div>` : ''}
        
        <div class="divider"></div>
        <div class="bold">LINE STOCKER DETAILS</div>
        <div class="row"><div>Name:</div><div>${settlement.customerId?.customerName || 'N/A'}</div></div>
        <div class="row"><div>Phone:</div><div>${settlement.customerId?.phoneNumber || 'N/A'}</div></div>

        ${settlement.soldItems?.length > 0 ? `
        <div class="divider"></div>
        <div class="bold">SOLD PRODUCTS</div>
        <table>
          <thead>
            <tr><th>#</th><th>Code</th><th>Item</th><th>Wt(g)</th><th>Purity</th><th>Amt</th></tr>
          </thead>
          <tbody>${soldRows}</tbody>
        </table>
        ` : ''}

        ${settlement.returnedItems?.length > 0 ? `
        <div class="divider"></div>
        <div class="bold">RETURNED PRODUCTS</div>
        <table>
          <thead>
            <tr><th>#</th><th>Code</th><th>Item</th><th>Wt(g)</th><th>Purity</th></tr>
          </thead>
          <tbody>${returnedRows}</tbody>
        </table>
        ` : ''}

        <div class="divider"></div>
        <div class="bold">PAYMENTS</div>
        <div class="row"><div>Cash:</div><div>Rs.${settlement.paymentDetails?.cash || 0}</div></div>
        <div class="row"><div>Online:</div><div>Rs.${settlement.paymentDetails?.online || 0}</div></div>
        <div class="row"><div>Card:</div><div>Rs.${settlement.paymentDetails?.card || 0}</div></div>
        <div class="row"><div>Gold:</div><div>${Number(settlement.paymentDetails?.gold || 0).toFixed(3)}g</div></div>

        <div class="divider"></div>
        
        <div class="row"><div>Previous Balance:</div><div>${Number(settlement.previousBalance).toFixed(3)}g</div></div>
        <div class="row bold" style="color:red;"><div>Total Sold Deduct:</div><div>-${settlement.soldItems?.reduce((s,i)=>s+i.weight,0).toFixed(3)}g</div></div>
        <div class="row bold" style="color:red;"><div>Returned Deduct:</div><div>-${settlement.returnedItems?.reduce((s,i)=>s+i.weight,0).toFixed(3)}g</div></div>
        <div class="divider"></div>
        <div class="row bold" style="color:green;"><div>Cash Payments:</div><div>Rs.${(settlement.paymentDetails?.cash || 0) + (settlement.paymentDetails?.online || 0) + (settlement.paymentDetails?.card || 0)}</div></div>
        <div class="divider"></div>
        <div class="row bold"><div>Final Balance:</div><div>${Number(settlement.finalBalance).toFixed(3)}g</div></div>
        <div class="row"><div>Advance Balance:</div><div>${Number(settlement.advanceBalance).toFixed(3)}g</div></div>

        <div class="divider"></div>
        <div class="center" style="font-size:10px; margin-top:5px; font-weight:bold;">
          நீங்கள் வாங்கும் ஒவ்வொரு கிராம் தங்கமும், உங்கள் எதிர்காலத்தின் ஒளிமயமான சேமிப்பு.
        </div>
        <div class="center" style="margin-top:10px;">Thank You</div>
        <div class="center bold">Sri Vaishnavi Jewellers</div>
        </div>
      </body>
    </html>
  `;
};

const calculateLineStockSettlementHeight = (settlement) => {
  if ((settlement.billStyle === 'PLUS' && settlement.plusBill) || (settlement.billStyle === 'WASTAGE' && settlement.wastageBill)) {
    return calculateLineStockSettlementPlusOrWastageHeight(settlement);
  }
  let h = 260; // header + stocker + payments + balance + footer
  if (settlement.soldItems?.length > 0) {
    h += 25 + (settlement.soldItems.length * 18);
  }
  if (settlement.returnedItems?.length > 0) {
    h += 25 + (settlement.returnedItems.length * 18);
  }
  return h + 25;
};

// ─── Order HTML generator (58mm thermal) ────────────────────────────────────
const generateOrderHTML = (order) => {
  const customer = order.customer || order.customerId || {};
  const orderItems = order.orderItems || [];
  const paymentMode = order.paymentMode || 'None';
  const goldRate = order.goldRate || order.activeGoldRate || 0;
  const advanceTotalGram = order.advanceTotalGram || order.confirmedPayment?.grams || 0;
  const oldBalanceBefore = order.oldBalanceBefore ?? 0;
  const oldBalanceAfter = order.oldBalanceAfter ?? oldBalanceBefore;
  const advanceBalanceBefore = order.advanceBalanceBefore ?? 0;
  const advanceBalanceAfter = order.advanceBalanceAfter ?? advanceBalanceBefore;
  const orderNumber = order.orderNumber || 'Preview';
  const dateStr = new Date(order.createdAt || Date.now()).toLocaleDateString('en-GB');
  const timeStr = new Date(order.createdAt || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const fmt3 = (v) => Number(v || 0).toFixed(3);
  const fmtMoney = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';
  const row = (label, value, cls = '') =>
    `<div class="row ${cls}"><div>${label}</div><div>${value}</div></div>`;

  const itemsHTML = orderItems.map((item, i) => `
    ${i > 0 ? '<div class="light-divider"></div>' : ''}
    ${row('Item:', escapeHtml(item.itemName), 'bold')}
    ${row('Weight:', fmt3(item.itemWeight) + 'g')}
    ${row('Cust. Delivery:', fmtDate(item.deliveryDateByCustomer))}
    ${row('Ready By:', fmtDate(item.deliveryDateByGiver))}
    ${item.notes ? row('Notes:', escapeHtml(item.notes)) : ''}
  `).join('');

  return `<!DOCTYPE html><html><head>
    <meta charset="UTF-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Courier New', monospace; font-size: 12px; width: 100%; color: #111; padding: 4px; }
      .center { text-align: center; }
      .bold { font-weight: 800; }
      .divider { border-top: 1px dashed #555; margin: 5px 0; }
      .light-divider { border-top: 1px dotted #ccc; margin: 4px 0; }
    .row { display: flex; justify-content: space-between; padding: 2px 0; }
      .section-label { font-size: 10px; font-weight: 800; letter-spacing: 1px; color: #666; margin: 4px 0 3px; }
    </style></head><body>
    <div class="center bold" style="font-size:14px; letter-spacing:2px; margin-bottom:4px;">${order.billStyle === 'PLUS' ? 'PLUS BILL' : order.billStyle === 'WASTAGE' ? 'WASTAGE BILL' : 'ORDER RECEIPT'}</div>
    <div class="divider"></div>
    ${row('Order #:', orderNumber, 'bold')}
    ${row('Date:', dateStr)}
    ${row('Time:', timeStr)}
    ${order.billStyle ? row('Bill Type:', order.billStyle === 'PLUS' ? 'Plus' : 'Wastage', 'bold') : ''}
    <div class="divider"></div>
    <div class="section-label">CUSTOMER</div>
    ${row('Name:', escapeHtml(customer.customerName || '—'), 'bold')}
    ${row('Phone:', escapeHtml(customer.phoneNumber || '—'))}
    ${(customer.shopName || customer.dealerCompanyName) ? row('Shop:', escapeHtml(customer.shopName || customer.dealerCompanyName)) : ''}
    <div class="divider"></div>
    <div class="section-label">ORDER ITEMS</div>
    ${itemsHTML}
    <div class="divider"></div>
    ${paymentMode !== 'None' ? `
      <div class="section-label">PAYMENT</div>
      ${row('Mode:', paymentMode)}
      ${paymentMode === 'Cash' ? row('Amount:', '₹' + fmtMoney(order.paymentAmount || 0)) : ''}
      ${paymentMode === 'Cash' && goldRate > 0 ? row('Converted:', fmt3(advanceTotalGram) + 'g') : ''}
      ${paymentMode === 'Gold' ? row('Gold Weight:', fmt3(order.goldPayWeight || 0) + 'g') : ''}
      ${paymentMode === 'Gold' ? row('Purity:', escapeHtml(order.goldPayPurity || '22K (916)')) : ''}
      <div class="divider"></div>
    ` : ''}
    <div class="section-label">SUMMARY</div>
    ${row('Old Balance (Before):', fmt3(oldBalanceBefore) + 'g')}
    ${row('Old Balance (After):', fmt3(oldBalanceAfter) + 'g')}
    ${row('Advance (Before):', fmt3(advanceBalanceBefore) + 'g')}
    ${row('Advance Given:', '+' + fmt3(advanceTotalGram) + 'g')}
    ${row('New Advance:', fmt3(advanceBalanceAfter) + 'g', 'bold')}
    ${order.notes ? `<div class="divider"></div><div style="font-size:11px;font-style:italic;">Note: ${escapeHtml(order.notes)}</div>` : ''}
  </body></html>`;
};

const calculateOrderHeight = (order) => {
  const itemCount = order.orderItems?.length || 1;
  const hasPayment = order.paymentMode && order.paymentMode !== 'None';
  let h = 340 + (itemCount * 70);
  if (hasPayment) h += 60;
  return Math.min(Math.max(h, 400), 1200);
};

export const OrderPrintService = {
  printThermal: async (order) => {
    if (!acquire()) throw new Error('A print action is already in progress.');
    try {
      const html = generateOrderHTML(order);
      const height = calculateOrderHeight(order);
      await _printViaPDF(html, height);
    } finally {
      release();
    }
  },
  shareWhatsApp: async (order) => {
    if (!acquire()) throw new Error('A share action is already in progress.');
    try {
      const html = generateOrderHTML(order);
      const height = calculateOrderHeight(order);
      await _sharePDF(html, 'Share Order Bill', height);
    } finally {
      release();
    }
  },
};

export const LineStockSettlementPrintService = {
  printBill: async (settlement) => {
    if (!acquire()) throw new Error('A print action is already in progress.');
    try {
      const html = generateLineStockSettlementHTML(settlement);
      const height = calculateLineStockSettlementHeight(settlement);
      await _printViaPDF(html, height);
    } finally {
      release();
    }
  },

  shareWhatsApp: async (settlement) => {
    if (!acquire()) throw new Error('A share action is already in progress.');
    try {
      const html = generateLineStockSettlementHTML(settlement);
      const height = calculateLineStockSettlementHeight(settlement);
      await _sharePDF(html, 'Share Settlement Bill', height);
    } finally {
      release();
    }
  },
};
