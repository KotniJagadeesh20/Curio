package com.codemastery.category;

import com.codemastery.category.CategoryDtos.*;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CategoryService {
    private final CategoryRepository categories;

    public CategoryService(CategoryRepository categories) {
        this.categories = categories;
    }

    @Transactional(readOnly = true)
    public List<CategoryDto> list() {
        return categories.findAllByOrderByPositionAscIdAsc().stream().map(CategoryDto::of).toList();
    }

    @Transactional
    public CategoryDto create(CategoryRequest r) {
        requireSlugFree(r.slug(), null);
        Category c = new Category();
        apply(c, r, categories.maxPosition() + 1);
        return CategoryDto.of(categories.save(c));
    }

    @Transactional
    public CategoryDto update(Long id, CategoryUpdateRequest r) {
        Category c = find(id);
        if (r.slug() != null && !r.slug().equals(c.getSlug())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category slug cannot be changed");
        }
        c.setName(r.name().trim());
        if (r.icon() != null) c.setIcon(r.icon().isBlank() ? "folder" : r.icon().trim());
        if (r.position() != null) c.setPosition(r.position());
        return CategoryDto.of(categories.save(c));
    }

    /** Collections reference categories with ON DELETE RESTRICT, so deleting a used one is a 409 (flushed here so it surfaces in the request). */
    @Transactional
    public void delete(Long id) {
        categories.delete(find(id));
        categories.flush();
    }

    private Category find(Long id) {
        return categories.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));
    }

    private void requireSlugFree(String slug, Long selfId) {
        categories.findBySlug(slug).filter(other -> !other.getId().equals(selfId)).ifPresent(other -> {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Slug already in use");
        });
    }

    private static void apply(Category c, CategoryRequest r, int defaultPosition) {
        c.setSlug(r.slug());
        c.setName(r.name().trim());
        c.setIcon(r.icon() == null || r.icon().isBlank() ? "folder" : r.icon().trim());
        c.setPosition(r.position() == null ? defaultPosition : r.position());
    }
}
