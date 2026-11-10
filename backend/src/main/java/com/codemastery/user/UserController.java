package com.codemastery.user;

import com.codemastery.user.UserDtos.*;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private final ProfileService profiles;

    public UserController(ProfileService profiles) {
        this.profiles = profiles;
    }

    @GetMapping("/me")
    public MeResponse me(Authentication auth) {
        return profiles.me((Long) auth.getPrincipal());
    }

    @PutMapping("/me/profile")
    public ProfileDto updateProfile(Authentication auth, @RequestBody JsonNode body) {
        return profiles.update((Long) auth.getPrincipal(), body);
    }
}
