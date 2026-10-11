package com.stealthchat.model;

public class ChatMessage {
    private String sender;
    private String content;
    private boolean isStealth;
    private String roomId;
    private String clientMsgId;       // Client-side unique message ID for idempotency/deduplication
    private String type = "CHAT";      // CHAT, ACK_DELIVERY, ACK_READ, HEARTBEAT, PRESENCE
    private String deliveryStatus = "SENT"; // SENT, DELIVERED, READ
    private long timestamp = System.currentTimeMillis();

    public String getSender() { return sender; }
    public void setSender(String sender) { this.sender = sender; }
    
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public boolean getIsStealth() { return isStealth; }
    public void setIsStealth(boolean isStealth) { this.isStealth = isStealth; }
    
    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }

    public String getClientMsgId() { return clientMsgId; }
    public void setClientMsgId(String clientMsgId) { this.clientMsgId = clientMsgId; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getDeliveryStatus() { return deliveryStatus; }
    public void setDeliveryStatus(String deliveryStatus) { this.deliveryStatus = deliveryStatus; }

    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
}
