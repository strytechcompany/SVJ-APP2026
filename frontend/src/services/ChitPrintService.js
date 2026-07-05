import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getChitTransactions, markReceiptPrinted } from './chitService';

// Module-level lock — prevents concurrent Print.printAsync calls which cause
// "Another print request is already in progress" from expo-print's native layer
let _printBusy = false;
const acquirePrintLock = () => {
  if (_printBusy) return false;
  _printBusy = true;
  return true;
};
const releasePrintLock = () => { _printBusy = false; };

const SHOP_DETAILS = `
  <div class="center bold" style="font-size: 16px; margin-bottom: 5px;">SRI VAISHNAVI JEWELLERS</div>
  <div class="center">No.378, BIG BAZAAR STREET</div>
  <div class="center">Ph: 82481 34521</div>
`;

// ─── Internal share helper ────────────────────────────────────────────────────
// Passing specific width and calculated height prevents expo-print from 
// defaulting to A4/Letter size (11 inches), which causes giant blank paper feeds.
const _sharePDF = async (html, dialogTitle, height) => {
  const options = { html, base64: false };
  if (height) {
    options.width = 227; // 80mm in PDF points
    options.height = height;
  }
  const { uri } = await Print.printToFileAsync(options);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle,
    UTI: 'com.adobe.pdf',
  });
};

