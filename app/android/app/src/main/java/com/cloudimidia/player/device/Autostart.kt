package com.cloudimidia.player.device

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import com.cloudimidia.player.MainActivity

/**
 * Abertura automática:
 *  - ao ligar o aparelho (BootReceiver);
 *  - se o app fechar ou travar (WatchdogReceiver, verificado a cada ~2 minutos);
 *  - opcionalmente como "tela inicial" do aparelho (alias HOME).
 * No Android 10+, abrir sozinho exige a permissão "sobrepor a outros apps".
 */
object Autostart {
    private const val WATCHDOG_INTERVAL = 2 * 60 * 1000L
    private const val STALE_AFTER = 150 * 1000L

    /**
     * Abre a tela do player. No Android 10+ abrir a partir de segundo plano é bloqueado; com a
     * permissão "sobrepor a outros apps", criamos por um instante uma janela invisível de sobreposição,
     * o que o Android aceita como origem visível (funciona também no Android 14/15).
     */
    fun launch(ctx: Context, reason: String, done: (() -> Unit)? = null) {
        val app = ctx.applicationContext
        val main = Handler(Looper.getMainLooper())
        val start = {
            try {
                app.startActivity(
                    Intent(app, MainActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                )
            } catch (e: Exception) {
                DiagLog.add("Não foi possível abrir o app ($reason): ${e.message}")
            }
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || !Settings.canDrawOverlays(app)) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !isHomeEnabled(app)) {
                DiagLog.add("Abrir sozinho depende da permissão \"sobrepor a outros apps\" ($reason)")
            }
            start()
            done?.invoke()
            return
        }
        main.post {
            val wm = app.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val view = View(app)
            val params = WindowManager.LayoutParams(
                1, 1,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                PixelFormat.TRANSLUCENT
            ).apply { gravity = Gravity.TOP or Gravity.START }
            val added = try { wm.addView(view, params); true } catch (e: Exception) {
                DiagLog.add("Janela auxiliar indisponível: ${e.message}"); false
            }
            main.postDelayed({
                start()
                main.postDelayed({
                    if (added) try { wm.removeView(view) } catch (_: Exception) { }
                    done?.invoke()
                }, 1500)
            }, 400)
        }
    }

    fun canLaunchFromBackground(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || Settings.canDrawOverlays(ctx) || isHomeEnabled(ctx)

    fun scheduleWatchdog(ctx: Context) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = PendingIntent.getBroadcast(
            ctx, 1, Intent(ctx, WatchdogReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        am.setInexactRepeating(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + WATCHDOG_INTERVAL, WATCHDOG_INTERVAL, pi)
    }

    /** Reabre o app após alguns segundos (usado em falhas e no "reiniciar app"). */
    fun scheduleRestart(ctx: Context, delayMs: Long) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = PendingIntent.getActivity(
            ctx, 2,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        am.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + delayMs, pi)
    }

    fun shouldReopen(ctx: Context): Boolean {
        val now = SystemClock.elapsedRealtime()
        if (!Prefs.autostart(ctx) || Prefs.userExit(ctx)) return false
        if (now < Prefs.pauseUntil(ctx)) return false
        val last = Prefs.lastAlive(ctx)
        return last == 0L || last > now || now - last > STALE_AFTER
    }

    private fun homeAlias(ctx: Context) = ComponentName(ctx, "com.cloudimidia.player.HomeAlias")

    fun isHomeEnabled(ctx: Context): Boolean =
        ctx.packageManager.getComponentEnabledSetting(homeAlias(ctx)) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED

    /** Usa o app como tela inicial do aparelho (o Android pergunta qual tela inicial usar na próxima vez). */
    fun setHomeEnabled(ctx: Context, on: Boolean) {
        ctx.packageManager.setComponentEnabledSetting(
            homeAlias(ctx),
            if (on) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
        )
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val action = intent.action ?: return
        Prefs.markAlive(ctx, 0)
        Autostart.scheduleWatchdog(ctx)
        // Ligar o aparelho ou atualizar o app limpa a saída manual feita pelo técnico
        Prefs.setUserExit(ctx, false)
        if (Prefs.autostart(ctx)) {
            DiagLog.add("Abrindo após: $action")
            val pending = goAsync()
            Autostart.launch(ctx, action) { pending.finish() }
        }
    }
}

class WatchdogReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (Autostart.shouldReopen(ctx)) {
            DiagLog.add("Watchdog: app não estava em exibição, reabrindo")
            val pending = goAsync()
            Autostart.launch(ctx, "watchdog") { pending.finish() }
        }
    }
}
