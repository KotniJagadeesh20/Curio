package com.codemastery.user;

import com.codemastery.auth.AuthDtos.UserDto;
import com.codemastery.user.UserDtos.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProfileService {
    private static final Set<String> EDITABLE =
            Set.of("displayName", "bio", "avatarUrl", "bannerUrl", "socialLinks", "visibility");
    private static final Pattern LINK_LABEL = Pattern.compile("^[a-z0-9_]{1,30}$");
    private static final int MAX_LINKS = 10;
    private static final TypeReference<Map<String, String>> LINKS = new TypeReference<>() {};

    private final UserRepository users;
    private final UserProfileRepository profiles;
    private final ObjectMapper json;

    public ProfileService(UserRepository users, UserProfileRepository profiles, ObjectMapper json) {
        this.users = users;
        this.profiles = profiles;
        this.json = json;
    }

    @Transactional(readOnly = true)
    public MeResponse me(Long userId) {
        User u = users.findById(userId).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        return new MeResponse(UserDto.of(u), toDto(profileOf(userId)));
    }

    @Transactional
    public ProfileDto update(Long userId, JsonNode body) {
        if (body == null || !body.isObject()) bad("Request body must be a JSON object");
        // Unknown or protected fields are an error, not silently dropped: a client that sends
        // "username" should find out it didn't work.
        body.fieldNames().forEachRemaining(f -> {
            if (f.equals("username")) bad("Usernames cannot be changed");
            if (!EDITABLE.contains(f)) bad("Field '" + f + "' cannot be set here");
        });
        UpdateProfileRequest r;
        try {
            r = json.treeToValue(body, UpdateProfileRequest.class);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid profile fields");
        }

        String displayName = r.displayName() == null ? "" : r.displayName().trim();
        if (displayName.isEmpty() || displayName.length() > 120) bad("displayName must be 1-120 characters");
        String bio = r.bio() == null ? "" : r.bio().trim();
        if (bio.length() > 500) bad("bio must be at most 500 characters");

        UserProfile p = profileOf(userId);
        p.setDisplayName(displayName);
        p.setBio(bio);
        p.setAvatarUrl(httpsUrl("avatarUrl", r.avatarUrl()));
        p.setBannerUrl(httpsUrl("bannerUrl", r.bannerUrl()));
        p.setSocialLinks(writeLinks(validLinks(r.socialLinks())));
        if (r.visibility() != null) {
            try {
                p.setVisibility(ProfileVisibility.valueOf(r.visibility().toUpperCase()));
            } catch (IllegalArgumentException e) {
                bad("visibility must be PUBLIC or PRIVATE");
            }
        }
        p.setUpdatedAt(Instant.now());
        return toDto(profiles.save(p));
    }

    /** Public view. Unknown, suspended and PRIVATE profiles are all the same 404. */
    @Transactional(readOnly = true)
    public PublicCreatorDto publicCreator(String rawUsername) {
        User u = users.findByUsername(UsernamePolicy.normalize(rawUsername)).orElse(null);
        UserProfile p = u == null ? null : profiles.findById(u.getId()).orElse(null);
        if (u == null || p == null || u.getStatus() != UserStatus.ACTIVE
                || p.getVisibility() != ProfileVisibility.PUBLIC) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Creator not found");
        }
        return new PublicCreatorDto(u.getUsername(), p.getDisplayName(), p.getBio(), p.getAvatarUrl(),
                p.getBannerUrl(), readLinks(p.getSocialLinks()), u.getCreatedAt());
    }

    private UserProfile profileOf(Long userId) {
        return profiles.findById(userId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Profile missing"));
    }

    private ProfileDto toDto(UserProfile p) {
        return new ProfileDto(p.getDisplayName(), p.getBio(), p.getAvatarUrl(), p.getBannerUrl(),
                readLinks(p.getSocialLinks()), p.getVisibility().name());
    }

    private Map<String, String> readLinks(String raw) {
        try {
            return json.readValue(raw, LINKS);
        } catch (JsonProcessingException e) {
            return Map.of();
        }
    }

    private String writeLinks(Map<String, String> links) {
        try {
            return json.writeValueAsString(links);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private Map<String, String> validLinks(Map<String, String> in) {
        Map<String, String> out = new LinkedHashMap<>();
        if (in == null) return out;
        if (in.size() > MAX_LINKS) bad("At most " + MAX_LINKS + " social links");
        in.forEach((label, url) -> {
            if (!LINK_LABEL.matcher(label).matches()) {
                bad("Social link names must be 1-30 lowercase letters, digits or underscores");
            }
            String clean = httpsUrl("socialLinks." + label, url);
            if (clean != null) out.put(label, clean);
        });
        return out;
    }

    private static String httpsUrl(String field, String value) {
        return com.codemastery.config.UrlPolicy.httpsOrNull(field, value);
    }

    private static void bad(String msg) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, msg);
    }
}
