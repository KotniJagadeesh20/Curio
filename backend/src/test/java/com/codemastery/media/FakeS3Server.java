package com.codemastery.media;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

/**
 * A recording, path-style S3 stand-in for tests that must observe what the AWS SDK puts on the wire (headers, bytes, retries) or inject
 * failures a real store can't produce on demand. It is NOT evidence about real S3 semantics: that is what the MinIO tests are for.
 */
final class FakeS3Server implements AutoCloseable {
    record Req(String method, String path, Map<String, String> headers, byte[] body, int bodyBytesSeen) {
        String header(String name) { return headers.get(name.toLowerCase()); }
    }

    final List<Req> requests = new CopyOnWriteArrayList<>();
    final Map<String, byte[]> objects = new ConcurrentHashMap<>();
    /** Called for each request before it is handled; may throw or hold the thread to simulate failures. */
    volatile Consumer<Req> beforeHandling = r -> {};
    /** Called as soon as the request line and headers have arrived, before any body byte is read. */
    volatile Consumer<Req> onHeaders = r -> {};
    /** When set, a PUT is answered with this status instead of being stored. */
    volatile int putStatus = 0;
    /** When >= 0, the connection is cut after reading this many body bytes of a PUT. */
    volatile int cutPutAfter = -1;
    private final HttpServer server;

    FakeS3Server() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", this::handle);
        server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
        server.start();
    }

    String endpoint() { return "http://127.0.0.1:" + server.getAddress().getPort(); }

    private void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        String path = ex.getRequestURI().getRawPath();
        Map<String, String> headers = new ConcurrentHashMap<>();
        ex.getRequestHeaders().forEach((k, v) -> headers.put(k.toLowerCase(), String.join(",", v)));
        onHeaders.accept(new Req(method, path, headers, new byte[0], 0));
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        boolean cut = false;
        try (InputStream in = ex.getRequestBody()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                body.write(buf, 0, n);
                if (method.equals("PUT") && cutPutAfter >= 0 && body.size() >= cutPutAfter) { cut = true; break; }
            }
        }
        Req req = new Req(method, path, headers, body.toByteArray(), body.size());
        requests.add(req);
        if (cut) { ex.close(); return; }   // closes the socket without a response
        beforeHandling.accept(req);
        String key = path.length() > 1 ? path.substring(1) : "";   // "bucket" or "bucket/key..."
        switch (method) {
            case "PUT" -> {
                if (putStatus != 0) { reply(ex, putStatus, new byte[0]); return; }
                objects.put(key, decode(req));
                ex.getResponseHeaders().add("ETag", "\"x\"");
                reply(ex, 200, new byte[0]);
            }
            case "GET" -> {
                byte[] b = objects.get(key);
                if (b == null) reply(ex, 404, "<Error><Code>NoSuchKey</Code><Message>missing</Message></Error>".getBytes());
                else reply(ex, 200, b);
            }
            case "HEAD" -> {
                if (!key.contains("/")) { reply(ex, 200, new byte[0]); return; }   // HeadBucket
                ex.getResponseHeaders().add("Content-Length", "0");
                ex.sendResponseHeaders(objects.containsKey(key) ? 200 : 404, -1);
                ex.close();
            }
            case "DELETE" -> { objects.remove(key); reply(ex, 204, new byte[0]); }
            default -> reply(ex, 405, new byte[0]);
        }
    }

    /** The SDK sends {@code aws-chunked} bodies over plain HTTP (signed chunks); a real store strips the framing, so does this one. */
    static byte[] decode(Req req) {
        String enc = req.header("content-encoding");
        if (enc == null || !enc.contains("aws-chunked")) return req.body();
        byte[] b = req.body();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int i = 0;
        while (i < b.length) {
            int eol = i;
            while (eol + 1 < b.length && !(b[eol] == '\r' && b[eol + 1] == '\n')) eol++;
            String head = new String(b, i, eol - i, java.nio.charset.StandardCharsets.US_ASCII);
            int size = Integer.parseInt(head.split(";")[0].trim(), 16);
            i = eol + 2;
            if (size == 0) break;
            out.write(b, i, size);
            i += size + 2;
        }
        return out.toByteArray();
    }

    private static void reply(HttpExchange ex, int status, byte[] body) throws IOException {
        ex.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
        if (body.length > 0) ex.getResponseBody().write(body);
        ex.close();
    }

    @Override
    public void close() { server.stop(0); }
}
