package com.stealthchat.config;

import com.stealthchat.model.UserEntity;
import com.stealthchat.model.GroupEntity;
import com.stealthchat.repository.UserRepository;
import com.stealthchat.repository.GroupRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class DataSeeder {
    
    @Bean
    CommandLineRunner initDatabase(UserRepository userRepository, GroupRepository groupRepository) {
        return args -> {
            if (userRepository.findByUsername("admin").isEmpty()) {
                UserEntity admin = new UserEntity();
                admin.setUsername("admin");
                admin.setPassword("admin123");
                admin.setRole("ADMIN");
                userRepository.save(admin);
                System.out.println("=> Default Admin created: admin / admin123");
            }
            if (groupRepository.count() == 0) {
                GroupEntity global = new GroupEntity();
                global.setName("Global Channel");
                global.setInviteCode("GLOBAL_1");
                groupRepository.save(global);
            }
        };
    }
}
