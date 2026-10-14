package com.cloudimidia.player

import android.app.Application
import com.cloudimidia.player.device.Autostart
import com.cloudimidia.player.device.CloudiPackage
import com.cloudimidia.player.device.DiagLog
import com.cloudimidia.player.device.LocalServer
import com.cloudimidia.player.device.Prefs
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              add(CloudiPackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()

    // Se o app quebrar, reabre sozinho em alguns segundos (quando a abertura automática estiver ligada)
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { t, e ->
      try {
        DiagLog.add("Falha inesperada: ${e.javaClass.simpleName}: ${e.message}")
        if (Prefs.autostart(this) && !Prefs.userExit(this)) Autostart.scheduleRestart(this, 3000)
      } catch (_: Throwable) { }
      previous?.uncaughtException(t, e)
    }

    // Servidor local do player e das mídias salvas (funciona sem internet)
    LocalServer.start(this)

    SoLoader.init(this, OpenSourceMergedSoMapping)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      load()
    }
  }
}
