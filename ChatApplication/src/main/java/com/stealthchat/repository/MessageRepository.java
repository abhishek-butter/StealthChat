package com.stealthchat.repository;

import com.stealthchat.model.MessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface MessageRepository extends JpaRepository<MessageEntity, Long> {
    List<MessageEntity> findAllByOrderByTimestampDesc();
    List<MessageEntity> findByRoomIdOrderByTimestampAsc(String roomId);
    Optional<MessageEntity> findByClientMsgId(String clientMsgId);
}
