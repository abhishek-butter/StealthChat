package com.stealthchat.controller;

import com.stealthchat.model.UserEntity;
import com.stealthchat.repository.UserRepository;
import com.stealthchat.security.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Optional;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    
    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtUtil jwtUtil;
    
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> credentials) {
        String username = credentials.get("username");
        String password = credentials.get("password");
        
        Optional<UserEntity> userOpt = userRepository.findByUsername(username);
        if (userOpt.isPresent() && userOpt.get().getPassword().equals(password)) {
            String token = jwtUtil.generateToken(userOpt.get().getUsername(), userOpt.get().getRole());
            return ResponseEntity.ok(Map.of(
                "success", true,
                "username", userOpt.get().getUsername(),
                "role", userOpt.get().getRole(),
                "token", token
            ));
        }
        return ResponseEntity.status(401).body(Map.of("success", false, "message", "Invalid credentials"));
    }
    
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> credentials) {
        String username = credentials.get("username");
        String password = credentials.get("password");
        
        if (userRepository.findByUsername(username).isPresent()) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Username taken"));
        }
        
        UserEntity newUser = new UserEntity();
        newUser.setUsername(username);
        newUser.setPassword(password); // In production, hash with BCrypt
        newUser.setRole("USER");
        userRepository.save(newUser);

        String token = jwtUtil.generateToken(username, "USER");
        return ResponseEntity.ok(Map.of(
            "success", true, 
            "username", username,
            "role", "USER",
            "token", token,
            "message", "Registered successfully"
        ));
    }
}
