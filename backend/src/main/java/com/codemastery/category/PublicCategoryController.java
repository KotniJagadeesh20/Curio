package com.codemastery.category;

import com.codemastery.category.CategoryDtos.CategoryDto;
import java.util.List;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/public/categories")
public class PublicCategoryController {
    private final CategoryService categories;

    public PublicCategoryController(CategoryService categories) {
        this.categories = categories;
    }

    @GetMapping
    public List<CategoryDto> list() {
        return categories.list();
    }
}
