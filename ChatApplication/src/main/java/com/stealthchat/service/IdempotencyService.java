package com.stealthchat.service;

import com.stealthchat.repository.MessageRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class IdempotencyService {

    @Autowired
    private MessageRepository messageRepository;

    // Cache recently seen clientMsgIds with their epoch timestamp (5-minute TTL window)
    private final Map<String, Long> processedMessageCache = new ConcurrentHashMap<>();
    private static final long CACHE_TTL_MS = 5 * 60 * 1000L; // 5 minutes

    /**
     * Checks if a client message ID has already been received and processed.
     * If not, records it atomically.
     * @return true if duplicate, false if new
     */
    public boolean checkAndRegister(String clientMsgId) {
        if (clientMsgId == null || clientMsgId.trim().isEmpty()) {
            return false;
        }

        cleanupExpiredEntries();

        long now = System.currentTimeMillis();
        Long existing = processedMessageCache.putIfAbsent(clientMsgId, now);
        if (existing != null) {
            return true; // Already in memory cache
        }

        // Secondary check against persistent database for durability across service restarts
        if (messageRepository.findByClientMsgId(clientMsgId).isPresent()) {
            return true;
        }

        return false;
    }

    private void cleanupExpiredEntries() {
        long threshold = System.currentTimeMillis() - CACHE_TTL_MS;
        processedMessageCache.entrySet().removeIf(entry -> entry.getValue() < threshold);
    }
}
