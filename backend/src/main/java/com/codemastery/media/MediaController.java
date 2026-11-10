package com.codemastery.media;

import com.codemastery.media.MediaDtos.MediaAssetDto;
import com.codemastery.security.CurrentUser;
import com.codemastery.user.User;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;
import org.springframework.web.util.WebUtils;

/** Creator media API: upload, owner-only serving (12a) and delete (12b). Public serving is {@link PublicMediaController}. */
@RestController
@RequestMapping("/api/media")
public class MediaController {
    private final CurrentUser currentUser;
    private final MediaService media;

    public MediaController(CurrentUser currentUser, MediaService media) {
        this.currentUser = currentUser;
        this.media = media;
    }

    /** {@code POST /api/media}: multipart with exactly one part named {@code file} and nothing else. */
    @PostMapping
    ResponseEntity<MediaAssetDto> upload(HttpServletRequest request) {
        User user = currentUser.require();   // authenticated and ACTIVE before anything else is looked at
        // unwrap: Spring Security wraps the request, and in that case a plain instanceof would miss the multipart request underneath
        MultipartHttpServletRequest multipart = WebUtils.getNativeRequest(request, MultipartHttpServletRequest.class);
        if (multipart == null) throw MediaException.badRequest("Send the image as multipart/form-data in a part named 'file'.");
        var files = multipart.getMultiFileMap();
        if (files.size() != 1 || !files.containsKey("file") || files.get("file").size() != 1 || multipart.getParameterNames().hasMoreElements()) {
            throw MediaException.badRequest("Send exactly one part named 'file' and nothing else.");
        }
        MultipartFile file = files.getFirst("file");
        return ResponseEntity.status(HttpStatus.CREATED).body(MediaAssetDto.of(media.upload(user, file)));
    }

    /**
     * {@code DELETE /api/media/{id}}: owner only. 409 {@code MEDIA_IN_USE} while a page or cover uses it, 409 {@code MEDIA_NOT_READY}
     * while it is still uploading, 204 otherwise (also for a repeat). Anonymous and suspended callers are 401 ({@code CurrentUser});
     * non-owners, admins and unknown ids are 404.
     */
    @DeleteMapping("/{id}")
    ResponseEntity<Void> delete(@PathVariable UUID id) {
        User user = currentUser.require();
        media.delete(user, id);
        return ResponseEntity.noContent().build();
    }

    /**
     * {@code GET /api/media/{id}/content?variant=original|thumb}: the owner's own asset, nobody else's (admins included).
     * Never cached: visibility is the owner's alone, and this route exists for the editor's authenticated fetch.
     */
    @GetMapping("/{id}/content")
    ResponseEntity<InputStreamResource> content(@PathVariable UUID id, @RequestParam(defaultValue = "original") String variant) {
        User user = currentUser.require();
        if (!variant.equals("original") && !variant.equals("thumb")) throw MediaException.badRequest("variant must be 'original' or 'thumb'.");
        MediaService.Served s = media.openOwned(user, id, variant.equals("thumb"));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(s.contentType()))
                .contentLength(s.length())
                .cacheControl(CacheControl.noStore().cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "default-src 'none'; sandbox")
                .body(new InputStreamResource(s.stream()));
    }
}
