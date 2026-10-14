package com.cloudimidia.player.device

import android.content.Context
import java.io.BufferedOutputStream
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.io.RandomAccessFile
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.util.concurrent.Executors

/**
 * Servidor HTTP mínimo em 127.0.0.1, usado pela WebView:
 *  /player/...   -> player (versão baixada ou embutida no app)
 *  /cache?u=URL  -> mídia salva no aparelho; se ainda não estiver salva, redireciona para a URL original e baixa em segundo plano
 * Assim a TV liga e exibe mesmo sem internet.
 */
class LocalServer private constructor(private val ctx: Context) {
    companion object {
        const val PORT = 8765
        @Volatile private var instance: LocalServer? = null

        fun start(ctx: Context): LocalServer = synchronized(this) {
            instance ?: LocalServer(ctx.applicationContext).also { it.run(); instance = it }
        }

        private val MIME = mapOf(
            "html" to "text/html; charset=utf-8", "js" to "application/javascript; charset=utf-8", "mjs" to "application/javascript; charset=utf-8",
            "css" to "text/css; charset=utf-8", "json" to "application/json", "webmanifest" to "application/manifest+json",
            "svg" to "image/svg+xml", "png" to "image/png", "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "gif" to "image/gif", "webp" to "image/webp",
            "ico" to "image/x-icon", "woff" to "font/woff", "woff2" to "font/woff2", "ttf" to "font/ttf",
            "mp4" to "video/mp4", "m4v" to "video/mp4", "webm" to "video/webm", "ogv" to "video/ogg",
            "mp3" to "audio/mpeg", "m4a" to "audio/mp4", "aac" to "audio/aac", "ogg" to "audio/ogg", "wav" to "audio/wav",
        )

        fun mimeFor(name: String) = MIME[name.substringAfterLast('.', "").lowercase()] ?: "application/octet-stream"
    }

    private val pool = Executors.newCachedThreadPool()
    private var socket: ServerSocket? = null

    private fun run() {
        Thread({
            var attempts = 0
            while (socket == null && attempts < 30) {
                try {
                    socket = ServerSocket().apply {
                        reuseAddress = true
                        bind(InetSocketAddress(InetAddress.getByName("127.0.0.1"), PORT))
                    }
                } catch (e: Exception) {
                    attempts++
                    DiagLog.add("Servidor local: porta ocupada, tentando de novo (${e.message})")
                    Thread.sleep(1000)
                }
            }
            val s = socket ?: return@Thread
            while (!s.isClosed) {
                try {
                    val client = s.accept()
                    pool.execute { handle(client) }
                } catch (e: Exception) {
                    if (s.isClosed) break
                }
            }
        }, "cloudimidia-local-server").apply { isDaemon = true }.start()
    }

    private fun readHead(input: InputStream): List<String>? {
        val buf = StringBuilder()
        var prev3 = ""
        while (true) {
            val b = input.read()
            if (b == -1) return null
            val c = b.toChar()
            buf.append(c)
            prev3 = (prev3 + c).takeLast(4)
            if (prev3 == "\r\n\r\n") break
            if (buf.length > 16 * 1024) return null
        }
        return buf.toString().split("\r\n").filter { it.isNotEmpty() }
    }

    private fun handle(client: Socket) {
        client.use { sock ->
            try {
                sock.soTimeout = 15000
                val lines = readHead(sock.getInputStream().buffered()) ?: return
                val parts = lines.first().split(" ")
                if (parts.size < 2) return
                val method = parts[0]
                val target = parts[1]
                val headers = lines.drop(1).mapNotNull { l ->
                    val i = l.indexOf(':')
                    if (i > 0) l.substring(0, i).trim().lowercase() to l.substring(i + 1).trim() else null
                }.toMap()
                val out = BufferedOutputStream(sock.getOutputStream(), 64 * 1024)
                val path = target.substringBefore('?')
                val query = target.substringAfter('?', "")
                val head = method == "HEAD"

                when {
                    method != "GET" && !head -> status(out, 405, "Method Not Allowed")
                    path == "/health" -> text(out, 200, "ok")
                    path == "/cache" -> {
                        val url = query.split('&').firstOrNull { it.startsWith("u=") }?.let { URLDecoder.decode(it.substring(2), "UTF-8") }
                        if (url == null) return status(out, 400, "Bad Request")
                        val file = MediaCache.fileFor(ctx, url)
                        if (file != null) {
                            serveFile(out, file, mimeFor(url.substringBefore('?')), headers["range"], head, cacheable = true)
                        } else {
                            MediaCache.enqueue(ctx, url)
                            redirect(out, url)
                        }
                    }
                    path == "/" || path == "/player" || path == "/player/" -> redirect(out, "/player/tv.html")
                    path.startsWith("/player/") -> {
                        val rel = URLDecoder.decode(path.removePrefix("/player/"), "UTF-8")
                        if (rel.contains("..")) return status(out, 403, "Forbidden")
                        val dir = PlayerBundle.currentDir(ctx)
                        val file = dir?.let { File(it, rel) }
                        if (rel == "tv.html") {
                            val html = if (file != null && file.isFile) file.readText() else ctx.assets.open("player/tv.html").use { it.readBytes().toString(Charsets.UTF_8) }
                            serveHtml(out, injectConfig(html), head)
                        } else if (file != null && file.isFile) {
                            serveFile(out, file, mimeFor(rel), headers["range"], head, cacheable = true)
                        } else {
                            serveAsset(out, "player/$rel", head)
                        }
                    }
                    else -> status(out, 404, "Not Found")
                }
                out.flush()
            } catch (_: Exception) {
                // conexão encerrada pelo navegador (comum em vídeos)
            }
        }
    }

