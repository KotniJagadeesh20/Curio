package com.codemastery.user;

import com.codemastery.auth.AuthDtos.UserDto;
import java.time.Instant;
import java.util.Map;

public class UserDtos {
    public record ProfileDto(String displayName, String bio, String avatarUrl, String bannerUrl,
                             Map<String, String> socialLinks, String visibility) {}

    public record MeResponse(UserDto user, ProfileDto profile) {}

    /** Everything a stranger may see. Never contains the email. */
    public record PublicCreatorDto(String username, String displayName, String bio, String avatarUrl,
                                   String bannerUrl, Map<String, String> socialLinks, Instant joinedAt) {}

    /** Body of PUT /api/users/me/profile. Full replace, except visibility (null = keep). */
    public record UpdateProfileRequest(String displayName, String bio, String avatarUrl, String bannerUrl,
                                       Map<String, String> socialLinks, String visibility) {}
}
