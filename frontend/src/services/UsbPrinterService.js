import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import * as Print from 'expo-print';
const QRCode = require('qrcode-terminal/vendor/QRCode');
const QRErrorCorrectLevel = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');

const { UsbPrinter } = NativeModules;

const emitter = Platform.OS === 'android' && UsbPrinter
  ? new NativeEventEmitter(UsbPrinter)
  : null;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildQrSvg(text) {
  const value = String(text ?? '').trim();
  if (!value) {
    return '<svg class="qr-svg" viewBox="0 0 29 29" xmlns="http://www.w3.org/2000/svg"></svg>';
  }

  const qr = new QRCode(-1, QRErrorCorrectLevel.M);
  qr.addData(value);
  qr.make();

  const count = qr.getModuleCount();
  const margin = 4;
  const size = count + margin * 2;
  const rects = [];

  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) {
        rects.push(`<rect x="${col + margin}" y="${row + margin}" width="1" height="1" fill="#000" />`);
      }
    }
  }

  return `
    <svg class="qr-svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${size}" height="${size}" fill="#fff" />
      ${rects.join('')}
    </svg>
  `;
}

function buildThermalLabelHtml(labelData) {
  const shopName = 'Sri Vaishnavi Jewellers';
  const itemName = escapeHtml(labelData.itemName || labelData.itemNumber || '');
  const purity = escapeHtml(labelData.purity || '');
  const grossWeight = labelData.grossWeight != null
    ? Number(labelData.grossWeight).toFixed(3)
    : '0.000';
  const barcode = escapeHtml(labelData.barcode || labelData.itemNumber || '');

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page {
          size: 76mm auto;
          margin: 0;
        }

        html, body {
          width: 76mm;
          margin: 0;
          padding: 0;
          overflow: hidden;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          font-family: monospace;
          color: #000;
          background: #fff;
        }

        body {
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }

        .label {
          width: 72mm;
          box-sizing: border-box;
          margin: 0 auto;
          padding: 1.2mm 0 0.8mm;
          text-align: center;
        }

        .shop {
          font-size: 12px;
          line-height: 1;
          font-weight: 900;
          margin-bottom: 0.9mm;
          letter-spacing: 0.2px;
        }

        .meta-row {
          display: grid;
          grid-template-columns: 2fr 1.1fr 1fr;
          gap: 1.1mm;
          align-items: start;
          margin-bottom: 0.9mm;
        }

        .meta-col {
          min-width: 0;
          text-align: center;
        }

        .meta-label {
          font-size: 7px;
          line-height: 1;
          font-weight: 900;
          margin-bottom: 0.3mm;
        }

        .meta-value {
          font-size: 8px;
          line-height: 1.05;
          font-weight: 900;
          word-break: break-word;
        }

        .qr-wrap {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          margin-top: 0.3mm;
          margin-bottom: 0.3mm;
        }

        .qr-svg {
          width: 18mm;
          height: 18mm;
          display: block;
        }

        .barcode-text {
          margin-top: 0.4mm;
          font-size: 8.5px;
          line-height: 1;
          letter-spacing: 0.18px;
          font-weight: 900;
          word-break: break-word;
        }
      </style>
    </head>
    <body>
      <div class="label">
        <div class="shop">${escapeHtml(shopName)}</div>
        <div class="meta-row">
          <div class="meta-col">
            <div class="meta-label">Name</div>
            <div class="meta-value">${itemName || 'N/A'}</div>
          </div>
          <div class="meta-col">
            <div class="meta-label">Purity</div>
            <div class="meta-value">${purity || 'N/A'}</div>
          </div>
          <div class="meta-col">
            <div class="meta-label">Gross</div>
            <div class="meta-value">${grossWeight}g</div>
          </div>
        </div>
        <div class="qr-wrap">
          ${buildQrSvg(labelData.barcode || labelData.itemNumber || '')}
        </div>
        <div class="barcode-text">${barcode}</div>
      </div>
    </body>
  </html>`;
}

export function isUsbPrinterAvailable() {
  return Platform.OS === 'android' && !!UsbPrinter;
}

export function subscribeToStatus(callback) {
  if (!emitter) return { remove: () => {} };
  const sub = emitter.addListener('UsbPrinterStatus', callback);
  return sub;
}

export async function checkConnection() {
  if (!isUsbPrinterAvailable()) {
    return 'unavailable';
  }
  try {
    const status = await UsbPrinter.checkConnection();
    console.log('[UsbPrinter] checkConnection ->', status);
    return status;
  } catch (e) {
    console.error('[UsbPrinter] checkConnection error:', e.message);
    return 'disconnected';
  }
}

export async function printJewelryLabel(labelData) {
  const safeLabelData = labelData || {};
  const html = buildThermalLabelHtml(safeLabelData);
  await Print.printAsync({ html });
}
