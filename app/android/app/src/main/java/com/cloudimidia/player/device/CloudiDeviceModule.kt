package com.cloudimidia.player.device

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.Base64
import android.view.PixelCopy
import android.webkit.WebView
import com.cloudimidia.player.BuildConfig
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.concurrent.Executors

class CloudiDeviceModule(private val rc: ReactApplicationContext) : ReactContextBaseJavaModule(rc) {
    companion object {
        @Volatile var instance: CloudiDeviceModule? = null
        private val startedAt = SystemClock.elapsedRealtime()
    }

    private val io = Executors.newSingleThreadExecutor()

    init { instance = this }

    override fun getName() = "CloudiDevice"

    /** Envia eventos para o JS (ex.: tecla para abrir o menu de manutenção). */
    fun emit(event: String, data: WritableMap? = null) {
        if (rc.hasActiveReactInstance()) {
            rc.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event, data)
        }
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    @ReactMethod
    fun getConfig(promise: Promise) {
        val m = Arguments.createMap()
        m.putString("serverUrl", Prefs.serverUrl(rc))
        m.putBoolean("autostart", Prefs.autostart(rc))
        m.putBoolean("homeEnabled", Autostart.isHomeEnabled(rc))
        m.putBoolean("canLaunchFromBackground", Autostart.canLaunchFromBackground(rc))
        m.putBoolean("needsOverlayPermission", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !Settings.canDrawOverlays(rc))
        m.putBoolean("needsInstallPermission", !canInstall())
        m.putString("appVersion", BuildConfig.VERSION_NAME)
        m.putInt("appVersionCode", BuildConfig.VERSION_CODE)
        m.putString("playerVersion", PlayerBundle.version(rc))
        m.putInt("localPort", LocalServer.PORT)
        promise.resolve(m)
    }

    @ReactMethod fun setServerUrl(url: String, promise: Promise) { Prefs.setServerUrl(rc, url); promise.resolve(null) }
    @ReactMethod fun setAutostart(on: Boolean, promise: Promise) { Prefs.setAutostart(rc, on); promise.resolve(on) }

