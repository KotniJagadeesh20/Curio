package com.codemastery.category;

import com.codemastery.category.CategoryDtos.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** Writes only: reading is the public list. ADMIN-only via the /api/admin/** rule in SecurityConfig. */
@RestController
@RequestMapping("/api/admin/categories")
public class AdminCategoryController {
    private final CategoryService categories;

    public AdminCategoryController(CategoryService categories) {
        this.categories = categories;
    }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public CategoryDto create(@Valid @RequestBody CategoryRequest r) { return categories.create(r); }

    @PutMapping("/{id}")
    public CategoryDto update(@PathVariable Long id, @Valid @RequestBody CategoryUpdateRequest r) {
        return categories.update(id, r);
    }

    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) { categories.delete(id); }
}
