package com.stealthchat.repository;

import com.stealthchat.model.GroupMembershipEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface GroupMembershipRepository extends JpaRepository<GroupMembershipEntity, Long> {
    List<GroupMembershipEntity> findByUsername(String username);
    boolean existsByUsernameAndGroupId(String username, Long groupId);
}
