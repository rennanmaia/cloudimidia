package com.cloudimidia.player.device

import android.content.Context
import okhttp3.Request
import java.io.File

/**
 * O player (HTML/JS) vem embutido no app (assets/player) e é atualizado a partir do servidor:
 * a versão baixada fica em files/player/current e tem prioridade sobre a embutida.
 */
object PlayerBundle {
    fun currentDir(ctx: Context): File? {
        val d = File(ctx.filesDir, "player/current")
        return if (File(d, "tv.html").isFile) d else null
    }

    fun version(ctx: Context): String = if (currentDir(ctx) != null) (Prefs.playerVersion(ctx) ?: "baixado") else "embutido"

    /** files: lista de pares (caminho relativo, URL). Só troca a versão se todos os arquivos baixarem. */
    @Synchronized
    fun update(ctx: Context, files: List<Pair<String, String>>, version: String) {
        val root = File(ctx.filesDir, "player")
        val next = File(root, "next")
        next.deleteRecursively()
        next.mkdirs()
        for ((path, url) in files) {
            if (path.contains("..") || path.startsWith("/")) throw IllegalArgumentException("caminho inválido: $path")
            val out = File(next, path)
            out.parentFile?.mkdirs()
            Http.client.newCall(Request.Builder().url(url).build()).execute().use { res ->
                if (!res.isSuccessful) throw IllegalStateException("HTTP ${res.code} em $path")
                out.outputStream().use { o -> res.body!!.byteStream().copyTo(o) }
            }
        }
        if (!File(next, "tv.html").isFile) throw IllegalStateException("pacote do player sem tv.html")
        val current = File(root, "current")
        val old = File(root, "old")
        old.deleteRecursively()
        if (current.exists() && !current.renameTo(old)) current.deleteRecursively()
        if (!next.renameTo(current)) throw IllegalStateException("não foi possível ativar a nova versão")
        old.deleteRecursively()
        Prefs.setPlayerVersion(ctx, version)
    }

    /** Volta para o player embutido no app (usado se a versão baixada falhar). */
    fun reset(ctx: Context) {
        File(ctx.filesDir, "player").deleteRecursively()
        Prefs.setPlayerVersion(ctx, null)
    }
}
