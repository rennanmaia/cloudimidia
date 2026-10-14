package com.cloudimidia.player.device

import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Últimos erros/eventos do aparelho, enviados nas estatísticas para o painel. */
object DiagLog {
    private const val MAX = 20
    private val items = ArrayDeque<String>()
    private val fmt = SimpleDateFormat("dd/MM HH:mm:ss", Locale.US)

    @Synchronized
    fun add(msg: String) {
        Log.w("CloudiMidia", msg)
        items.addLast("${fmt.format(Date())} $msg".take(300))
        while (items.size > MAX) items.removeFirst()
    }

    @Synchronized
    fun recent(): List<String> = items.toList()
}
