package com.codemastery.collection;

import com.codemastery.collection.CollectionDtos.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** Creator workspace: pages. */
@RestController
@RequestMapping("/api/pages")
public class PageController {
    private final CollectionService service;

    public PageController(CollectionService service) {
        this.service = service;
    }

    @GetMapping("/{id}")
    public PageDto get(@PathVariable Long id) { return service.getPage(id); }

    @PutMapping("/{id}")
    public PageDto update(@PathVariable Long id, @Valid @RequestBody PageUpdate r) { return service.updatePage(id, r); }

    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) { service.deletePage(id); }

    @PostMapping("/{id}/publish")
    public PageDto publish(@PathVariable Long id) { return service.publishPage(id); }

    @PostMapping("/{id}/unpublish")
    public PageDto unpublish(@PathVariable Long id) { return service.unpublishPage(id); }

    @PatchMapping("/{id}/reorder")
    public PageDto reorder(@PathVariable Long id, @Valid @RequestBody Reorder r) { return service.reorderPage(id, r.position()); }
}
