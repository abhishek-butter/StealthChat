package com.stealthchat.repository;

import com.stealthchat.model.GroupEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface GroupRepository extends JpaRepository<GroupEntity, Long> {
    Optional<GroupEntity> findByInviteCode(String inviteCode);
}
