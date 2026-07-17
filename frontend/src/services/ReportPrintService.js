import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';
import { safeNumber } from '../utils/safeNumber';

let _busy = false;
const acquire = () => { if (_busy) return false; _busy = true; return true; };
const release = () => { _busy = false; };

const generateHTML = (data) => {
  const { summaryCards, customerSales, plusSummary, wastageSummary, debtPayable, debtReceivable, expenses, chitFunds, lineStock, metadata, calculations } = data;

  let dateText = 'Today';
  if (metadata.mode === 'CUSTOM_DATE') dateText = new Date(metadata.selectedDate).toLocaleDateString('en-GB');
  else if (metadata.mode === 'MONTHLY') {
    const d = new Date(metadata.selectedDate);
    dateText = d.toLocaleString('default', { month: 'long' }) + ' ' + d.getFullYear();
  }

  const html = `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          @page { size: A4; margin: 15mm 14mm; }
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; color: #222; font-size: 12.5px; }

          .header { text-align: center; border-bottom: 3px solid #4B2E05; padding-bottom: 12px; margin-bottom: 16px; }
          .shop-name { font-size: 22px; font-weight: 800; color: #4B2E05; letter-spacing: 0.5px; }
          .report-title { font-size: 13px; color: #8A6B3C; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
          .meta-row { display: flex; justify-content: space-between; margin-top: 10px; font-size: 11.5px; color: #555; }

          .stat-grid { display: flex; gap: 10px; margin-bottom: 20px; }
          .stat-box { flex: 1; background: #FBF7EE; border: 1px solid #E8D8B8; border-radius: 6px; padding: 10px 8px; text-align: center; }
          .stat-label { font-size: 9.5px; color: #8A6B3C; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
          .stat-value { font-size: 15px; color: #4B2E05; font-weight: 800; margin-top: 4px; }

          .section { margin-bottom: 18px; page-break-inside: avoid; }
          .section-title { font-size: 12.5px; font-weight: 800; color: #FFF; background: #4B2E05; padding: 6px 10px; border-radius: 4px 4px 0 0; letter-spacing: 0.3px; }

          table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
          th { text-align: left; background: #F1E9D8; color: #4B2E05; font-weight: 700; padding: 6px 8px; border: 1px solid #E8D8B8; }
          td { padding: 6px 8px; border: 1px solid #EEE; vertical-align: top; }
          tr:nth-child(even) td { background: #FAFAFA; }
          .right { text-align: right; }
          .center { text-align: center; }
          .green { color: #1E8449; }
          .red { color: #C0392B; }
          .sub { font-size: 9.5px; color: #999; }

          .total-row td { background: #FBF7EE !important; font-weight: 800; border-top: 2px solid #4B2E05; }

          .footer { text-align: center; font-size: 10px; color: #999; margin-top: 24px; border-top: 1px solid #EEE; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="shop-name">SRI VAISHNAVI JEWELLERS</div>
          <div class="report-title">Business Report</div>
          <div class="meta-row">
            <div>Period: <strong>${dateText}</strong></div>
            <div>Generated: <strong>${new Date().toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}</strong></div>
          </div>
        </div>

        <div class="stat-grid">
          <div class="stat-box"><div class="stat-label">Stock Items</div><div class="stat-value">${summaryCards.totalStockItems}</div></div>
          <div class="stat-box"><div class="stat-label">Stock Weight</div><div class="stat-value">${summaryCards.totalStockWeight.toFixed(3)}g</div></div>
          <div class="stat-box"><div class="stat-label">Sales Count</div><div class="stat-value">${summaryCards.totalSalesCount}</div></div>
          <div class="stat-box"><div class="stat-label">Cash Amount</div><div class="stat-value">₹${summaryCards.currentCashAmount.toLocaleString('en-IN')}</div></div>
        </div>

        <div class="section">
          <div class="section-title">1. Customer Sales (B2C, B2D, Line Stocker)</div>
          <table>
            <tr><th>Customer</th><th>Item</th><th class="right">Weight (+Plus%)</th></tr>
            ${customerSales.map(s => `<tr>
              <td>${s.customerName}<div class="sub">${s.phoneNumber} | ${s.billNumber || '-'} | ${s.source}</div></td>
              <td>${s.itemName}</td>
              <td class="right green">${s.weight}g${s.sriPlus ? ` (+${s.sriPlus}%)` : ''}</td>
            </tr>`).join('')}
            <tr class="total-row"><td colspan="2">Total Sales</td><td class="right">${customerSales.reduce((s, i) => s + i.weight, 0).toFixed(3)}g</td></tr>
          </table>
        </div>

        <div class="section">
          <div class="section-title">2. Plus Summary</div>
          <table>
            <tr><th>B Value</th><th class="center">S Value</th><th class="right">Profit</th></tr>
            ${plusSummary.map(p => `<tr>
              <td>${safeNumber(p.bValue).toFixed(3)}g</td><td class="center">${safeNumber(p.sValue).toFixed(3)}g</td><td class="right green">${safeNumber(p.profit).toFixed(3)}g</td>
            </tr>`).join('')}
            <tr class="total-row"><td class="right">${safeNumber(calculations.plusSummaryBValue).toFixed(3)}g</td><td class="right">${safeNumber(calculations.plusSummarySValue).toFixed(3)}g</td><td class="right">${safeNumber(calculations.plusSummaryProfit).toFixed(3)}g</td></tr>
          </table>
        </div>

        <div class="section">
          <div class="section-title">3. Wastage Summary</div>
          <table>
            <tr><th>B Value</th><th class="center">S Value</th><th class="right">Profit</th></tr>
            ${wastageSummary.map(w => `<tr>
              <td>₹${safeNumber(w.bValue).toFixed(2)}</td><td class="center">₹${safeNumber(w.sValue).toFixed(2)}</td><td class="right green">₹${safeNumber(w.profit).toFixed(2)}</td>
            </tr>`).join('')}
            <tr class="total-row"><td class="right">₹${safeNumber(calculations.wastageSummaryBValue).toFixed(2)}</td><td class="right">₹${safeNumber(calculations.wastageSummarySValue).toFixed(2)}</td><td class="right">₹${safeNumber(calculations.wastageSummaryProfit).toFixed(2)}</td></tr>
          </table>
        </div>

        <div class="section">
          <div class="section-title">4. Debt Payable (Advance &gt; 0)</div>
          <table>
            <tr><th>Customer</th><th class="right">Advance</th></tr>
            ${debtPayable.map(c => `<tr><td>${c.customerName}<div class="sub">${c.phoneNumber}</div></td><td class="right red">${c.advance.toFixed(3)}g</td></tr>`).join('')}
            <tr class="total-row"><td>Total Payable</td><td class="right">${calculations.debtPayable.toFixed(3)}g</td></tr>
          </table>
        </div>

        <div class="section">
          <div class="section-title">5. Debt Receivable (Old Balance &gt; 0)</div>
          <table>
            <tr><th>Customer</th><th class="right">Old Balance</th></tr>
            ${debtReceivable.map(c => `<tr><td>${c.customerName}<div class="sub">${c.phoneNumber}</div></td><td class="right green">${c.oldBalance.toFixed(3)}g</td></tr>`).join('')}
            <tr class="total-row"><td>Total Receivable</td><td class="right">${calculations.debtReceivable.toFixed(3)}g</td></tr>
          </table>
        </div>

        <div class="section">
          <div class="section-title">6. Expenses</div>
          <table>
            <tr><th>Expense</th><th class="right">Amount</th></tr>
            ${expenses.map(e => `<tr><td>${e.expenseName}<div class="sub">${e.expenseType}</div></td><td class="right red">₹${e.amount}</td></tr>`).join('')}
            <tr class="total-row"><td>Total Expenses</td><td class="right">₹${calculations.expensesTotal}</td></tr>
          </table>
        </div>

        <div class="section">
          <div class="section-title">7. Chit Funds</div>
          <table>
            <tr><th>Customer</th><th>Rate</th><th class="right">Amount</th><th class="right">Gold</th></tr>
            ${chitFunds.map(c => `<tr><td>${c.customerId?.customerName || ''}</td><td>₹${c.goldRate}</td><td class="right">₹${c.amount}</td><td class="right green">${c.purchasedWeight.toFixed(3)}g</td></tr>`).join('')}
            <tr class="total-row"><td colspan="2">Total</td><td class="right">₹${chitFunds.reduce((s, i) => s + i.amount, 0)}</td><td class="right">${calculations.chitCollection.toFixed(3)}g</td></tr>
          </table>
        </div>

        <div class="section">
          <div class="section-title">8. Line Stocker Report</div>
          <table>
            <tr><th>Customer</th><th>Status</th><th class="right">Weight</th></tr>
            ${lineStock.map(ls => `<tr><td>${ls.customerName}</td><td>${ls.status}</td><td class="right ${ls.status === 'SETTLED' ? 'green' : 'red'}">${ls.totalIssuedGram.toFixed(3)}g</td></tr>`).join('')}
            <tr class="total-row"><td colspan="2">Total Issued</td><td class="right">${calculations.lineStockOutstanding.toFixed(3)}g</td></tr>
          </table>
        </div>

        <div class="footer">End of Report — Sri Vaishnavi Jewellers</div>
      </body>
    </html>
  `;
  return html;
};

export const ReportPrintService = {
  printReport: async (data) => {
    if (!acquire()) return;
    try {
      const html = generateHTML(data);
      const { uri } = await Print.printToFileAsync({ html });

      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        const fileName = `SriVaishnavi_Report_${new Date().getTime()}.pdf`;
        const fileString = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const newUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, fileName, 'application/pdf');
        await FileSystem.writeAsStringAsync(newUri, fileString, { encoding: FileSystem.EncodingType.Base64 });
        Alert.alert('Success', 'Report downloaded successfully to your chosen folder!');
      } else {
        // Fallback to sharing if permission denied
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Download Report' });
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to save the PDF.');
    } finally {
      release();
    }
  },

  shareWhatsApp: async (data) => {
    if (!acquire()) return;
    try {
      const html = generateHTML(data);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Share via WhatsApp' });
    } finally {
      release();
    }
  }
};
