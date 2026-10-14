package com.cloudimidia.player

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import com.cloudimidia.player.device.Autostart
import com.cloudimidia.player.device.CloudiDeviceModule
import com.cloudimidia.player.device.Prefs
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.Arguments
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "CloudiMidiaPlayer"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  private val handler = Handler(Looper.getMainLooper())
  private var okDownAt = 0L
  private var menuSent = false

  /** Enquanto em primeiro plano, avisa o watchdog que está tudo bem. */
  private val alive = object : Runnable {
    override fun run() {
      Prefs.markAlive(this@MainActivity, SystemClock.elapsedRealtime())
      handler.postDelayed(this, 30_000)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    // Informa ao JS qual elemento recebeu o foco do controle remoto (destaque no menu de manutenção)
    window.decorView.viewTreeObserver.addOnGlobalFocusChangeListener { _, newFocus ->
      CloudiDeviceModule.instance?.emit("cmFocus", Arguments.createMap().apply { putInt("tag", newFocus?.id ?: -1) })
    }
    Prefs.setUserExit(this, false)
    Autostart.scheduleWatchdog(this)
  }

  override fun onResume() {
    super.onResume()
    Prefs.setPauseUntil(this, 0)
    handler.removeCallbacks(alive)
    handler.post(alive)
    hideSystemUi()
  }

  override fun onPause() {
    super.onPause()
    handler.removeCallbacks(alive)
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) hideSystemUi()
  }

  @Suppress("DEPRECATION")
  private fun hideSystemUi() {
    window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        or View.SYSTEM_UI_FLAG_FULLSCREEN)
  }

  private fun openMenu(source: String) {
    CloudiDeviceModule.instance?.emit("cmOpenMenu", Arguments.createMap().apply { putString("source", source) })
  }

  /**
   * Menu de manutenção: segurar OK por 2 segundos, ou as teclas MENU / CONFIGURAÇÕES / INFO do controle.
   */
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    when (event.keyCode) {
      KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_SETTINGS, KeyEvent.KEYCODE_INFO -> {
        if (event.action == KeyEvent.ACTION_UP) openMenu("tecla")
        return true
      }
      KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> {
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
          okDownAt = SystemClock.uptimeMillis()
          menuSent = false
        } else if (event.action == KeyEvent.ACTION_DOWN && !menuSent && SystemClock.uptimeMillis() - okDownAt > 2000) {
          menuSent = true
          openMenu("ok")
          return true
        } else if (event.action == KeyEvent.ACTION_UP && menuSent) {
          return true
        }
        if (event.repeatCount > 0) return true
      }
    }
    return super.dispatchKeyEvent(event)
  }
}
