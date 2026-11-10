package com.codemastery.auth;

import com.codemastery.user.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class AuthDtos {
    public record SignupRequest(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Email String email,
            @NotBlank @Size(min = 8, max = 72) String password,
            @Size(max = 30) String username) {}

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}

    public record UserDto(Long id, String name, String email, String role, java.time.Instant createdAt,
                          String username) {
        public static UserDto of(User u) {
            return new UserDto(u.getId(), u.getName(), u.getEmail(), u.getRole().name(), u.getCreatedAt(),
                    u.getUsername());
        }
    }

    public record AuthResponse(String token, UserDto user) {}
}
