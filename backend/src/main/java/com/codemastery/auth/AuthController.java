package com.codemastery.auth;

import com.codemastery.auth.AuthDtos.*;
import com.codemastery.security.JwtService;
import com.codemastery.user.User;
import com.codemastery.user.UserRepository;
import com.codemastery.user.UserService;
import com.codemastery.user.UserStatus;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final UserService userService;

    public AuthController(UserRepository users, PasswordEncoder encoder, JwtService jwt, UserService userService) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
        this.userService = userService;
    }

    @PostMapping("/signup")
    public ResponseEntity<AuthResponse> signup(@Valid @RequestBody SignupRequest req) {
        if (users.existsByEmailIgnoreCase(req.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered");
        }
        User u = userService.register(req.name().trim(), req.email().trim().toLowerCase(),
                req.password(), req.username());
        return ResponseEntity.status(HttpStatus.CREATED).body(new AuthResponse(jwt.issue(u), UserDto.of(u)));
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest req) {
        User u = users.findByEmailIgnoreCase(req.email().trim())
                .filter(found -> encoder.matches(req.password(), found.getPasswordHash()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password"));
        // Checked after the password so account state isn't revealed to someone who doesn't know it.
        if (u.getStatus() == UserStatus.SUSPENDED) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account suspended");
        }
        return new AuthResponse(jwt.issue(u), UserDto.of(u));
    }

    @GetMapping("/me")
    public UserDto me(Authentication auth) {
        Long id = (Long) auth.getPrincipal();
        return users.findById(id).map(UserDto::of)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }
}
