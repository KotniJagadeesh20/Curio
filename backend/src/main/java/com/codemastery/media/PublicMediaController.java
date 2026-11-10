package com.codemastery.media;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/public/media/{id}} and {@code /{id}/thumb}: anonymous, only for assets that genuinely belong to publicly readable
 * content (see {@link MediaAssetRepository#findPubliclyServable}). Strong ETag = the variant's sha256; the conditional request is
 * evaluated after visibility (weak comparison, see {@link EntityTags}). Short public caching, never {@code immutable}: revocation
 * can lag by up to {@code media.public-max-age}. No ranges, no filename.
 */
@RestController
@RequestMapping("/api/public/media")
public class PublicMediaController {
    private final PublicMediaService service;
    private final MediaProperties props;

    public PublicMediaController(PublicMediaService service, MediaProperties props) {
        this.service = service;
        this.props = props;
    }

    @GetMapping("/{id}")
    void original(@PathVariable String id, @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String inm,
                  HttpServletResponse response) throws IOException {
        respond(service.open(id, false, inm), response);
    }

    @GetMapping("/{id}/thumb")
    void thumb(@PathVariable String id, @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String inm,
               HttpServletResponse response) throws IOException {
        respond(service.open(id, true, inm), response);
    }

    /**
     * The response is written directly, NOT returned as a {@code ResponseEntity}. Spring MVC evaluates {@code If-None-Match} on its own
     * for any 200 {@code ResponseEntity} whose headers carry an ETag (including one set on the servlet response), with a more lenient
     * parser than RFC 9110: it finds a tag anywhere in the text and would answer 304 to {@code "tag" junk}. The conditional decision
     * has already been made, by {@link EntityTags}, after the visibility check; nothing else may make it again. Refusals are still
     * thrown ({@link MediaException}) before anything is written, so they reach the exception handler as usual.
     */
    private void respond(PublicMediaService.Result r, HttpServletResponse response) throws IOException {
        CacheControl cache = CacheControl.maxAge(props.publicMaxAge()).cachePublic();
        if (r instanceof PublicMediaService.NotModified nm) {
            response.setStatus(HttpStatus.NOT_MODIFIED.value());
            response.setHeader(HttpHeaders.ETAG, nm.etag());
            response.setHeader(HttpHeaders.CACHE_CONTROL, cache.getHeaderValue());
            response.setHeader("X-Content-Type-Options", "nosniff");
            return;
        }
        PublicMediaService.Served s = (PublicMediaService.Served) r;
        try (InputStream in = s.stream()) {
            response.setStatus(HttpStatus.OK.value());
            response.setContentType(s.contentType());
            response.setContentLengthLong(s.length());
            response.setHeader(HttpHeaders.ETAG, s.etag());
            response.setHeader(HttpHeaders.CACHE_CONTROL, cache.getHeaderValue());
            response.setHeader(HttpHeaders.ACCEPT_RANGES, "none");
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
            in.transferTo(response.getOutputStream());
        }
    }
}
