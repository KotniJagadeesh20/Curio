package com.codemastery.user;

import com.codemastery.user.UserDtos.PublicCreatorDto;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/public/creators")
public class PublicCreatorController {
    private final ProfileService profiles;

    public PublicCreatorController(ProfileService profiles) {
        this.profiles = profiles;
    }

    @GetMapping("/{username}")
    public PublicCreatorDto get(@PathVariable String username) {
        return profiles.publicCreator(username);
    }
}
