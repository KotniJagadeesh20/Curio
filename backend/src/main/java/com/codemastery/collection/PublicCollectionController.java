package com.codemastery.collection;

import com.codemastery.collection.PublicDtos.*;
import org.springframework.web.bind.annotation.*;

/** Anonymous read API for creator content (Step 6). GET only; {@code permitAll} through {@code /api/public/**}. */
@RestController
@RequestMapping("/api/public")
public class PublicCollectionController {
    private final PublicCollectionService service;

    public PublicCollectionController(PublicCollectionService service) {
        this.service = service;
    }

    @GetMapping("/collections")
    public PagedResult<PublicCollectionSummary> list(@RequestParam(required = false) String category,
                                                     @RequestParam(required = false) String q,
                                                     @RequestParam(required = false) Integer page,
                                                     @RequestParam(required = false) Integer size) {
        return service.list(category, q, page, size);
    }

    @GetMapping("/collections/{username}/{slug}")
    public PublicCollectionDetail collection(@PathVariable String username, @PathVariable String slug) {
        return service.collection(username, slug);
    }

    @GetMapping("/pages/{username}/{collectionSlug}/{pageSlug}")
    public PublicPageView page(@PathVariable String username, @PathVariable String collectionSlug,
                               @PathVariable String pageSlug) {
        return service.page(username, collectionSlug, null, pageSlug);
    }

    @GetMapping("/pages/{username}/{collectionSlug}/{moduleSlug}/{pageSlug}")
    public PublicPageView page(@PathVariable String username, @PathVariable String collectionSlug,
                               @PathVariable String moduleSlug, @PathVariable String pageSlug) {
        return service.page(username, collectionSlug, moduleSlug, pageSlug);
    }
}
