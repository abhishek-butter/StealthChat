package com.stealthchat.controller;

import com.stealthchat.model.MessageEntity;
import com.stealthchat.repository.MessageRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    
    @Autowired
    private MessageRepository messageRepository;
    
    // In a real app, you would secure this endpoint with Spring Security roles
    @GetMapping("/logs")
    public List<MessageEntity> getAllLogs() {
        return messageRepository.findAllByOrderByTimestampDesc();
    }
}
