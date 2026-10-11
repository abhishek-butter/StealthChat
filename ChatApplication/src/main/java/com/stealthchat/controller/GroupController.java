package com.stealthchat.controller;

import com.stealthchat.model.GroupEntity;
import com.stealthchat.model.GroupMembershipEntity;
import com.stealthchat.repository.GroupMembershipRepository;
import com.stealthchat.repository.GroupRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/groups")
public class GroupController {

    @Autowired
    private GroupRepository groupRepository;
    
    @Autowired
    private GroupMembershipRepository membershipRepository;

    @PostMapping("/create")
    public ResponseEntity<?> createGroup(@RequestBody Map<String, String> payload) {
        String username = payload.get("username");
        String groupName = payload.get("name");
        
        GroupEntity group = new GroupEntity();
        group.setName(groupName);
        group = groupRepository.save(group);
        
        GroupMembershipEntity membership = new GroupMembershipEntity();
        membership.setUsername(username);
        membership.setGroupId(group.getId());
        membershipRepository.save(membership);
        
        return ResponseEntity.ok(group);
    }
    
    @PostMapping("/join")
    public ResponseEntity<?> joinGroup(@RequestBody Map<String, String> payload) {
        String username = payload.get("username");
        String inviteCode = payload.get("inviteCode");
        
        Optional<GroupEntity> groupOpt = groupRepository.findByInviteCode(inviteCode);
        if (groupOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Invalid Invite Code"));
        }
        
        GroupEntity group = groupOpt.get();
        if (membershipRepository.existsByUsernameAndGroupId(username, group.getId())) {
            return ResponseEntity.badRequest().body(Map.of("message", "You are already in this group"));
        }
        
        GroupMembershipEntity membership = new GroupMembershipEntity();
        membership.setUsername(username);
        membership.setGroupId(group.getId());
        membershipRepository.save(membership);
        
        return ResponseEntity.ok(group);
    }
    
    @GetMapping("/my-groups")
    public List<GroupEntity> getMyGroups(@RequestParam String username) {
        List<GroupMembershipEntity> memberships = membershipRepository.findByUsername(username);
        List<GroupEntity> myGroups = new ArrayList<>();
        
        for (GroupMembershipEntity mem : memberships) {
            groupRepository.findById(mem.getGroupId()).ifPresent(myGroups::add);
        }
        return myGroups;
    }
}
