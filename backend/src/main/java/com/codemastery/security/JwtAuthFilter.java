package com.codemastery.security;

import com.codemastery.user.UserRepository;
import com.codemastery.user.UserStatus;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {
    private final JwtService jwt;
    private final UserRepository users;

    public JwtAuthFilter(JwtService jwt, UserRepository users) {
        this.jwt = jwt;
        this.users = users;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String header = req.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            Claims claims = jwt.parse(header.substring(7));
            if (claims != null) {
                // The role claim in the token can be stale (e.g. an admin was demoted), so the
                // authorities come from the database. A deleted user's token stops working too.
                Long id = Long.valueOf(claims.getSubject());
                // A suspended user's token stops authenticating too, so every write endpoint rejects them.
                users.findById(id).filter(u -> u.getStatus() == UserStatus.ACTIVE).ifPresent(u -> SecurityContextHolder.getContext().setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                                id, null, List.of(new SimpleGrantedAuthority("ROLE_" + u.getRole().name())))));
            }
        }
        chain.doFilter(req, res);
    }
}
