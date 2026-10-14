package com.stealthchat.config;

import com.stealthchat.model.GroupEntity;
import com.stealthchat.model.GroupMembershipEntity;
import com.stealthchat.model.MessageEntity;
import com.stealthchat.model.UserEntity;
import com.stealthchat.repository.GroupMembershipRepository;
import com.stealthchat.repository.GroupRepository;
import com.stealthchat.repository.MessageRepository;
import com.stealthchat.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.UUID;

@Configuration
public class DataSeeder {
    
    @Bean
    CommandLineRunner initDatabase(
            UserRepository userRepository, 
            GroupRepository groupRepository,
            GroupMembershipRepository membershipRepository,
            MessageRepository messageRepository) {
        return args -> {
            // Seed Admin
            if (userRepository.findByUsername("admin").isEmpty()) {
                UserEntity admin = new UserEntity();
                admin.setUsername("admin");
                admin.setPassword("admin123");
                admin.setRole("ADMIN");
                userRepository.save(admin);
            }

            // Seed Core Team Users
            String[] teamUsers = {"Prof. Thamizharasan", "Abhishek V. S.", "Aujas Shahi", "Varun Krishna"};
            for (String username : teamUsers) {
                if (userRepository.findByUsername(username).isEmpty()) {
                    UserEntity user = new UserEntity();
                    user.setUsername(username);
                    user.setPassword("vit2026");
                    user.setRole("USER");
                    userRepository.save(user);
                }
            }

            // Seed Groups if empty
            if (groupRepository.count() == 0) {
                GroupEntity g1 = new GroupEntity();
                g1.setName("VIT CyberSec Research Group");
                g1.setInviteCode("VIT_CYBER");
                g1 = groupRepository.save(g1);

                GroupEntity g2 = new GroupEntity();
                g2.setName("Steganography Core Labs");
                g2.setInviteCode("STEGO_LAB");
                g2 = groupRepository.save(g2);

                GroupEntity g3 = new GroupEntity();
                g3.setName("Adversarial Network Audits");
                g3.setInviteCode("DPI_AUDIT");
                g3 = groupRepository.save(g3);

                // Add memberships for Group 1
                for (String username : teamUsers) {
                    GroupMembershipEntity mem = new GroupMembershipEntity();
                    mem.setUsername(username);
                    mem.setGroupId(g1.getId());
                    membershipRepository.save(mem);
                }

                // Seed Initial Messages in Group 1
                String roomId = String.valueOf(g1.getId());

                MessageEntity m1 = new MessageEntity();
                m1.setClientMsgId(UUID.randomUUID().toString());
                m1.setSender("Prof. Thamizharasan");
                m1.setContent("Welcome team to the StealthChat live demonstration node. Ensure all LSB steganographic carriers and WebSocket state machines are operational for today's review.");
                m1.setRoomId(roomId);
                m1.setIsStealth(false);
                m1.setDeliveryStatus("READ");
                messageRepository.save(m1);

                MessageEntity m2 = new MessageEntity();
                m2.setClientMsgId(UUID.randomUUID().toString());
                m2.setSender("Abhishek V. S.");
                m2.setContent("Confirmed, Professor. Procedural canvas LSB modulation maintains stream entropy at 5.42 bits/byte, completely bypassing Deep Packet Inspection heuristics.");
                m2.setRoomId(roomId);
                m2.setIsStealth(true);
                m2.setDeliveryStatus("READ");
                messageRepository.save(m2);

                MessageEntity m3 = new MessageEntity();
                m3.setClientMsgId(UUID.randomUUID().toString());
                m3.setSender("Varun Krishna");
                m3.setContent("WebRTC audio/video call signaling, screen sharing, and encrypted voice note channels are active and passing latency benchmarks.");
                m3.setRoomId(roomId);
                m3.setIsStealth(false);
                m3.setDeliveryStatus("READ");
                messageRepository.save(m3);

                MessageEntity m4 = new MessageEntity();
                m4.setClientMsgId(UUID.randomUUID().toString());
                m4.setSender("Aujas Shahi");
                m4.setContent("IndexedDB offline cache and 4-stage delivery state synchronization (Pending -> Sent -> Delivered -> Read) validated across desktop and mobile.");
                m4.setRoomId(roomId);
                m4.setIsStealth(false);
                m4.setDeliveryStatus("READ");
                messageRepository.save(m4);

                System.out.println("=> [DataSeeder] Initialized VIT CyberSec research groups and demonstration history.");
            }
        };
    }
}
