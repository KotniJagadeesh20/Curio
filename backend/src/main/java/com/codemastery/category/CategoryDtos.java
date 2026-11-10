package com.codemastery.category;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class CategoryDtos {
    static final String SLUG = "^[a-z0-9]+(-[a-z0-9]+)*$";

    public record CategoryDto(Long id, String slug, String name, String icon, int position) {
        static CategoryDto of(Category c) {
            return new CategoryDto(c.getId(), c.getSlug(), c.getName(), c.getIcon(), c.getPosition());
        }
    }

    /** icon defaults to "folder" and position to "after the last one" when omitted. */
    public record CategoryRequest(
            @NotBlank @Pattern(regexp = SLUG) @Size(max = 60) String slug,
            @NotBlank @Size(max = 80) String name,
            @Size(max = 60) String icon,
            Integer position) {}

    /**
     * Slugs are immutable after creation. {@code slug} is accepted only so clients may echo the current
     * value back; omitted or equal is fine, anything else is a 400. Omitted icon/position = unchanged.
     */
    public record CategoryUpdateRequest(
            @Pattern(regexp = SLUG) @Size(max = 60) String slug,
            @NotBlank @Size(max = 80) String name,
            @Size(max = 60) String icon,
            Integer position) {}
}
