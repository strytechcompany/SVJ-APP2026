'use strict';

/**
 * Expo Config Plugin: USB Printer (TVS LP46 Lite)
 *
 * During `expo prebuild` (run by EAS Build), this plugin:
 *  1. Adds android.hardware.usb.host feature to AndroidManifest.xml
 *  2. Adds USB_DEVICE_ATTACHED intent filter to MainActivity
 *  3. Creates res/xml/usb_device_filter.xml (class=7 matches any USB printer)
 *  4. Copies UsbPrinterModule.kt + UsbPrinterPackage.kt into the android project
 *  5. Registers UsbPrinterPackage in MainApplication.kt
 */

const { withAndroidManifest, withMainApplication, withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

// ─── Step 1 & 2: AndroidManifest.xml ─────────────────────────────────────────

function withUsbManifest(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;

    // Add usb.host feature if not present
    if (!manifest['uses-feature']) manifest['uses-feature'] = [];
    const hasUsbHost = manifest['uses-feature'].some(
      (f) => f.$['android:name'] === 'android.hardware.usb.host'
    );
    if (!hasUsbHost) {
      manifest['uses-feature'].push({
        $: { 'android:name': 'android.hardware.usb.host', 'android:required': 'true' },
      });
    }

    // Find MainActivity and add USB_DEVICE_ATTACHED intent filter
    const app = manifest.application[0];
    const mainActivity = (app.activity || []).find(
      (a) =>
        a.$['android:name'] === '.MainActivity' ||
        a.$['android:name'] === 'com.srivaishnavi.jewellers.MainActivity'
    );

    if (mainActivity) {
      if (!mainActivity['intent-filter']) mainActivity['intent-filter'] = [];
      const hasUsbFilter = mainActivity['intent-filter'].some((f) =>
        (f.action || []).some(
          (a) => a.$['android:name'] === 'android.hardware.usb.action.USB_DEVICE_ATTACHED'
        )
      );
      if (!hasUsbFilter) {
        // <intent-filter> gets only the action — meta-data must NOT go inside intent-filter
        mainActivity['intent-filter'].push({
          action: [{ $: { 'android:name': 'android.hardware.usb.action.USB_DEVICE_ATTACHED' } }],
        });
        // <meta-data> is a sibling of <intent-filter>, directly inside <activity>
        if (!mainActivity['meta-data']) mainActivity['meta-data'] = [];
        const hasUsbMeta = mainActivity['meta-data'].some(
          (m) => m.$?.['android:name'] === 'android.hardware.usb.action.USB_DEVICE_ATTACHED'
        );
        if (!hasUsbMeta) {
          mainActivity['meta-data'].push({
            $: {
              'android:name': 'android.hardware.usb.action.USB_DEVICE_ATTACHED',
              'android:resource': '@xml/usb_device_filter',
            },
          });
        }
      }
    }

    return modConfig;
  });
}

// ─── Step 3 & 4: Copy Kotlin files and create res/xml ─────────────────────────

function withUsbNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const root = modConfig.modRequest.projectRoot;
      const androidRoot = path.join(root, 'android');
      const appId = config.android?.package || 'com.srivaishnavi.jewellers';
      const packagePath = appId.replace(/\./g, '/');
      const javaDir = path.join(androidRoot, 'app/src/main/java', packagePath);

      // Ensure directories exist
      fs.mkdirSync(javaDir, { recursive: true });
      fs.mkdirSync(path.join(androidRoot, 'app/src/main/res/xml'), { recursive: true });

      // Write USB device filter XML
      fs.writeFileSync(
        path.join(androidRoot, 'app/src/main/res/xml/usb_device_filter.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <!-- Match any USB printer (class 7) including TVS LP46 Lite -->\n    <usb-device class="7" />\n</resources>'
      );

      // Copy Kotlin source files
      const modulesDir = path.join(root, 'modules');
      for (const fname of ['UsbPrinterModule.kt', 'UsbPrinterPackage.kt']) {
        const src = path.join(modulesDir, fname);
        const dst = path.join(javaDir, fname);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dst);
          console.log(`[usb-printer] Copied ${fname} → ${dst}`);
        } else {
          console.warn(`[usb-printer] WARNING: ${src} not found — skipping copy`);
        }
      }

      return modConfig;
    },
  ]);
}

// ─── Step 5: Register package in MainApplication.kt ───────────────────────────

function withUsbMainApplication(config) {
  return withMainApplication(config, (modConfig) => {
    const { modResults } = modConfig;

    // Only modify Kotlin MainApplication
    if (modResults.language !== 'kt') return modConfig;

    // Already patched — nothing to do
    if (modResults.contents.includes('UsbPrinterPackage')) return modConfig;

    // Replace PackageList(this).packages.apply { ... } with list concatenation.
    //
    // In React Native 0.76 (Expo SDK 52) PackageList.packages is typed as
    // List<ReactPackage> (immutable), so calling add() inside apply { } causes:
    //   "Unresolved reference: add"
    //
    // The `+` operator is defined on Collection<T> and returns a new List<T>,
    // which satisfies the List<ReactPackage> return type without needing mutability.
    //
    // No explicit import is required — UsbPrinterPackage lives in the same package.
    modResults.contents = modResults.contents.replace(
      /PackageList\(this\)\.packages\.apply \{[^}]*\}/,
      'PackageList(this).packages + listOf(UsbPrinterPackage())'
    );

    return modConfig;
  });
}

// ─── Compose all modifications ─────────────────────────────────────────────────

module.exports = function withUsbPrinter(config) {
  config = withUsbManifest(config);
  config = withUsbNativeFiles(config);
  config = withUsbMainApplication(config);
  return config;
};
