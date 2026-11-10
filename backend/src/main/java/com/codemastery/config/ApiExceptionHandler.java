package com.codemastery.config;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    /** Machine-readable 409s (stale page version, autosave of a published page): the editor tells them from other 409s. */
    @ExceptionHandler(CodedConflictException.class)
    ResponseEntity<Map<String, String>> codedConflict(CodedConflictException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", String.valueOf(e.getReason()), "code", e.code()));
    }

    /** Write boundary for page blocks: which blocks/fields are wrong, so the editor can mark them. Nothing was saved. */
    @ExceptionHandler(com.codemastery.blocks.InvalidBlocksException.class)
    ResponseEntity<Map<String, Object>> invalidBlocks(com.codemastery.blocks.InvalidBlocksException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", e.getMessage(), "code", "INVALID_BLOCKS", "problems", e.problems()));
    }

    /** Backstop: a lost optimistic-lock race anywhere else is a conflict the client can retry, never a 500. */
    @ExceptionHandler(org.springframework.dao.OptimisticLockingFailureException.class)
    ResponseEntity<Map<String, String>> lostRace(org.springframework.dao.OptimisticLockingFailureException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "This page was changed at the same moment. Reload it and try again.", "code", "VERSION_CONFLICT"));
    }

    /** Media refusals: a stable code the uploader maps to a message; nothing internal in the text. */
    @ExceptionHandler(com.codemastery.media.MediaException.class)
    ResponseEntity<Map<String, String>> media(com.codemastery.media.MediaException e) {
        return ResponseEntity.status(e.status()).body(Map.of("error", e.getMessage(), "code", e.code()));
    }

    /** 409 with where the image is used (up to 20 entries) and the real total, so the creator can find and replace it. */
    @ExceptionHandler(com.codemastery.media.MediaInUseException.class)
    ResponseEntity<Map<String, Object>> mediaInUse(com.codemastery.media.MediaInUseException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage(), "code", "MEDIA_IN_USE",
                "usages", e.usages().items(), "totalUsages", e.usages().total()));
    }

    /** The servlet-layer multipart limit (spring.servlet.multipart.*) fired before the controller was reached. */
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    ResponseEntity<Map<String, String>> tooLarge(org.springframework.web.multipart.MaxUploadSizeExceededException e) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(Map.of("error", "The file is too large.", "code", "MEDIA_TOO_LARGE"));
    }

    @ExceptionHandler(org.springframework.web.multipart.MultipartException.class)
    ResponseEntity<Map<String, String>> badMultipart(org.springframework.web.multipart.MultipartException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "The upload could not be read.", "code", "MEDIA_BAD_REQUEST"));
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, String>> status(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode()).body(Map.of("error", String.valueOf(e.getReason())));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Map<String, String>> conflict(DataIntegrityViolationException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "Conflicts with existing data (duplicate slug or still referenced)"));
    }

    /** Malformed JSON, a wrong type/enum value, or (on strict DTOs) a field the endpoint doesn't accept, e.g. ownerId. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Map<String, String>> unreadable(HttpMessageNotReadableException e) {
        String msg = e.getCause() instanceof UnrecognizedPropertyException u
                ? "Field '" + u.getPropertyName() + "' is not accepted here"
                : "Invalid request body";
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", msg));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, String>> invalid(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + " " + f.getDefaultMessage()).findFirst().orElse("Invalid request");
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", msg));
    }
}
