package com.codemastery.collection;

import com.codemastery.collection.CollectionDtos.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** Creator workspace: modules (and adding pages to one). */
@RestController
@RequestMapping("/api/modules")
public class ModuleController {
    private final CollectionService service;

    public ModuleController(CollectionService service) {
        this.service = service;
    }

    @PutMapping("/{id}")
    public ModuleDto update(@PathVariable Long id, @Valid @RequestBody ModuleUpdate r) { return service.updateModule(id, r); }

    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) { service.deleteModule(id); }

    @PatchMapping("/{id}/reorder")
    public ModuleDto reorder(@PathVariable Long id, @Valid @RequestBody Reorder r) { return service.reorderModule(id, r.position()); }

    @PostMapping("/{id}/pages") @ResponseStatus(HttpStatus.CREATED)
    public PageDto createPage(@PathVariable Long id, @Valid @RequestBody PageCreate r) { return service.createPage(id, r); }
}