    @ReactMethod
    fun setHomeEnabled(on: Boolean, promise: Promise) {
        try {
            Autostart.setHomeEnabled(rc, on)
            if (on) {
                // Mostra a escolha da tela inicial padrão
                rc.startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            promise.resolve(on)
        } catch (e: Exception) {
            promise.reject("home", e.message, e)
        }
    }

    /** Abre telas do Android: "overlay" (permissão para abrir sozinho), "settings", "wifi", "home" (tela inicial padrão). */
    @ReactMethod
    fun openSystemSettings(kind: String, promise: Promise) {
        Prefs.setPauseUntil(rc, SystemClock.elapsedRealtime() + 15 * 60 * 1000)
        val intents = when (kind) {
            "overlay" -> listOf(
                Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${rc.packageName}")),
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${rc.packageName}")),
            )
            "wifi" -> listOf(Intent(Settings.ACTION_WIFI_SETTINGS), Intent(Settings.ACTION_SETTINGS))
            "home" -> listOf(Intent(Settings.ACTION_HOME_SETTINGS), Intent(Settings.ACTION_SETTINGS))
            "install" -> listOf(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${rc.packageName}")),
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${rc.packageName}")),
            )
            "app" -> listOf(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${rc.packageName}")))
            else -> listOf(Intent(Settings.ACTION_SETTINGS))
        }
        for (i in intents) {
            try {
                rc.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return promise.resolve(true)
            } catch (_: Exception) { }
        }
        promise.resolve(false)
    }

    @ReactMethod
    fun syncMedia(urls: ReadableArray, promise: Promise) {
        val list = (0 until urls.size()).mapNotNull { urls.getString(it) }
        io.execute {
            try { MediaCache.sync(rc, list); promise.resolve(list.size) } catch (e: Exception) { promise.reject("sync", e.message, e) }
        }
    }

    @ReactMethod
    fun clearMedia(promise: Promise) {
        io.execute { MediaCache.clear(rc); promise.resolve(null) }
    }

    @ReactMethod
    fun updatePlayerBundle(files: ReadableArray, version: String, promise: Promise) {
        val list = (0 until files.size()).mapNotNull {
            val f = files.getMap(it) ?: return@mapNotNull null
            val path = f.getString("path"); val url = f.getString("url")
            if (path != null && url != null) path to url else null
        }
        io.execute {
            try {
                PlayerBundle.update(rc, list, version)
                DiagLog.add("Player atualizado para $version")
                promise.resolve(version)
            } catch (e: Exception) {
                DiagLog.add("Falha ao atualizar o player: ${e.message}")
                promise.reject("bundle", e.message, e)
            }
        }
    }

    @ReactMethod fun resetPlayerBundle(promise: Promise) { PlayerBundle.reset(rc); promise.resolve(null) }

    @ReactMethod
    fun installApk(url: String, promise: Promise) {
        io.execute {
            try { ApkInstaller.downloadAndInstall(rc, url); promise.resolve(true) } catch (e: Exception) {
                DiagLog.add("Falha ao baixar a atualização do app: ${e.message}")
                promise.reject("apk", e.message, e)
            }
        }
    }

    @ReactMethod
    fun restartApp() {
        DiagLog.add("Reiniciando o app")
        Autostart.scheduleRestart(rc, 1500)
        Handler(Looper.getMainLooper()).postDelayed({ Runtime.getRuntime().exit(0) }, 300)
    }

    /** Sair pelo menu: o watchdog não reabre até ligar o aparelho de novo ou abrir o app. */
    @ReactMethod
    fun exitApp() {
        Prefs.setUserExit(rc, true)
        rc.currentActivity?.finishAffinity()
    }

    @ReactMethod
    fun logEvent(msg: String) = DiagLog.add(msg.take(300))

    /** Coloca o foco do controle remoto em um elemento (tag do React Native). */
    @ReactMethod
    fun focusView(tag: Int) {
        val activity = rc.currentActivity ?: return
        activity.runOnUiThread {
            activity.findViewById<android.view.View>(tag)?.let {
                it.isFocusableInTouchMode = true
                it.requestFocus()
            }
        }
    }

    @ReactMethod
    fun captureScreen(promise: Promise) {
        val activity = rc.currentActivity ?: return promise.reject("screen", "tela indisponível")
        val view = activity.window.decorView
        val w = view.width; val h = view.height
        if (w <= 0 || h <= 0) return promise.reject("screen", "tela indisponível")
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val finish = { ok: Boolean ->
            if (!ok) promise.reject("screen", "falha ao capturar a tela") else io.execute {
                val scale = minOf(1f, 960f / w)
                val scaled = Bitmap.createScaledBitmap(bmp, (w * scale).toInt(), (h * scale).toInt(), true)
                val out = ByteArrayOutputStream()
                scaled.compress(Bitmap.CompressFormat.JPEG, 70, out)
                promise.resolve(Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP))
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val thread = HandlerThread("capture").apply { start() }
            PixelCopy.request(activity.window, bmp, { result ->
                finish(result == PixelCopy.SUCCESS)
                thread.quitSafely()
            }, Handler(thread.looper))
        } else {
            activity.runOnUiThread {
                try { view.draw(android.graphics.Canvas(bmp)); finish(true) } catch (_: Exception) { finish(false) }
            }
        }
    }

    @ReactMethod
    fun getDiagnostics(promise: Promise) {
        try {
            val m = Arguments.createMap()
            m.putString("app_version", BuildConfig.VERSION_NAME)
            m.putInt("app_version_code", BuildConfig.VERSION_CODE)
            m.putString("player_version", PlayerBundle.version(rc))
            m.putString("android", "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            m.putString("model", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
            try { m.putString("webview", WebView.getCurrentWebViewPackage()?.versionName) } catch (_: Exception) { }

            val am = rc.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val mi = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
            m.putDouble("mem_total", mi.totalMem.toDouble())
            m.putDouble("mem_free", mi.availMem.toDouble())
            m.putBoolean("mem_low", mi.lowMemory)

            val files = rc.filesDir
            m.putDouble("storage_total", files.totalSpace.toDouble())
            m.putDouble("storage_free", files.usableSpace.toDouble())

            val cache = MediaCache.stats(rc)
            m.putInt("cache_files", cache["files"] as Int)
            m.putDouble("cache_bytes", (cache["bytes"] as Long).toDouble())
            m.putInt("cache_downloading", cache["downloading"] as Int)
            m.putInt("cache_missing", cache["missing"] as Int)

            m.putDouble("uptime", (SystemClock.elapsedRealtime() / 1000).toDouble())
            m.putDouble("app_uptime", ((SystemClock.elapsedRealtime() - startedAt) / 1000).toDouble())
            m.putBoolean("autostart", Prefs.autostart(rc))
            m.putBoolean("can_autostart", Autostart.canLaunchFromBackground(rc))
            m.putBoolean("home_app", Autostart.isHomeEnabled(rc))
            m.putBoolean("can_install", canInstall())

            val cm = rc.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val caps = cm.getNetworkCapabilities(cm.activeNetwork)
            val net = when {
                caps == null -> "sem rede"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "cabo"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "celular"
                else -> "outra"
            }
            m.putString("network", net)
            if (net == "wifi") {
                try {
                    @Suppress("DEPRECATION")
                    val info = (rc.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).connectionInfo
                    m.putInt("wifi_signal", WifiManager.calculateSignalLevel(info.rssi, 5))
                    m.putInt("wifi_rssi", info.rssi)
                } catch (_: Exception) { }
            }
            m.putString("ip", localIp())
            val errors = Arguments.createArray()
            DiagLog.recent().takeLast(10).forEach { errors.pushString(it) }
            m.putArray("events", errors)
            promise.resolve(m)
        } catch (e: Exception) {
            promise.reject("diag", e.message, e)
        }
    }

    /** Permissão "instalar apps desconhecidos" para este app (necessária para se atualizar). */
    private fun canInstall(): Boolean = rc.packageManager.canRequestPackageInstalls()

    private fun localIp(): String? = try {
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback }
            .flatMap { it.inetAddresses.toList() }
            .firstOrNull { it is Inet4Address }?.hostAddress
    } catch (_: Exception) { null }
}
