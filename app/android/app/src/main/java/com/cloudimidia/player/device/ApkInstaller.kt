package com.cloudimidia.player.device

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import okhttp3.Request
import java.io.File

/**
 * Atualização do app pelo painel. Sem intervenção quando o aparelho permite
 * (app "device owner" ou Android 12+ atualizando a si mesmo); caso contrário o Android
 * mostra a confirmação na tela.
 */
object ApkInstaller {
    fun downloadAndInstall(ctx: Context, url: String) {
        val apk = File(ctx.cacheDir, "update.apk")
        Http.client.newCall(Request.Builder().url(url).build()).execute().use { res ->
            if (!res.isSuccessful) throw IllegalStateException("HTTP ${res.code}")
            apk.outputStream().use { res.body!!.byteStream().copyTo(it) }
        }
        val installer = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(ctx.packageName)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("app", 0, apk.length()).use { out ->
                apk.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
            val pi = PendingIntent.getBroadcast(ctx, 3, Intent(ctx, InstallResultReceiver::class.java), flags)
            session.commit(pi.intentSender)
        }
        DiagLog.add("Atualização do app enviada para instalação")
    }
}

class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let {
                    DiagLog.add("Atualização aguardando confirmação na tela")
                    // Evita que o watchdog cubra a tela de confirmação
                    Prefs.setPauseUntil(ctx, android.os.SystemClock.elapsedRealtime() + 10 * 60 * 1000)
                    ctx.startActivity(it)
                }
            }
            PackageInstaller.STATUS_SUCCESS -> DiagLog.add("App atualizado")
            else -> DiagLog.add("Falha ao atualizar o app ($status): ${intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)}")
        }
    }
}
