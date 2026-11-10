package com.codemastery.collection;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.codemastery.collection.CollectionDtos.CollectionCreate;
import com.codemastery.collection.CollectionDtos.CollectionUpdate;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * The 12b spike: absent / explicit null / value are three distinct states for BOTH cover fields, through the application's real
 * (strict creator) ObjectMapper, for both request records. If this fails the documented fallback is the raw JSON node.
 */
@SpringBootTest
@ActiveProfiles("h2")
class PatchSpikeTest {
    @Autowired ObjectMapper json;
    static final String ID = "123e4567-e89b-12d3-a456-426614174000";

    private CollectionUpdate upd(String body) throws Exception { return json.readValue(body, CollectionUpdate.class); }

    @Test void bothAbsent() throws Exception {
        CollectionUpdate u = upd("{\"title\":\"T\"}");
        assertThat(u.coverUrl()).isNull();
        assertThat(u.coverAssetId()).isNull();
    }

    @Test void coverAssetIdStates() throws Exception {
        assertThat(upd("{\"title\":\"T\",\"coverAssetId\":null}").coverAssetId()).isNotNull().matches(Patch::isNull);
        Patch<UUID> v = upd("{\"title\":\"T\",\"coverAssetId\":\"" + ID + "\"}").coverAssetId();
        assertThat(v).isNotNull();
        assertThat(v.isNull()).isFalse();
        assertThat(v.value()).isEqualTo(UUID.fromString(ID));
        assertThat(upd("{\"title\":\"T\",\"coverAssetId\":\"" + ID + "\"}").coverUrl()).isNull();   // the other field stays absent
    }

    @Test void coverUrlStates() throws Exception {
        assertThat(upd("{\"title\":\"T\",\"coverUrl\":null}").coverUrl()).isNotNull().matches(Patch::isNull);
        assertThat(upd("{\"title\":\"T\",\"coverUrl\":\"\"}").coverUrl().value()).isEmpty();
        assertThat(upd("{\"title\":\"T\",\"coverUrl\":\"https://x.example/a.png\"}").coverUrl().value()).isEqualTo("https://x.example/a.png");
        assertThat(upd("{\"title\":\"T\",\"coverUrl\":null}").coverAssetId()).isNull();            // the other field stays absent
    }

    @Test void bothPresentInEveryCombinationIsVisibleToTheService() throws Exception {
        CollectionUpdate u = upd("{\"title\":\"T\",\"coverUrl\":null,\"coverAssetId\":null}");
        assertThat(u.coverUrl()).isNotNull();
        assertThat(u.coverAssetId()).isNotNull();
    }

    @Test void createRecordBehavesTheSame() throws Exception {
        CollectionCreate c = json.readValue("{\"title\":\"T\",\"coverUrl\":null}", CollectionCreate.class);
        assertThat(c.coverUrl()).isNotNull().matches(Patch::isNull);
        assertThat(c.coverAssetId()).isNull();
        CollectionCreate d = json.readValue("{\"title\":\"T\",\"coverAssetId\":null}", CollectionCreate.class);
        assertThat(d.coverUrl()).isNull();
        assertThat(d.coverAssetId()).isNotNull().matches(Patch::isNull);
    }

    @Test void wrongJsonTypesAndMalformedUuidsAreRejected() {
        for (String bad : new String[] {"\"coverAssetId\":\"\"", "\"coverAssetId\":\"nope\"", "\"coverAssetId\":\"1-1-1-1-1\"", "\"coverAssetId\":5",
                "\"coverAssetId\":true", "\"coverAssetId\":{}", "\"coverUrl\":5", "\"coverUrl\":[]", "\"coverUrl\":true"}) {
            assertThatThrownBy(() -> upd("{\"title\":\"T\"," + bad + "}")).as(bad).isInstanceOf(com.fasterxml.jackson.core.JsonProcessingException.class);
        }
    }

    @Test void unknownFieldsAreStillRejectedByTheStrictMapper() {
        assertThatThrownBy(() -> upd("{\"title\":\"T\",\"ownerId\":1}")).isInstanceOf(com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException.class);
    }
}
