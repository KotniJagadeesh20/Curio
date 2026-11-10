package com.codemastery.config;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.deser.DeserializationProblemHandler;
import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException;
import java.io.IOException;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Spring Boot's ObjectMapper silently ignores unknown JSON fields (and the rest of the app relies on that), which
 * would let a request field like {@code ownerId} or {@code moderationStatus} disappear without a word. The creator
 * request records ({@code CollectionDtos}) are therefore strict: an unknown field is a 400 ("Field 'x' is not
 * accepted here", see {@code ApiExceptionHandler}). Every other DTO keeps the lenient default.
 */
@Configuration
public class StrictCreatorJson {
    private static final String STRICT_PREFIX = "com.codemastery.collection.CollectionDtos$";

    @Bean
    Jackson2ObjectMapperBuilderCustomizer strictCreatorRequests() {
        return builder -> builder.postConfigurer(mapper -> mapper.addHandler(new DeserializationProblemHandler() {
            @Override
            public boolean handleUnknownProperty(DeserializationContext ctxt, JsonParser p, JsonDeserializer<?> deserializer,
                                                 Object beanOrClass, String propertyName) throws IOException {
                Class<?> type = beanOrClass instanceof Class<?> c ? c : beanOrClass.getClass();
                if (type.getName().startsWith(STRICT_PREFIX)) {
                    throw UnrecognizedPropertyException.from(p, beanOrClass, propertyName,
                            deserializer == null ? null : deserializer.getKnownPropertyNames());
                }
                return false;
            }
        }));
    }
}
