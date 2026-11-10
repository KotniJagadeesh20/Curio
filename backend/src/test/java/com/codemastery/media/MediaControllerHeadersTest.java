package com.codemastery.media;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.codemastery.security.CurrentUser;
import com.codemastery.user.User;
import java.io.ByteArrayInputStream;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** The controller's own response headers, with no Spring Security in front: they must not depend on the global header configuration. */
class MediaControllerHeadersTest {
    @Test
    void theOwnerRouteSetsItsSecurityHeadersItself() throws Exception {
        CurrentUser current = mock(CurrentUser.class);
        MediaService service = mock(MediaService.class);
        User u = new User();
        u.setId(1L);
        when(current.require()).thenReturn(u);
        when(service.openOwned(any(), any(), anyBoolean())).thenReturn(new MediaService.Served(new ByteArrayInputStream(new byte[] {1, 2, 3}), "image/png", 3));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new MediaController(current, service)).build();

        var res = mvc.perform(get("/api/media/" + UUID.randomUUID() + "/content")).andExpect(status().isOk()).andReturn().getResponse();
        assertEquals("image/png", res.getContentType());
        assertEquals("nosniff", res.getHeader("X-Content-Type-Options"));
        assertEquals("default-src 'none'; sandbox", res.getHeader("Content-Security-Policy"));
        String cc = res.getHeader("Cache-Control");
        assertTrue(cc.contains("no-store") && cc.contains("private"), cc);
        assertEquals(3, res.getContentLength());
        assertNull(res.getHeader("ETag"));
        assertNull(res.getHeader("Content-Disposition"));
    }
}