const generateStatementHTML = (customer, transactions) => {
  const dateStr = new Date().toLocaleDateString('en-GB');
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  let tableRows = transactions.map((t, index) => `
    <tr>
      <td class="center">${index + 1}</td>
      <td class="center">${new Date(t.paymentDate).toLocaleDateString('en-GB', {day:'2-digit', month:'2-digit', year:'2-digit'})}</td>
      <td class="right">${t.amount}</td>
      <td class="right">${t.purchasedWeight.toFixed(3)}</td>
    </tr>
  `).join('');

  const styles = `
    @page { size: 80mm auto; margin: 0; }
    body { margin: 0; padding: 0; width: 80mm; background: #fff; display: flex; justify-content: center; align-items: flex-start; }
    .receipt-container { width: 75mm; margin: 0 auto; padding: 0; box-sizing: border-box; font-family: monospace; font-size: 12px; font-weight: 600; color: #000; text-align: left; }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: bold; }
    .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 3px 0; }
    .title { font-size: 14px; font-weight: bold; text-align: center; margin-bottom: 5px; text-decoration: underline; }
    
    table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 12px; font-weight: 600; color: #000; }
    th, td { text-align: left; padding: 2px; vertical-align: top; word-wrap: break-word; }
    th { border-bottom: 1px dashed #000; font-weight: bold; }
    
    .summary-box { text-align: center; margin: 10px 0; border: 1px dashed #000; padding: 5px; }
    .summary-label { font-size: 10px; }
    .summary-value { font-weight: bold; font-size: 14px; }
  `;

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>${styles}</style>
      </head>
      <body>
        <div class="receipt-container">
        ${SHOP_DETAILS}
        <div class="divider"></div>
        <div class="title">CHIT STATEMENT</div>
        <div class="divider"></div>
        
        <div class="row"><div>Date:</div><div>${dateStr}</div></div>
        <div class="row"><div>Time:</div><div>${timeStr}</div></div>
        
        <div class="divider"></div>
        <div class="bold">CUSTOMER DETAILS</div>
        <div class="row"><div>Code:</div><div class="bold">${customer.chitId}</div></div>
        <div class="row"><div>Name:</div><div class="bold">${customer.customerName.substring(0, 15)}</div></div>
        <div class="row"><div>Phone:</div><div>${customer.phoneNumber}</div></div>
        <div class="row"><div>Monthly:</div><div>Rs.${customer.monthlyAmount}</div></div>
        <div class="divider"></div>

        <table>
          <thead>
            <tr>
              <th style="width: 15%;" class="center">#</th>
              <th style="width: 35%;" class="center">Date</th>
              <th style="width: 25%;" class="right">Amt(Rs)</th>
              <th style="width: 25%;" class="right">Wt(g)</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        <div class="divider"></div>

        <div class="summary-box">
          <div class="summary-label">Installments Paid</div>
          <div class="summary-value">${customer.completedMonths} / ${customer.durationMonths}</div>
          <div class="divider" style="margin: 3px 0;"></div>
          <div class="summary-label">Total Gold Accumulated</div>
          <div class="summary-value">${customer.totalWeightAccumulated.toFixed(3)}g</div>
        </div>

        <div class="divider"></div>
        <div class="center" style="font-size:10px; margin-top:5px; font-weight:bold;">
          நீங்கள் வாங்கும் ஒவ்வொரு கிராம் தங்கமும், உங்கள் எதிர்காலத்தின் ஒளிமயமான சேமிப்பு.
        </div>
        <div class="center" style="margin-top:10px;">Thank You</div>
        <div class="center bold">Sri Vaishnavi Jewellers</div>
        <div class="center">Visit Again</div>

        <div class="row" style="margin-top: 25px; margin-bottom: 10px;">
          <div class="center">..........<br/>Customer</div>
          <div class="center">..........<br/>Shop</div>
        </div>
        </div>
      </body>
    </html>
  `;
};

const calculateStatementHeight = (transactions) => {
  let h = 480; // Base height for header, customer, summary box, footer
  if (transactions?.length > 0) {
    h += 40 + (transactions.length * 25);
  }
  return h;
};

export const printChitStatement = async (customer) => {
  if (!acquirePrintLock()) return;
  try {
    const transactionsRes = await getChitTransactions(customer.chitId);
    const transactions = transactionsRes.success ? transactionsRes.data : [];
    const html = generateStatementHTML(customer, transactions);
    const height = calculateStatementHeight(transactions);
    await _sharePDF(html, 'Print / Save Statement', height);
  } catch (error) {
    if (!error?.message?.toLowerCase().includes('cancel')) {
      console.error('Print Statement Error:', error);
      throw error;
    }
  } finally {
    releasePrintLock();
  }
};

export const shareChitStatement = async (customer) => {
  if (!acquirePrintLock()) return;
  try {
    const transactionsRes = await getChitTransactions(customer.chitId);
    const transactions = transactionsRes.success ? transactionsRes.data : [];
    const html = generateStatementHTML(customer, transactions);
    const height = calculateStatementHeight(transactions);
    await _sharePDF(html, 'Share Statement', height);
  } catch (error) {
    if (!error?.message?.toLowerCase().includes('cancel')) {
      console.error('Share Statement Error:', error);
      throw error;
    }
  } finally {
    releasePrintLock();
  }
};


const generateReceiptHTML = (customer, transaction, tamilMsg = '') => {
  const dateStr = new Date(transaction.paymentDate).toLocaleDateString('en-GB');
  const timeStr = new Date(transaction.paymentDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const styles = `
    @page { size: 80mm auto; margin: 0; }
    body { margin: 0; padding: 0; width: 80mm; background: #fff; display: flex; justify-content: center; align-items: flex-start; }
    .receipt-container { width: 75mm; margin: 0 auto; padding: 0; box-sizing: border-box; font-family: monospace; font-size: 12px; font-weight: 600; color: #000; text-align: left; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 3px 0; }
  `;

  const status = transaction.installmentNumber >= transaction.totalInstallments ? 'CHIT COMPLETED' : 'ACTIVE';

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>${styles}</style>
      </head>
      <body>
        <div class="receipt-container">
        ${SHOP_DETAILS}
        
        <div class="divider"></div>
        <div class="row"><div>Txn No:</div><div>${transaction.receiptNumber}</div></div>
        <div class="row"><div>Date:</div><div>${dateStr}</div></div>
        <div class="row"><div>Time:</div><div>${timeStr}</div></div>
        
        <div class="divider"></div>
        <div class="center bold" style="font-size: 14px;">CHIT INSTALLMENT RECEIPT</div>
        <div class="divider"></div>

        <div class="bold">CUSTOMER DETAILS</div>
        <div class="row"><div>Name:</div><div>${customer.customerName}</div></div>
        <div class="row"><div>Phone:</div><div>${customer.phoneNumber}</div></div>
        <div class="row"><div>Address:</div><div>${customer.address || '-'}</div></div>
        <div class="row"><div>Chit ID:</div><div>${customer.chitId}</div></div>
        <div class="row"><div>Installment:</div><div>${transaction.installmentNumber} / ${transaction.totalInstallments}</div></div>

        <div class="divider"></div>
        <div class="bold">CHIT DETAILS</div>
        <div class="row"><div>Monthly Amount:</div><div>₹${transaction.amount.toLocaleString('en-IN')}</div></div>
        <div class="row"><div>Gold Rate:</div><div>₹${transaction.goldRate.toLocaleString('en-IN')}</div></div>
        <div class="row"><div>Previous Total Wt:</div><div>${(transaction.previousWeight || 0).toFixed(4)} g</div></div>
        <div class="row"><div>Current Wt:</div><div>${transaction.purchasedWeight.toFixed(4)} g</div></div>
        <div class="row bold"><div>Total Weight:</div><div>${transaction.runningWeight.toFixed(4)} g</div></div>

        <div class="divider"></div>
        <div class="bold">PAYMENT DETAILS</div>
        <div class="row"><div>Mode:</div><div>${transaction.paymentMode || 'Cash'}</div></div>
        <div class="row"><div>Collected By:</div><div>Admin</div></div>

        <div class="divider"></div>
        <div class="bold">PAYMENT SUMMARY</div>
        <div class="row"><div>Amount Paid:</div><div>₹${transaction.amount.toLocaleString('en-IN')}</div></div>
        <div class="row"><div>Weight Purchased:</div><div>${transaction.purchasedWeight.toFixed(4)} g</div></div>
        <div class="row"><div>Remaining:</div><div>${Math.max(0, transaction.totalInstallments - transaction.installmentNumber)} Months</div></div>

        <div class="divider"></div>
        <div class="center bold" style="font-size: 14px; margin: 10px 0;">STATUS: ${status}</div>
        <div class="divider"></div>

        <div class="center" style="font-size: 11px; margin-top: 10px;">${tamilMsg}</div>

        ${transaction.installmentNumber < transaction.totalInstallments ? `
        <div class="divider"></div>
        <div class="row"><div>Next Installment:</div><div>${transaction.installmentNumber + 1}</div></div>
        <div class="row"><div>Due Date:</div><div>${new Date(new Date(transaction.paymentDate).setMonth(new Date(transaction.paymentDate).getMonth() + 1)).toLocaleDateString('en-GB')}</div></div>
        ` : ''}

        <div class="divider"></div>
        <div class="center" style="margin-top: 10px;">Thank You For Choosing</div>
        <div class="center bold">Sri Vaishnavi Jewellers</div>
        <div class="center">Visit Again</div>
        
        <div class="row" style="margin-top: 15px; margin-bottom: 10px;">
          <div class="center">..........<br/>Customer</div>
          <div class="center">..........<br/>Shop</div>
        </div>
        </div>
      </body>
    </html>
  `;
};

const calculateReceiptHeight = (transaction) => {
  let h = 750; // Chit receipts have a lot of lines
  if (transaction.installmentNumber < transaction.totalInstallments) {
    h += 60;
  }
  return h;
};

export const ChitPrintService = {
  printThermal: async (transaction, customer, tamilMsg) => {
    if (!acquirePrintLock()) return;
    try {
      const html = generateReceiptHTML(customer, transaction, tamilMsg);
      const height = calculateReceiptHeight(transaction);
      await _sharePDF(html, 'Print Thermal Receipt', height);
      // Mark as printed in background
      markReceiptPrinted(transaction._id).catch((e) =>
        console.warn('markReceiptPrinted failed:', e)
      );
    } catch (error) {
      if (!error?.message?.toLowerCase().includes('cancel')) {
        console.error('Print Thermal Error:', error);
      }
    } finally {
      releasePrintLock();
    }
  },

  shareWhatsApp: async (transaction, customer, tamilMsg) => {
    if (!acquirePrintLock()) return;
    try {
      const html = generateReceiptHTML(customer, transaction, tamilMsg);
      const height = calculateReceiptHeight(transaction);
      await _sharePDF(html, 'Share Receipt via WhatsApp', height);
      markReceiptPrinted(transaction._id).catch((e) =>
        console.warn('markReceiptPrinted failed:', e)
      );
    } catch (error) {
      if (!error?.message?.toLowerCase().includes('cancel')) {
        console.error('Share WhatsApp Error:', error);
      }
    } finally {
      releasePrintLock();
    }
  },
};
