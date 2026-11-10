package com.codemastery.content;

import com.codemastery.content.ContentDtos.*;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/**
 * Admin problem management only. Track/section/lesson management is NOT here: that content is creator-owned and is
 * edited through the owner-checked creator API (/api/collections, /api/modules, /api/pages). Admins moderate other
 * people's content, they do not edit it.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminContentController {
    private final ContentService content;

    public AdminContentController(ContentService content) {
        this.content = content;
    }

    // problems
    @GetMapping("/problems")
    public List<ProblemSummary> problems() { return content.adminProblems(); }

    @GetMapping("/problems/{id}")
    public ProblemDto problem(@PathVariable Long id) { return content.adminProblem(id); }

    @PostMapping("/problems") @ResponseStatus(HttpStatus.CREATED)
    public ProblemDto createProblem(@Valid @RequestBody ProblemRequest r) { return content.createProblem(r); }

    @PutMapping("/problems/{id}")
    public ProblemDto updateProblem(@PathVariable Long id, @Valid @RequestBody ProblemRequest r) {
        return content.updateProblem(id, r);
    }

    @DeleteMapping("/problems/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteProblem(@PathVariable Long id) { content.deleteProblem(id); }
}
