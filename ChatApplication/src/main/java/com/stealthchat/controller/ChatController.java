package com.stealthchat.controller;

import com.stealthchat.model.ChatMessage;
import com.stealthchat.model.MessageEntity;
import com.stealthchat.repository.MessageRepository;
import com.stealthchat.service.IdempotencyService;
import com.stealthchat.service.PresenceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.*;

@Controller
public class ChatController {

    @Autowired
    private MessageRepository messageRepository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @Autowired
    private IdempotencyService idempotencyService;

    @Autowired
    private PresenceService presenceService;

    /**
     * Handles outgoing message sending with client-side idempotency and delivery state tracking.
     */
    @MessageMapping("/chat.sendMessage/{roomId}")
    public void sendMessage(@DestinationVariable String roomId, ChatMessage chatMessage) {
        String clientMsgId = chatMessage.getClientMsgId();
        if (clientMsgId == null || clientMsgId.trim().isEmpty()) {
            clientMsgId = UUID.randomUUID().toString();
            chatMessage.setClientMsgId(clientMsgId);
        }

        // Idempotency check: drop duplicate network packets
        if (idempotencyService.checkAndRegister(clientMsgId)) {
            System.out.println("=> [Idempotency] Duplicate packet dropped for clientMsgId: " + clientMsgId);
            // Re-send current status to ensure sender UI syncs
            chatMessage.setDeliveryStatus("SENT");
            messagingTemplate.convertAndSend("/topic/" + roomId, chatMessage);
            return;
        }

        // Save new message to DB with SENT status
        MessageEntity entity = new MessageEntity();
        entity.setClientMsgId(clientMsgId);
        entity.setSender(chatMessage.getSender());
        entity.setContent(chatMessage.getContent());
        entity.setIsStealth(chatMessage.getIsStealth());
        entity.setRoomId(roomId);
        entity.setDeliveryStatus("SENT");
        messageRepository.save(entity);

        chatMessage.setDeliveryStatus("SENT");
        chatMessage.setType("CHAT");
        chatMessage.setTimestamp(System.currentTimeMillis());

        // Broadcast to group members
        messagingTemplate.convertAndSend("/topic/" + roomId, chatMessage);
    }

    /**
     * Recipient sends ACK when message frame is delivered to their client.
     */
    @MessageMapping("/chat.ackDelivery/{roomId}")
    public void ackDelivery(@DestinationVariable String roomId, ChatMessage ack) {
        String clientMsgId = ack.getClientMsgId();
        if (clientMsgId == null) return;

        Optional<MessageEntity> msgOpt = messageRepository.findByClientMsgId(clientMsgId);
        if (msgOpt.isPresent()) {
            MessageEntity entity = msgOpt.get();
            if ("SENT".equals(entity.getDeliveryStatus())) {
                entity.setDeliveryStatus("DELIVERED");
                messageRepository.save(entity);
            }
        }

        ChatMessage receipt = new ChatMessage();
        receipt.setType("ACK_DELIVERY");
        receipt.setClientMsgId(clientMsgId);
        receipt.setRoomId(roomId);
        receipt.setSender(ack.getSender());
        receipt.setDeliveryStatus("DELIVERED");

        messagingTemplate.convertAndSend("/topic/" + roomId, receipt);
    }

    /**
     * Recipient sends ACK when message is displayed / read in active viewport.
     */
    @MessageMapping("/chat.ackRead/{roomId}")
    public void ackRead(@DestinationVariable String roomId, ChatMessage ack) {
        String clientMsgId = ack.getClientMsgId();
        if (clientMsgId == null) return;

        Optional<MessageEntity> msgOpt = messageRepository.findByClientMsgId(clientMsgId);
        if (msgOpt.isPresent()) {
            MessageEntity entity = msgOpt.get();
            entity.setDeliveryStatus("READ");
            messageRepository.save(entity);
        }

        ChatMessage receipt = new ChatMessage();
        receipt.setType("ACK_READ");
        receipt.setClientMsgId(clientMsgId);
        receipt.setRoomId(roomId);
        receipt.setSender(ack.getSender());
        receipt.setDeliveryStatus("READ");

        messagingTemplate.convertAndSend("/topic/" + roomId, receipt);
    }

    /**
     * Heartbeat ping endpoint for user presence TTL cache.
     */
    @MessageMapping("/chat.heartbeat")
    public void handleHeartbeat(ChatMessage heartbeat) {
        if (heartbeat.getSender() != null) {
            String status = heartbeat.getContent() != null ? heartbeat.getContent() : "ONLINE";
            presenceService.updatePresence(heartbeat.getSender(), status);
        }
    }

    /**
     * REST endpoint to retrieve persistent room message history.
     */
    @GetMapping("/api/chat/history/{roomId}")
    @ResponseBody
    public ResponseEntity<List<MessageEntity>> getRoomHistory(@PathVariable String roomId) {
        List<MessageEntity> history = messageRepository.findByRoomIdOrderByTimestampAsc(roomId);
        return ResponseEntity.ok(history);
    }

    /**
     * REST endpoint to retrieve active user presence states.
     */
    @GetMapping("/api/chat/presence")
    @ResponseBody
    public ResponseEntity<Map<String, String>> getActivePresences() {
        return ResponseEntity.ok(presenceService.getAllActivePresences());
    }
}
