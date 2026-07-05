package com.srivaishnavi.jewellers

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbManager
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

@SuppressLint("UnspecifiedRegisterReceiverFlag")
class UsbPrinterModule(reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "UsbPrinter"
        const val ACTION_PERMISSION = "com.srivaishnavi.jewellers.USB_PERMISSION"
        const val TRANSFER_TIMEOUT_MS = 5000
    }

    private val usbManager = reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
    private var connection: UsbDeviceConnection? = null
    private var outEndpoint: UsbEndpoint? = null

    private val permissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            if (ACTION_PERMISSION != intent.action) return
            val device: UsbDevice? = if (Build.VERSION.SDK_INT >= 33)
                intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
            else @Suppress("DEPRECATION")
                intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
            val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
            if (granted && device != null) {
                openDevice(device)
                emitStatus("connected")
            } else {
                emitStatus("permission_denied")
            }
        }
    }

    private val attachReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val device: UsbDevice? = if (Build.VERSION.SDK_INT >= 33)
                intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
            else @Suppress("DEPRECATION")
                intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
            device?.takeIf { isPrinter(it) }?.let { requestPermission(it) }
        }
    }

    private val detachReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            closeDevice()
            emitStatus("disconnected")
        }
    }

    init {
        registerReceivers()
    }

    private fun registerReceivers() {
        val ctx = reactApplicationContext
        if (Build.VERSION.SDK_INT >= 33) {
            ctx.registerReceiver(permissionReceiver, IntentFilter(ACTION_PERMISSION), Context.RECEIVER_NOT_EXPORTED)
            ctx.registerReceiver(attachReceiver, IntentFilter(UsbManager.ACTION_USB_DEVICE_ATTACHED), Context.RECEIVER_EXPORTED)
            ctx.registerReceiver(detachReceiver, IntentFilter(UsbManager.ACTION_USB_DEVICE_DETACHED), Context.RECEIVER_EXPORTED)
        } else {
            ctx.registerReceiver(permissionReceiver, IntentFilter(ACTION_PERMISSION))
            ctx.registerReceiver(attachReceiver, IntentFilter(UsbManager.ACTION_USB_DEVICE_ATTACHED))
            ctx.registerReceiver(detachReceiver, IntentFilter(UsbManager.ACTION_USB_DEVICE_DETACHED))
        }
    }

    override fun getName() = NAME

    private fun isPrinter(device: UsbDevice): Boolean {
        if (device.deviceClass == UsbConstants.USB_CLASS_PRINTER) return true
        for (i in 0 until device.interfaceCount)
            if (device.getInterface(i).interfaceClass == UsbConstants.USB_CLASS_PRINTER) return true
        return false
    }

    private fun requestPermission(device: UsbDevice) {
        val flags = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
        val intent = PendingIntent.getBroadcast(
            reactApplicationContext, 0, Intent(ACTION_PERMISSION), flags
        )
        usbManager.requestPermission(device, intent)
        android.util.Log.i("UsbPrinter", "Requesting permission for: ${device.productName}")
    }

    private fun openDevice(device: UsbDevice) {
        closeDevice()
        for (i in 0 until device.interfaceCount) {
            val iface = device.getInterface(i)
            if (iface.interfaceClass != UsbConstants.USB_CLASS_PRINTER) continue
            for (j in 0 until iface.endpointCount) {
                val ep = iface.getEndpoint(j)
                if (ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK
                    && ep.direction == UsbConstants.USB_DIR_OUT) {
                    val conn = usbManager.openDevice(device) ?: continue
                    if (conn.claimInterface(iface, true)) {
                        connection = conn
                        outEndpoint = ep
                        android.util.Log.i("UsbPrinter", "Connected: ${device.productName}, maxPacketSize=${ep.maxPacketSize}")
                        return
                    }
                    conn.close()
                }
            }
        }
        android.util.Log.w("UsbPrinter", "No suitable printer endpoint found")
    }

    private fun closeDevice() {
        connection?.close()
        connection = null
        outEndpoint = null
    }

    @ReactMethod
    fun checkConnection(promise: Promise) {
        val printer = usbManager.deviceList.values.firstOrNull { isPrinter(it) }
        when {
            printer == null -> {
                emitStatus("disconnected")
                promise.resolve("disconnected")
            }
            !usbManager.hasPermission(printer) -> {
                requestPermission(printer)
                promise.resolve("requesting_permission")
            }
            else -> {
                if (connection == null) openDevice(printer)
                val status = if (connection != null) "connected" else "disconnected"
                emitStatus(status)
                promise.resolve(status)
            }
        }
    }

    @ReactMethod
    fun print(tspl: String, promise: Promise) {
        val conn = connection
        val ep = outEndpoint
        if (conn == null || ep == null) {
            promise.reject("NOT_CONNECTED", "No USB printer connected. Please plug in the TVS LP46 Lite via USB OTG.")
            return
        }
        Thread {
            try {
                val bytes = tspl.toByteArray(Charsets.ISO_8859_1)
                val packetSize = ep.maxPacketSize.coerceAtLeast(64)
                var offset = 0
                while (offset < bytes.size) {
                    val chunk = minOf(packetSize, bytes.size - offset)
                    val buf = bytes.copyOfRange(offset, offset + chunk)
                    val sent = conn.bulkTransfer(ep, buf, chunk, TRANSFER_TIMEOUT_MS)
                    if (sent < 0) {
                        promise.reject("TRANSFER_FAILED", "USB bulk transfer failed at offset $offset (error $sent)")
                        return@Thread
                    }
                    offset += sent
                }
                android.util.Log.i("UsbPrinter", "Print OK: ${bytes.size} bytes sent")
                promise.resolve(bytes.size)
            } catch (e: Exception) {
                android.util.Log.e("UsbPrinter", "Print exception: ${e.message}", e)
                promise.reject("PRINT_ERROR", e.message ?: "Unknown print error")
            }
        }.start()
    }

    @ReactMethod fun addListener(eventName: String) { /* required by RN event emitter */ }
    @ReactMethod fun removeListeners(count: Int) { /* required by RN event emitter */ }

    private fun emitStatus(status: String) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("UsbPrinterStatus", status)
            android.util.Log.i("UsbPrinter", "Status: $status")
        } catch (e: Exception) {
            android.util.Log.w("UsbPrinter", "Could not emit status: ${e.message}")
        }
    }

    override fun invalidate() {
        try { reactApplicationContext.unregisterReceiver(permissionReceiver) } catch (_: Exception) {}
        try { reactApplicationContext.unregisterReceiver(attachReceiver) } catch (_: Exception) {}
        try { reactApplicationContext.unregisterReceiver(detachReceiver) } catch (_: Exception) {}
        closeDevice()
        super.invalidate()
    }
}
