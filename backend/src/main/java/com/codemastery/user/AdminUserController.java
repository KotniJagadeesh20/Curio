package com.codemastery.user;

import com.codemastery.auth.AuthDtos.UserDto;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {
    private final UserRepository users;

    public AdminUserController(UserRepository users) {
        this.users = users;
    }

    @GetMapping
    public List<UserDto> list() {
        return users.findAll().stream().map(UserDto::of).toList();
    }

    @PatchMapping("/{id}/role")
    public UserDto setRole(@PathVariable Long id, @RequestBody Map<String, String> body, Authentication auth) {
        if (id.equals(auth.getPrincipal())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot change your own role");
        }
        Role role;
        try {
            role = Role.valueOf(String.valueOf(body.get("role")).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Role must be USER or ADMIN");
        }
        User u = users.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        UserGuard.requireNotProtected(u, "have its role changed");
        u.setRole(role);
        return UserDto.of(users.save(u));
    }
}
