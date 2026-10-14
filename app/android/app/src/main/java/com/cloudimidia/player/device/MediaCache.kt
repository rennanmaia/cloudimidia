package com.cloudimidia.player.device

import android.content.Context
import okhttp3.Request
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Guarda no aparelho as mídias da programação (vídeos, imagens, músicas),
 * para a TV continuar exibindo sem internet.
 */
object MediaCache {
    /** Espaço mínimo que deve sobrar no aparelho */
    private const val MIN_FREE_BYTES = 300L * 1024 * 1024

    private val executor = Executors.newFixedThreadPool(2)
    private val pending = ConcurrentHashMap.newKeySet<String>()
    @Volatile private var wanted: Set<String> = emptySet()

    fun dir(ctx: Context): File = File(ctx.filesDir, "media").apply { mkdirs() }

    fun keyFor(url: String): String {
        val digest = MessageDigest.getInstance("SHA-1").digest(url.toByteArray())
        val hash = digest.joinToString("") { "%02x".format(it) }
        val ext = url.substringBefore('?').substringAfterLast('.', "").lowercase()
        return if (ext.length in 2..5 && ext.all { it.isLetterOrDigit() }) "$hash.$ext" else hash
    }

    fun fileFor(ctx: Context, url: String): File? = File(dir(ctx), keyFor(url)).takeIf { it.isFile && it.length() > 0 }

    fun enqueue(ctx: Context, url: String) {
        if (!url.startsWith("http://") && !url.startsWith("https://")) return
        if (fileFor(ctx, url) != null || !pending.add(url)) return
        val app = ctx.applicationContext
        executor.execute {
            try {
                download(app, url)
            } catch (e: Exception) {
                DiagLog.add("Falha ao baixar mídia: ${e.message}")
            } finally {
                pending.remove(url)
            }
        }
    }

    private fun download(ctx: Context, url: String) {
        val d = dir(ctx)
        if (d.usableSpace < MIN_FREE_BYTES) {
            DiagLog.add("Pouco espaço livre: mídias não foram salvas no aparelho")
            return
        }
        val target = File(d, keyFor(url))
        val part = File(d, target.name + ".part")
        Http.client.newCall(Request.Builder().url(url).build()).execute().use { res ->
            if (!res.isSuccessful) throw IllegalStateException("HTTP ${res.code}")
            val body = res.body ?: throw IllegalStateException("resposta vazia")
            part.outputStream().use { out -> body.byteStream().copyTo(out, 256 * 1024) }
        }
        if (!part.renameTo(target)) {
            part.delete()
            throw IllegalStateException("não foi possível salvar o arquivo")
        }
    }

    /** Mantém só as mídias da programação atual e baixa as que faltam. */
    fun sync(ctx: Context, urls: List<String>) {
        val keys = urls.map { keyFor(it) }.toSet()
        wanted = urls.toSet()
        dir(ctx).listFiles()?.forEach { f ->
            val base = f.name.removeSuffix(".part")
            if (base !in keys && !f.name.endsWith(".part")) f.delete()
        }
        urls.forEach { enqueue(ctx, it) }
    }

    fun clear(ctx: Context) {
        dir(ctx).listFiles()?.forEach { if (!it.name.endsWith(".part")) it.delete() }
    }

    fun stats(ctx: Context): Map<String, Any> {
        val files = dir(ctx).listFiles()?.filter { !it.name.endsWith(".part") } ?: emptyList()
        val cachedKeys = files.map { it.name }.toSet()
        val missing = wanted.count { keyFor(it) !in cachedKeys }
        return mapOf(
            "files" to files.size,
            "bytes" to files.sumOf { it.length() },
            "downloading" to pending.size,
            "missing" to missing,
        )
    }
}
