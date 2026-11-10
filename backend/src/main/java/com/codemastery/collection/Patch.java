package com.codemastery.collection;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.exc.InvalidFormatException;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * A request field that can be told apart in three states (PLAN.md Step 12b, "Cover contract"):
 * <ul>
 *   <li><b>absent</b>: the field was not in the JSON. The record component is a plain Java {@code null} reference;</li>
 *   <li><b>explicit null</b>: the JSON said {@code null}. {@link #isNull()} is true;</li>
 *   <li><b>value</b>: {@link #value()} is set.</li>
 * </ul>
 * An ordinary nullable record component cannot do this (both absent and null arrive as {@code null}). The two deserializers
 * below override both {@code getNullValue} (explicit null) and {@code getAbsentValue} (Jackson otherwise reuses the null value for a
 * missing creator property, which would make absent look like explicit null).
 */
public final class Patch<T> {
    private static final Patch<?> NULL = new Patch<>(null);
    private final T value;

    private Patch(T value) { this.value = value; }

    @SuppressWarnings("unchecked")
    public static <T> Patch<T> ofNull() { return (Patch<T>) NULL; }

    public static <T> Patch<T> of(T value) { return new Patch<>(java.util.Objects.requireNonNull(value)); }

    public boolean isNull() { return value == null; }

    /** The value; null for an explicit null. */
    public T value() { return value; }

    /** Present in the request in any state; a null reference means absent. */
    public static boolean present(Patch<?> p) { return p != null; }

    @Override public String toString() { return value == null ? "Patch.null" : "Patch(" + value + ")"; }

    private static final Pattern CANONICAL_UUID = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    /** A canonical 8-4-4-4-12 UUID or null ({@link UUID#fromString} alone also accepts shortened forms such as {@code 1-1-1-1-1}). */
    public static UUID canonicalUuid(String s) {
        return s != null && CANONICAL_UUID.matcher(s).matches() ? UUID.fromString(s) : null;
    }

    public static final class OfString extends JsonDeserializer<Patch<String>> {
        @Override public Patch<String> deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
            if (p.currentToken() != JsonToken.VALUE_STRING) return (Patch<String>) ctxt.handleUnexpectedToken(String.class, p);
            return Patch.of(p.getText());
        }
        @Override public Patch<String> getNullValue(DeserializationContext ctxt) { return Patch.ofNull(); }
        @Override public Object getAbsentValue(DeserializationContext ctxt) { return null; }
    }

    public static final class OfUuid extends JsonDeserializer<Patch<UUID>> {
        @Override public Patch<UUID> deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
            if (p.currentToken() != JsonToken.VALUE_STRING) return (Patch<UUID>) ctxt.handleUnexpectedToken(UUID.class, p);
            UUID id = canonicalUuid(p.getText());
            if (id == null) throw InvalidFormatException.from(p, "not a canonical UUID", p.getText(), UUID.class);
            return Patch.of(id);
        }
        @Override public Patch<UUID> getNullValue(DeserializationContext ctxt) { return Patch.ofNull(); }
        @Override public Object getAbsentValue(DeserializationContext ctxt) { return null; }
    }
}
