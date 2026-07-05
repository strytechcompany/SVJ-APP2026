import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';

let _busy = false;
const acquire = () => { if (_busy) return false; _busy = true; return true; };
const release = () => { _busy = false; };

const generateHTML = (data) => {
  const { summaryCards, customerSales, plusSummary, debtPayable, debtReceivable, expenses, chitFunds, lineStock, metadata, calculations } = data;
  
  let dateText = 'Today';
  if (metadata.mode === 'CUSTOM_DATE') dateText = new Date(metadata.selectedDate).toLocaleDateString('en-GB');
  else if (metadata.mode === 'MONTHLY') {
    const d = new Date(metadata.selectedDate);
    dateText = d.toLocaleString('default', { month: 'short' }) + ' ' + d.getFullYear();
  }

  const html = `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          @page { size: 80mm auto; margin: 0; }
          body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: flex-start; }
          .receipt-container { width: 75mm; margin: 0 auto; padding: 0; box-sizing: border-box; font-family: monospace; font-size: 12px; font-weight: 600; color: #000; text-align: left; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
          .double-divider { border-bottom: 2px dashed #000; margin: 6px 0; }
          .row { display: flex; justify-content: space-between; margin: 3px 0; }
          .title { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
          .section-title { font-size: 12px; font-weight: bold; text-align: center; margin: 8px 0 4px; text-decoration: underline; text-transform: uppercase; }
          
          table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 12px; table-layout: fixed; font-weight: 600; color: #000; }
          th, td { text-align: left; padding: 2px 1px; vertical-align: top; word-wrap: break-word; }
          th { border-bottom: 1px dashed #000; font-weight: bold; }
          .right { text-align: right; }
          .green { color: #000; } /* Thermal printers are B&W */
          .red { color: #000; }
          
          .calc-table { width: 100%; }
          .calc-table td { padding: 3px 0; border-bottom: 1px dotted #ccc; font-size: 12px; font-weight: 600; color: #000; }
          .calc-table td:last-child { text-align: right; font-weight: bold; }
          .total-row td { border-bottom: 1px dashed #000; border-top: 1px dashed #000; font-size: 13px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="receipt-container">
        <div class="center title">SRI VAISHNAVI JEWELLERS</div>
        <div class="center">BUSINESS REPORT</div>
        <div class="divider"></div>
        <div class="row"><div>Period:</div><div class="bold">${dateText}</div></div>
        <div class="row"><div>Generated:</div><div>${new Date().toLocaleString('en-GB', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'})}</div></div>
        <div class="double-divider"></div>

        <div class="section-title">SUMMARY</div>
        <div class="row"><div>Stock Items:</div><div class="bold">${summaryCards.totalStockItems}</div></div>
        <div class="row"><div>Stock Wt:</div><div class="bold">${summaryCards.totalStockWeight.toFixed(3)}g</div></div>
        <div class="row"><div>Sales Count:</div><div class="bold">${summaryCards.totalSalesCount}</div></div>
        <div class="row"><div>Cash Amt:</div><div class="bold">Rs.${summaryCards.currentCashAmount.toLocaleString('en-IN')}</div></div>
        <div class="divider"></div>

        <div class="section-title">1. CUSTOMER SALES</div>
        <table>
          <tr><th style="width: 45%;">Name/Item</th><th class="right">Wt(+%)</th></tr>
          ${customerSales.map(s => `<tr>
            <td>${s.customerName.substring(0,10)}<br/><span style="font-size:8px">${s.itemName}</span></td>
            <td class="right">${s.weight}g<br/><span style="font-size:9px">(+${s.sriPlus}%)</span></td>
          </tr>`).join('')}
          <tr><td class="bold">TOTAL</td><td class="right bold">${customerSales.reduce((sum,i)=>sum+i.weight,0).toFixed(3)}g</td></tr>
        </table>

        <div class="section-title">2. PLUS SUMMARY</div>
        <table>
          <tr><th>Plus</th><th class="center">Weight</th><th class="right">Profit</th></tr>
          ${plusSummary.map(p => `<tr>
            <td>${p.plus}%</td><td class="center">${p.totalWeight.toFixed(3)}g</td><td class="right">${p.profit.toFixed(3)}g</td>
          </tr>`).join('')}
          <tr><td colspan="2" class="bold">TOTAL PROFIT</td><td class="right bold">${calculations.customerSalesProfit.toFixed(3)}g</td></tr>
        </table>

        <div class="section-title">3. DEBT PAYABLE</div>
        <table>
          <tr><th style="width: 60%;">Customer</th><th class="right">Advance</th></tr>
          ${debtPayable.map(c => `<tr><td>${c.customerName.substring(0,15)}</td><td class="right">${c.advance.toFixed(3)}g</td></tr>`).join('')}
          <tr><td class="bold">TOTAL PAYABLE</td><td class="right bold">${calculations.debtPayable.toFixed(3)}g</td></tr>
        </table>

        <div class="section-title">4. DEBT RECEIVABLE</div>
        <table>
          <tr><th style="width: 60%;">Customer</th><th class="right">Old Bal</th></tr>
          ${debtReceivable.map(c => `<tr><td>${c.customerName.substring(0,15)}</td><td class="right">${c.oldBalance.toFixed(3)}g</td></tr>`).join('')}
          <tr><td class="bold">TOTAL REC.</td><td class="right bold">${calculations.debtReceivable.toFixed(3)}g</td></tr>
        </table>

        <div class="section-title">5. EXPENSES</div>
        <table>
          <tr><th style="width: 65%;">Name</th><th class="right">Amt(Rs)</th></tr>
          ${expenses.map(e => `<tr><td>${e.expenseName.substring(0,15)}</td><td class="right">${e.amount}</td></tr>`).join('')}
          <tr><td class="bold">TOTAL</td><td class="right bold">${calculations.expensesTotal}</td></tr>
        </table>

        <div class="section-title">6. CHIT FUNDS</div>
        <table>
          <tr><th style="width: 50%;">Customer</th><th>Paid</th><th class="right">Gold</th></tr>
          ${chitFunds.map(c => `<tr><td>${(c.customerId?.customerName||'').substring(0,10)}</td><td>${c.amount}</td><td class="right">${c.purchasedWeight.toFixed(3)}g</td></tr>`).join('')}
          <tr><td colspan="2" class="bold">TOTAL</td><td class="right bold">${calculations.chitCollection.toFixed(3)}g</td></tr>
        </table>

        <div class="section-title">7. LINE STOCKER</div>
        <table>
          <tr><th style="width: 45%;">Name</th><th>Stat</th><th class="right">Wt(g)</th></tr>
          ${lineStock.map(ls => `<tr><td>${ls.customerName.substring(0,10)}</td><td>${ls.status.substring(0,3)}</td><td class="right">${ls.totalIssuedGram.toFixed(3)}</td></tr>`).join('')}
          <tr><td colspan="2" class="bold">TOTAL OUT</td><td class="right bold">${calculations.lineStockOutstanding.toFixed(3)}g</td></tr>
        </table>

        <div class="double-divider"></div>
        <div class="center title">FINAL CALCULATION</div>
        <div class="divider"></div>

        <table class="calc-table">
          <tr><td>Adjusted Stock (+)</td><td>${calculations.adjustedStockGrams.toFixed(3)}g</td></tr>
          <tr><td>Cash Converted (+)</td><td>${calculations.cashConverted.toFixed(3)}g</td></tr>
          <tr><td>Debt Receivable (+)</td><td>${calculations.debtReceivable.toFixed(3)}g</td></tr>
          <tr><td>Debt Payable (-)</td><td>-${calculations.debtPayable.toFixed(3)}g</td></tr>
          <tr><td>Chit Collection (+)</td><td>${calculations.chitCollection.toFixed(3)}g</td></tr>
          <tr><td>Line Stock Out (-)</td><td>-${calculations.lineStockOutstanding.toFixed(3)}g</td></tr>
          <tr class="total-row"><td>TOTAL HOLDING</td><td>${calculations.totalHolding.toFixed(3)}g</td></tr>
        </table>

        <div class="divider"></div>
        <div class="section-title">PROFIT ANALYSIS</div>
        <table class="calc-table">
          <tr><td>Customer Sales Profit</td><td>${calculations.customerSalesProfit.toFixed(3)}g</td></tr>
          <tr><td>Expense Gram Deduct</td><td>-${calculations.profitBalanceGram.toFixed(3)}g</td></tr>
          <tr class="total-row"><td>NET PROFIT</td><td>${calculations.netProfit >= 0 ? '' : '-'}${Math.abs(calculations.netProfit).toFixed(3)}g</td></tr>
        </table>
        
        <div class="divider"></div>
        <div class="center" style="font-size: 9px; margin-top: 5px;">
          Params: SRI ${metadata.sriBillPercent}% | GOLD Rs.${metadata.goldRate} | PROF Rs.${metadata.profitGoldRate}
        </div>
        <div class="center" style="font-size: 9px; margin-bottom: 10px;">End of Report</div>
        </div>
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
      const { uri } = await Print.printToFileAsync({ html, margins: { left: 20, top: 20, right: 20, bottom: 20 } });
      
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
      const { uri } = await Print.printToFileAsync({ html, margins: { left: 20, top: 20, right: 20, bottom: 20 } });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Share via WhatsApp' });
    } finally {
      release();
    }
  }
};
