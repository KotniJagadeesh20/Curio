package com.codemastery.category;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CategoryRepository extends JpaRepository<Category, Long> {
    List<Category> findAllByOrderByPositionAscIdAsc();
    Optional<Category> findBySlug(String slug);

    @Query("select coalesce(max(c.position), 0) from Category c")
    int maxPosition();
}
