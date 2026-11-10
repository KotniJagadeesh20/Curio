package com.codemastery.collection;

import com.codemastery.collection.CollectionDtos.*;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** Creator workspace: collections. Any authenticated user; ownership is enforced in {@link CollectionService}. */
@RestController
@RequestMapping("/api/collections")
public class CollectionController {
    private final CollectionService service;

    public CollectionController(CollectionService service) {
        this.service = service;
    }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public CollectionSummary create(@Valid @RequestBody CollectionCreate r) { return service.create(r); }

    /** {@code ?deleted=true} lists the soft-deleted ones that can still be restored. */
    @GetMapping("/mine")
    public List<CollectionSummary> mine(@RequestParam(defaultValue = "false") boolean deleted) { return service.mine(deleted); }

    @GetMapping("/{id}")
    public CollectionDetail get(@PathVariable Long id) { return service.get(id); }

    @PutMapping("/{id}")
    public CollectionSummary update(@PathVariable Long id, @Valid @RequestBody CollectionUpdate r) { return service.update(id, r); }

    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) { service.delete(id); }

    @PostMapping("/{id}/restore")
    public CollectionSummary restore(@PathVariable Long id) { return service.restore(id); }

    @PostMapping("/{id}/publish")
    public CollectionSummary publish(@PathVariable Long id, @Valid @RequestBody(required = false) PublishRequest r) {
        return service.publish(id, r == null ? null : r.status());
    }

    @PostMapping("/{id}/unpublish")
    public CollectionSummary unpublish(@PathVariable Long id) { return service.unpublish(id); }

    @PostMapping("/{id}/modules") @ResponseStatus(HttpStatus.CREATED)
    public ModuleDto createModule(@PathVariable Long id, @Valid @RequestBody ModuleCreate r) { return service.createModule(id, r); }
}
