package com.codemastery.content;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface SectionRepository extends JpaRepository<Section, Long> {
    @Query("select count(l) from Lesson l where l.section.track.id = :trackId and l.published = true")
    long countPublishedLessons(Long trackId);

    long countByTrackId(Long trackId);

    /** The id of the collection that owns this module, only if {@code ownerId} owns it (scalar: no entity is loaded). */
    @Query("select s.track.id from Section s where s.id = :id and s.track.owner.id = :ownerId")
    java.util.Optional<Long> collectionIdOwnedBy(Long id, Long ownerId);
    boolean existsByTrackIdAndSlug(Long trackId, String slug);
}
