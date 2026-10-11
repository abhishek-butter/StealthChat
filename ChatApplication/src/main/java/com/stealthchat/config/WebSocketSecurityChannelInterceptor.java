package com.stealthchat.config;

import com.stealthchat.repository.GroupMembershipRepository;
import com.stealthchat.security.JwtUtil;
import com.stealthchat.security.StompPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.List;
import java.util.Map;

@Component
public class WebSocketSecurityChannelInterceptor implements ChannelInterceptor {

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private GroupMembershipRepository membershipRepository;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }

        StompCommand command = accessor.getCommand();

        if (StompCommand.CONNECT.equals(command)) {
            handleConnect(accessor);
        } else if (StompCommand.SUBSCRIBE.equals(command)) {
            if (!handleSubscribe(accessor)) {
                // Return null to drop unauthorized subscription
                return null;
            }
        }

        return message;
    }

    private void handleConnect(StompHeaderAccessor accessor) {
        String token = null;

        List<String> authHeaders = accessor.getNativeHeader("Authorization");
        if (authHeaders != null && !authHeaders.isEmpty()) {
            token = authHeaders.get(0);
        } else {
            List<String> tokenHeaders = accessor.getNativeHeader("token");
            if (tokenHeaders != null && !tokenHeaders.isEmpty()) {
                token = tokenHeaders.get(0);
            }
        }

        if (token != null) {
            Map<String, Object> claims = jwtUtil.validateAndExtractClaims(token);
            if (claims != null && claims.containsKey("sub")) {
                String username = (String) claims.get("sub");
                accessor.setUser(new StompPrincipal(username));
                System.out.println("=> [STOMP Security] User authenticated via JWT: " + username);
            } else {
                System.out.println("=> [STOMP Security] Warning: Invalid or expired JWT in CONNECT frame.");
            }
        }
    }

    private boolean handleSubscribe(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        if (destination == null) {
            return true;
        }

        // Public topics: presence, system announcements
        if (destination.equals("/topic/presence") || destination.equals("/topic/system")) {
            return true;
        }

        // Room subscription format: /topic/{roomId}
        if (destination.startsWith("/topic/")) {
            String roomIdPart = destination.substring("/topic/".length());
            if (roomIdPart.contains(".")) {
                roomIdPart = roomIdPart.substring(0, roomIdPart.indexOf("."));
            }

            try {
                Long groupId = Long.parseLong(roomIdPart);
                Principal user = accessor.getUser();
                if (user != null) {
                    boolean isMember = membershipRepository.existsByUsernameAndGroupId(user.getName(), groupId);
                    if (!isMember) {
                        System.out.println("=> [STOMP Security] Denied subscription: User " 
                            + user.getName() + " is NOT a member of Group " + groupId);
                        return false;
                    }
                }
            } catch (NumberFormatException ignored) {
                // Named topic (e.g. GLOBAL_1) - allow
            }
        }

        return true;
    }
}
