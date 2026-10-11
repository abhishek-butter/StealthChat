package com.stealthchat.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class PresenceService {

    public static class PresenceRecord {
        private String username;
        private String status; // ONLINE, AWAY, OFFLINE
        private long lastHeartbeat;

        public PresenceRecord(String username, String status, long lastHeartbeat) {
            this.username = username;
            this.status = status;
            this.lastHeartbeat = lastHeartbeat;
        }

        public String getUsername() { return username; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public long getLastHeartbeat() { return lastHeartbeat; }
        public void setLastHeartbeat(long lastHeartbeat) { this.lastHeartbeat = lastHeartbeat; }
    }

    private final Map<String, PresenceRecord> userPresenceMap = new ConcurrentHashMap<>();
    private static final long HEARTBEAT_TTL_MS = 30_000L; // 30 seconds TTL threshold

    @Autowired
    @Lazy
    private SimpMessagingTemplate messagingTemplate;

    public void updatePresence(String username, String status) {
        if (username == null || username.trim().isEmpty()) return;
        
        long now = System.currentTimeMillis();
        PresenceRecord record = userPresenceMap.compute(username, (k, existing) -> {
            if (existing == null) {
                return new PresenceRecord(username, status != null ? status : "ONLINE", now);
            }
            existing.setStatus(status != null ? status : "ONLINE");
            existing.setLastHeartbeat(now);
            return existing;
        });

        broadcastPresenceChange(username, record.getStatus());
    }

    public void markOffline(String username) {
        if (username == null) return;
        PresenceRecord record = userPresenceMap.get(username);
        if (record != null && !"OFFLINE".equals(record.getStatus())) {
            record.setStatus("OFFLINE");
            record.setLastHeartbeat(System.currentTimeMillis());
            broadcastPresenceChange(username, "OFFLINE");
        }
    }

    public Map<String, String> getAllActivePresences() {
        Map<String, String> result = new HashMap<>();
        long threshold = System.currentTimeMillis() - HEARTBEAT_TTL_MS;
        userPresenceMap.forEach((user, record) -> {
            if (record.getLastHeartbeat() >= threshold && !"OFFLINE".equals(record.getStatus())) {
                result.put(user, record.getStatus());
            } else {
                result.put(user, "OFFLINE");
            }
        });
        return result;
    }

    @Scheduled(fixedRate = 5000)
    public void sweepExpiredPresences() {
        long threshold = System.currentTimeMillis() - HEARTBEAT_TTL_MS;
        userPresenceMap.forEach((username, record) -> {
            if (!"OFFLINE".equals(record.getStatus()) && record.getLastHeartbeat() < threshold) {
                record.setStatus("OFFLINE");
                broadcastPresenceChange(username, "OFFLINE");
            }
        });
    }

    private void broadcastPresenceChange(String username, String status) {
        Map<String, Object> payload = Map.of(
            "type", "PRESENCE",
            "username", username,
            "status", status,
            "timestamp", System.currentTimeMillis()
        );
        try {
            messagingTemplate.convertAndSend("/topic/presence", payload);
        } catch (Exception ignored) {
            // Broker may not be initialized on very early events
        }
    }
}
