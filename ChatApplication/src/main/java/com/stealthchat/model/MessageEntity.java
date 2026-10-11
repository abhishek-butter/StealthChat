package com.stealthchat.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "messages", indexes = {
    @Index(name = "idx_client_msg_id", columnList = "clientMsgId"),
    @Index(name = "idx_room_id", columnList = "roomId")
})
public class MessageEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = false)
    private String clientMsgId;
    
    private String sender;
    
    @Column(columnDefinition = "TEXT")
    private String content; 
    
    private boolean isStealth;
    
    private String roomId;

    private String deliveryStatus = "SENT"; // SENT, DELIVERED, READ
    
    private LocalDateTime timestamp = LocalDateTime.now();

    public Long getId() { return id; }
    public String getClientMsgId() { return clientMsgId; }
    public void setClientMsgId(String clientMsgId) { this.clientMsgId = clientMsgId; }
    public String getSender() { return sender; }
    public void setSender(String sender) { this.sender = sender; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public boolean getIsStealth() { return isStealth; }
    public void setIsStealth(boolean isStealth) { this.isStealth = isStealth; }
    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }
    public String getDeliveryStatus() { return deliveryStatus; }
    public void setDeliveryStatus(String deliveryStatus) { this.deliveryStatus = deliveryStatus; }
    public LocalDateTime getTimestamp() { return timestamp; }
}
