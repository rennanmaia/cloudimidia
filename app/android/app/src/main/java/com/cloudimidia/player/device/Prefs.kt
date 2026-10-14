package com.cloudimidia.player.device

import android.content.Context
import android.content.SharedPreferences

/** Configurações persistentes do aparelho (lidas também pelos receivers de boot e watchdog). */
object Prefs {
    const val DEFAULT_SERVER = "https://cloudi.com.br/midia"

    private fun sp(ctx: Context): SharedPreferences =
        ctx.applicationContext.getSharedPreferences("cloudimidia", Context.MODE_PRIVATE)

    fun serverUrl(ctx: Context): String = sp(ctx).getString("server_url", null) ?: DEFAULT_SERVER
    fun setServerUrl(ctx: Context, url: String) = sp(ctx).edit().putString("server_url", url.trimEnd('/')).apply()

    /** Abrir automaticamente ao ligar o aparelho (e reabrir se fechar). */
    fun autostart(ctx: Context): Boolean = sp(ctx).getBoolean("autostart", true)
    fun setAutostart(ctx: Context, on: Boolean) = sp(ctx).edit().putBoolean("autostart", on).apply()

    /** O técnico saiu do app pelo menu: o watchdog não reabre até o próximo boot/abertura. */
    fun userExit(ctx: Context): Boolean = sp(ctx).getBoolean("user_exit", false)
    fun setUserExit(ctx: Context, v: Boolean) = sp(ctx).edit().putBoolean("user_exit", v).apply()

    /** Última vez que a tela do player estava em primeiro plano (ms, relógio de boot). */
    fun lastAlive(ctx: Context): Long = sp(ctx).getLong("last_alive", 0)
    fun markAlive(ctx: Context, elapsed: Long) = sp(ctx).edit().putLong("last_alive", elapsed).apply()

    /** Pausa do watchdog (ex.: técnico nas configurações do Android). */
    fun pauseUntil(ctx: Context): Long = sp(ctx).getLong("pause_until", 0)
    fun setPauseUntil(ctx: Context, elapsed: Long) = sp(ctx).edit().putLong("pause_until", elapsed).apply()

    fun playerVersion(ctx: Context): String? = sp(ctx).getString("player_version", null)
    fun setPlayerVersion(ctx: Context, v: String?) = sp(ctx).edit().putString("player_version", v).apply()
}
