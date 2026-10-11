package com.stealthchat.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

@Component
public class JwtUtil {

    private static final String SECRET = "stealthchat_super_secure_jwt_secret_key_2026_cn_case_study";
    private static final long EXPIRATION_MS = 24 * 60 * 60 * 1000L; // 24 hours
    private static final ObjectMapper mapper = new ObjectMapper();

    public String generateToken(String username, String role) {
        try {
            long now = System.currentTimeMillis();
            long exp = now + EXPIRATION_MS;

            Map<String, Object> header = new HashMap<>();
            header.put("alg", "HS256");
            header.put("typ", "JWT");

            Map<String, Object> payload = new HashMap<>();
            payload.put("sub", username);
            payload.put("role", role);
            payload.put("iat", now / 1000);
            payload.put("exp", exp / 1000);

            String encodedHeader = base64UrlEncode(mapper.writeValueAsBytes(header));
            String encodedPayload = base64UrlEncode(mapper.writeValueAsBytes(payload));
            String content = encodedHeader + "." + encodedPayload;

            String signature = sign(content, SECRET);
            return content + "." + signature;
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate JWT", e);
        }
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> validateAndExtractClaims(String token) {
        if (token == null || !token.contains(".")) {
            return null;
        }
        if (token.startsWith("Bearer ")) {
            token = token.substring(7).trim();
        }

        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return null;
        }

        String content = parts[0] + "." + parts[1];
        String expectedSignature = sign(content, SECRET);

        // Constant-time signature comparison to prevent timing attacks
        if (!MessageDigest.isEqual(parts[2].getBytes(StandardCharsets.UTF_8), expectedSignature.getBytes(StandardCharsets.UTF_8))) {
            return null;
        }

        try {
            byte[] payloadBytes = Base64.getUrlDecoder().decode(parts[1]);
            Map<String, Object> claims = mapper.readValue(payloadBytes, Map.class);

            // Check expiration
            if (claims.containsKey("exp")) {
                long exp = ((Number) claims.get("exp")).longValue();
                if (System.currentTimeMillis() / 1000 > exp) {
                    return null; // Expired
                }
            }
            return claims;
        } catch (Exception e) {
            return null;
        }
    }

    public String extractUsername(String token) {
        Map<String, Object> claims = validateAndExtractClaims(token);
        return claims != null ? (String) claims.get("sub") : null;
    }

    public boolean isTokenValid(String token) {
        return validateAndExtractClaims(token) != null;
    }

    private static String sign(String data, String key) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKey);
            byte[] hmac = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return base64UrlEncode(hmac);
        } catch (Exception e) {
            throw new RuntimeException("HMAC signing failed", e);
        }
    }

    private static String base64UrlEncode(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
