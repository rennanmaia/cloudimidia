package com.cloudimidia.player.device

import android.content.Context
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Guarda no aparelho as mídias da programação (vídeos, imagens, músicas),
 * para a TV continuar exibindo sem internet.
 * - downloads continuam de onde pararam (arquivo .part + Range);
 * - falhas são tentadas de novo sozinhas, com intervalo crescente (15 s até 15 min);
 * - o tamanho final é conferido antes de o arquivo ser usado.
 */
object MediaCache {
    /** Espaço mínimo que deve sobrar no aparelho */
    private const val MIN_FREE_BYTES = 300L * 1024 * 1024
    private const val MAX_RETRY_DELAY_S = 15L * 60

    private val executor = Executors.newFixedThreadPool(2)
    private val scheduler = Executors.newSingleThreadScheduledExecutor()
    private val pending = ConcurrentHashMap.newKeySet<String>()
    private val failures = ConcurrentHashMap<String, Int>()
    @Volatile private var lastError: String? = null
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
                failures.remove(url)
            } catch (e: Exception) {
                lastError = e.message
                DiagLog.add("Falha ao baixar mídia: ${e.message}")
                scheduleRetry(app, url)
            } finally {
                pending.remove(url)
            }
        }
    }

    private fun scheduleRetry(ctx: Context, url: String) {
        if (url !in wanted) return
        val n = failures.merge(url, 1, Int::plus) ?: 1
        val delay = minOf(MAX_RETRY_DELAY_S, 15L shl minOf(n - 1, 6))
        scheduler.schedule({ if (url in wanted) enqueue(ctx, url) }, delay, TimeUnit.SECONDS)
    }

    private fun download(ctx: Context, url: String) {
        val d = dir(ctx)
        if (d.usableSpace < MIN_FREE_BYTES) throw IllegalStateException("pouco espaço livre no aparelho")
        val target = File(d, keyFor(url))
        val part = File(d, target.name + ".part")
        val have = if (part.isFile) part.length() else 0L
        val req = Request.Builder().url(url).apply { if (have > 0) header("Range", "bytes=$have-") }.build()
        Http.client.newCall(req).execute().use { res ->
            if (res.code == 416) {
                // Parte salva não confere com o arquivo do servidor: recomeça
                part.delete()
                throw IllegalStateException("download reiniciado")
            }
            if (!res.isSuccessful) throw IllegalStateException("HTTP ${res.code}")
            val body = res.body ?: throw IllegalStateException("resposta vazia")
            val resume = res.code == 206 && have > 0
            val total = if (res.code == 206) {
                res.header("Content-Range")?.substringAfter('/')?.toLongOrNull() ?: -1L
            } else body.contentLength()
            if (total > 0 && d.usableSpace - (total - (if (resume) have else 0)) < MIN_FREE_BYTES) {
                throw IllegalStateException("pouco espaço livre no aparelho")
            }
            FileOutputStream(part, resume).use { out -> body.byteStream().copyTo(out, 256 * 1024) }
            if (total > 0 && part.length() != total) {
                throw IllegalStateException("arquivo incompleto (${part.length()} de $total bytes), continua depois")
            }
        }
        if (!part.renameTo(target)) {
            part.delete()
            throw IllegalStateException("não foi possível salvar o arquivo")
        }
    }

    /** Mantém só as mídias da programação atual e baixa as que faltam (na ordem recebida). */
    fun sync(ctx: Context, urls: List<String>) {
        val keys = urls.map { keyFor(it) }.toSet()
        wanted = urls.toSet()
        failures.keys.retainAll(wanted)
        dir(ctx).listFiles()?.forEach { f ->
            if (f.name.removeSuffix(".part") !in keys) f.delete()
        }
        urls.forEach { enqueue(ctx, it) }
    }

    fun clear(ctx: Context) {
        dir(ctx).listFiles()?.forEach { if (!it.name.endsWith(".part")) it.delete() }
    }

    /** Mídias da programação que já estão no aparelho (o player só exibe estas). */
    fun state(ctx: Context): JSONObject {
        val ready = JSONArray()
        val missing = JSONArray()
        for (u in wanted) if (fileFor(ctx, u) != null) ready.put(u) else missing.put(u)
        return JSONObject().put("ready", ready).put("missing", missing).put("downloading", pending.size)
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
            "failed" to failures.keys.count { keyFor(it) !in cachedKeys },
            "last_error" to (lastError ?: ""),
        )
    }
}