    /**
     * A configuração do app (servidor, cache local) vai escrita no próprio HTML,
     * garantindo que exista antes de qualquer script do player rodar.
     */
    private fun injectConfig(html: String): String {
        val server = Prefs.serverUrl(ctx).trimEnd('/')
        val cfg = org.json.JSONObject().apply {
            put("apiBase", "$server/api/")
            put("appBase", "$server/")
            put("cacheBase", "http://127.0.0.1:$PORT/cache?u=")
            put("native", true)
            put("appVersion", com.cloudimidia.player.BuildConfig.VERSION_NAME)
        }
        val tag = "<script>window.__CM_CONFIG__=$cfg;</script>"
        val i = html.indexOf("<head>")
        return if (i >= 0) html.substring(0, i + 6) + tag + html.substring(i + 6) else tag + html
    }

    private fun serveHtml(out: OutputStream, html: String, head: Boolean) {
        val bytes = html.toByteArray(Charsets.UTF_8)
        writeHead(out, 200, "OK", mapOf("Content-Type" to "text/html; charset=utf-8", "Content-Length" to bytes.size.toString(), "Cache-Control" to "no-store"))
        if (!head) out.write(bytes)
    }

    private fun writeHead(out: OutputStream, code: Int, msg: String, headers: Map<String, String>) {
        val sb = StringBuilder("HTTP/1.1 $code $msg\r\n")
        headers.forEach { (k, v) -> sb.append(k).append(": ").append(v).append("\r\n") }
        sb.append("Access-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n")
        out.write(sb.toString().toByteArray(Charsets.ISO_8859_1))
    }

    private fun status(out: OutputStream, code: Int, msg: String) = text(out, code, msg)

    private fun text(out: OutputStream, code: Int, body: String) {
        val bytes = body.toByteArray()
        writeHead(out, code, if (code == 200) "OK" else body, mapOf("Content-Type" to "text/plain; charset=utf-8", "Content-Length" to bytes.size.toString()))
        out.write(bytes)
    }

    private fun redirect(out: OutputStream, location: String) {
        writeHead(out, 302, "Found", mapOf("Location" to location, "Content-Length" to "0", "Cache-Control" to "no-store"))
    }

    private fun serveAsset(out: OutputStream, assetPath: String, head: Boolean) {
        val bytes = try {
            ctx.assets.open(assetPath).use { it.readBytes() }
        } catch (_: Exception) {
            return status(out, 404, "Not Found")
        }
        writeHead(out, 200, "OK", mapOf(
            "Content-Type" to mimeFor(assetPath),
            "Content-Length" to bytes.size.toString(),
            "Cache-Control" to if (assetPath.endsWith(".html")) "no-cache" else "max-age=86400",
        ))
        if (!head) out.write(bytes)
    }

    private fun serveFile(out: OutputStream, file: File, mime: String, range: String?, head: Boolean, cacheable: Boolean) {
        val length = file.length()
        var start = 0L
        var end = length - 1
        var partial = false
        if (range != null && range.startsWith("bytes=")) {
            val spec = range.removePrefix("bytes=").substringBefore(',')
            val a = spec.substringBefore('-')
            val b = spec.substringAfter('-', "")
            if (a.isEmpty() && b.isNotEmpty()) {
                start = maxOf(0, length - b.toLong())
            } else {
                start = a.toLongOrNull() ?: 0
                if (b.isNotEmpty()) end = minOf(b.toLong(), length - 1)
            }
            if (start >= length || start > end) {
                writeHead(out, 416, "Range Not Satisfiable", mapOf("Content-Range" to "bytes */$length", "Content-Length" to "0"))
                return
            }
            partial = true
        }
        val count = end - start + 1
        val headers = mutableMapOf(
            "Content-Type" to mime,
            "Content-Length" to count.toString(),
            "Accept-Ranges" to "bytes",
            "Cache-Control" to if (cacheable) "max-age=86400" else "no-cache",
        )
        if (partial) headers["Content-Range"] = "bytes $start-$end/$length"
        writeHead(out, if (partial) 206 else 200, if (partial) "Partial Content" else "OK", headers)
        if (head) return
        RandomAccessFile(file, "r").use { raf ->
            raf.seek(start)
            val buf = ByteArray(64 * 1024)
            var left = count
            while (left > 0) {
                val n = raf.read(buf, 0, minOf(buf.size.toLong(), left).toInt())
                if (n <= 0) break
                out.write(buf, 0, n)
                left -= n
            }
        }
    }
}
