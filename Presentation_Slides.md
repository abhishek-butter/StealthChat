---
marp: true
theme: default
class: lead
paginate: true
backgroundColor: #0f172a
style: |
  section {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    color: #e2e8f0;
    padding: 40px;
    background-color: #0f172a;
  }
  h1 {
    color: #38bdf8;
    font-size: 2.2em;
    margin-bottom: 0.2em;
  }
  h2 {
    color: #818cf8;
    border-bottom: 2px solid #334155;
    padding-bottom: 8px;
    font-size: 1.5em;
  }
  h3 {
    color: #34d399;
    font-size: 1.2em;
  }
  strong {
    color: #f59e0b;
  }
  li {
    margin-bottom: 10px;
    line-height: 1.5;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85em;
    margin-top: 15px;
  }
  th {
    background-color: #1e293b;
    color: #38bdf8;
    padding: 8px;
    border: 1px solid #334155;
  }
  td {
    padding: 8px;
    border: 1px solid #334155;
    background-color: #0f172a;
  }
---

# Real-Time Multi-Client Communication
## From Raw TCP Sockets to Enterprise Distributed WebSockets

**Course:** Computer Networking (CN) Case Study  
**Topic:** Transport Layer Protocols, Distributed Pub/Sub & Modern Web Systems  
**Implementation:** Java Sockets & Spring Boot Enterprise StealthChat  

---

## 1. Executive Summary & Evolution

- **The Networking Challenge:** Delivering sub-second, bidirectional data between concurrent clients without dropping packets or exhausting server resources.
- **Phase 1 (Transport Foundation):** Raw TCP socket programming in Java (`ServerSocket`, multi-threading, blocking I/O, Swing GUI).
- **Phase 2 (Enterprise Distributed Evolution):** Modern browser-based chat architecture utilizing:
  - **Full-Duplex WebSockets** + **Pub/Sub Broker Fan-Out**
  - **Stateless REST APIs** & **JWT Channel Authorization**
  - **Message Delivery Receipts** (`SENT` ✓, `DELIVERED` ✓✓, `READ` ✓✓)
  - **Heartbeat Presence TTL**, **IndexedDB Offline Cache**, and **Idempotency**

---

## 2. Core Networking: TCP vs UDP

### Transport Layer Protocol Choice
- **TCP (Transmission Control Protocol):** Connection-oriented with 3-way handshake (`SYN` $\rightarrow$ `SYN-ACK` $\rightarrow$ `ACK`), error detection, retransmissions, and in-order delivery.
- **UDP (User Datagram Protocol):** Connectionless, fire-and-forget, zero delivery guarantees.
- **Chat Application Requirements:**
  - Messaging requires **strict reliability** and **packet ordering**.
  - Losing or re-ordering chat fragments corrupts conversation semantics.
  - Therefore, **TCP** is the required transport layer foundation.

---

## 3. Sockets, Ports & Concurrency

### Sockets as Endpoints
- A **socket** is an endpoint of a two-way network communication link bound to an IP address and specific port number.
- Identifies the application process at the transport layer.

### Concurrency Architecture
- **Single-Threaded Bottleneck:** Blocks on `accept()` or slow read/write calls, freezing out other clients.
- **Multi-Threaded Delegation:**
  - The main server thread listens continuously on port `8189`.
  - For each inbound connection, it spawns a dedicated worker thread (`ClientHandler`).
  - Thread-safe synchronization ensures broadcast queues avoid race conditions.

---

## 4. Phase 1 Prototype: Raw TCP Architecture

### Java Multi-Threaded Socket Implementation
- **`ChatServer.java`:**
  - Binds `ServerSocket(8189)`.
  - Maintains synchronized `clientWriters` set for broadcast fan-out.
- **`ChatClient.java` (Terminal):**
  - Main thread reads stdin; background thread listens for socket incoming streams.
- **`ChatClientGUI.java` (Swing Desktop UI):**
  - Event Dispatch Thread (EDT) processes button/typing events.
  - Background worker thread listens to the socket to prevent UI freezes.

---

## 5. Architectural Shift: Why WebSockets?

### Limitations of Raw TCP in Modern Web Browsers
- Web browsers sandbox network calls; direct raw TCP sockets are prohibited for security reasons.
- **HTTP/1.1 Short Polling:** Enormous header overhead (500B - 2KB per request) and high server load.
- **HTTP Long Polling / SSE:** Unidirectional server-to-client streaming, high connection churn.

### The WebSocket Advantage (RFC 6455)
- **Handshake:** Starts as an HTTP `GET` with `Upgrade: websocket`.
- **Protocol Switch:** HTTP 101 `Switching Protocols` upgrades to persistent full-duplex TCP stream.
- **Frame Efficiency:** Tiny 2–10 byte framing overhead; eliminates repetitive HTTP header parsing.

---

## 6. Publish-Subscribe (Pub/Sub) Fan-Out

### Distributed Message Fan-Out Model
- In scalable deployments, clients are connected across a cluster of WebSocket gateway servers.
- **Redis Pub/Sub / Kafka Broker:**
  - **1-on-1 Chats:** Messages published to `user:{recipient_id}` channels.
  - **Group / Room Channels:** Messages published to `/topic/{roomId}`.
  - Connected WebSocket servers subscribe to relevant channels and push frames down the target client's socket.
  - Eliminates server-to-server connection mesh complexity.

---

## 7. Stateless API Microservices

### Decoupling Stateful & Stateless Tiers
- **Stateful Layer:** WebSocket Gateways (`/ws-chat`) hold open TCP connections for low-latency push events.
- **Stateless REST Services:**
  - **Auth Service:** Login & registration with JWT issuance (`/api/auth`).
  - **Group Service:** Channel creation, join codes, membership checks (`/api/groups`).
  - **Audit Service:** Message log retrieval (`/api/admin/logs`).
- **Scalability Benefit:** Stateless services scale horizontally on demand via standard L7 load balancers without dropping existing chat connections.

---

## 8. Message Delivery State Machine

### Maintaining User Trust with Delivery Receipts
```
[User Types] ➔ [PENDING 🕒] ➔ [SENT ✓] ➔ [DELIVERED ✓✓] ➔ [READ ✓✓]
```
1. **Pending (`🕒`):** Message held in client outbox (offline/in-flight).
2. **Sent (`✓`):** Server receives frame, saves to DB, returns ACK to sender.
3. **Delivered (`✓✓` Gray):** Recipient client receives frame and automatically responds with `/app/chat.ackDelivery/{roomId}`.
4. **Read (`✓✓` Blue):** Recipient opens/focuses active chat window; client sends `/app/chat.ackRead/{roomId}`.

---

## 9. Presence Status System (Heartbeat + TTL)

### Detecting Online, Away & Offline States
- Abrupt network drops (dead battery, tunnel disconnect) do not cleanly close TCP sockets.
- **Heartbeat Mechanism:**
  - Connected clients send a lightweight heartbeat frame to `/app/chat.heartbeat` every 15 seconds.
  - Server maintains an in-memory / cache store with a **30-second Time-To-Live (TTL)**.
- **Scheduled Sweeper:**
  - `@Scheduled` task runs every 5s; evicts expired sessions and broadcasts `OFFLINE` status to `/topic/presence`.
  - Window blur/idle triggers report `AWAY` status dynamically.

---

## 10. Multi-Device & Cross-Tab Sync

### Consistent State Across Client Instances
- **Browser Cross-Tab Sync (`BroadcastChannel` API):**
  - Broadcasts `ACK_UPDATE` and `NEW_MESSAGE` events across local tabs via channel `'stealthchat_sync_channel'`.
  - Tab 2 updates its DOM ticks immediately when Tab 1 reads a message—zero duplicate network traffic!
- **Cross-Device Sync:**
  - Monotonic server message sequence numbers allow newly connecting devices to reconcile message history diffs.

---

## 11. Offline-First Architecture: IndexedDB & Service Worker

### Resilient Client Storage Layer
- **IndexedDB (`StealthChatDB`):**
  - **`messages` Store:** Caches room history locally; switching channels renders instantly from disk without waiting for network response.
  - **`outbox` Store:** Queues outgoing messages when connection is lost.
- **Service Worker (`sw.js`):**
  - Pre-caches core application shell for offline browsing.
  - Handles the **Background Sync API** (`sync-queued-messages`) to flush queued outbox messages as soon as connectivity recovers.

---

## 12. Security: Authentication & Authorization

### Short-Lived JWT & Channel-Level ACL
- **Authentication:**
  - Stateless HMAC-SHA256 JWT generated upon login, containing user identity and role.
  - Token supplied in STOMP `CONNECT` native headers (`Authorization: Bearer <jwt>`).
- **Channel Interceptor (`WebSocketSecurityChannelInterceptor`):**
  - Inspects STOMP `SUBSCRIBE` commands targeting `/topic/{roomId}`.
  - Queries `GroupMembershipRepository` to verify room authorization.
  - Unauthorized subscriptions are dropped at the packet level!

---

## 13. Polyglot Persistence & Data Storage

### Relational vs NoSQL Storage Tiering

| Data Dimension | Relational DB (PostgreSQL / H2) | Distributed NoSQL (Cassandra / HBase) |
| :--- | :--- | :--- |
| **Data Type** | User Accounts, Passwords, Group ACL | High-Volume Immutable Chat Messages |
| **Consistency** | Strict ACID Transactions | Eventual Consistency / Tunable |
| **Access Pattern** | Complex relational queries, foreign keys | High write throughput, append-heavy |
| **Partitioning** | Normalized schemas with relational joins | Partition Key: `(room_id, bucket_epoch)` |

---

## 14. Client-Side Idempotency & Deduplication

### Solving Packet Retries in Unstable Mobile Networks
- **The Problem:** Weak connections cause lost ACK packets. Client retries sending, producing duplicate messages.
- **The Solution:**
  1. Client assigns unique UUID `clientMsgId` before transmitting.
  2. Server queries [`IdempotencyService`](file:///c:/CN%20CASE%20STUDY/ChatApplication/src/main/java/com/stealthchat/service/IdempotencyService.java) with a 5-minute sliding TTL memory cache and database check.
  3. If `clientMsgId` was already processed, the duplicate packet is dropped and original ACK is returned—**zero duplicated writes**.

---

## 15. StealthChat Implementation Showcase

### Enterprise Spring Boot 3 Full-Stack Application
- **Backend:** Spring Boot 3.2.3, Spring WebSocket (STOMP / SockJS), Spring Data JPA, H2 Database.
- **Frontend:** Modern dark-mode WhatsApp aesthetic, Vanilla CSS & JS.
- **Bonus Security Feature (Steganography):**
  - Least Significant Bit (LSB) image steganography.
  - Secret text is embedded into the RGB canvas pixel data before transmission.
  - Eavesdroppers intercepting raw packets see only a benign PNG image.

---

## 16. Real-World Engineering Challenges Encountered

### 1. Port Conflicts (HTTP 400 Mismatch)
- Raw TCP server on port `8080` intercepted by background web server, causing HTTP 400 rejection; resolved by port remapping to dedicated `8189`.
### 2. Concurrency & Race Conditions
- Multiple threads mutating broadcast lists simultaneously; resolved via synchronized mutex locks.
### 3. Spring Boot Circular Reference Resolution
- Circular dependency between `WebSocketConfig`, `SecurityInterceptor`, and `SimpMessagingTemplate`; resolved using `@Lazy` decoupling and event decoupling.

---

## 17. Architecture Comparison Matrix

| Feature | Raw TCP Sockets | Polling (HTTP/1.1) | Enterprise WebSockets |
| :--- | :--- | :--- | :--- |
| **Browser Compatibility** | None (Native only) | Universal | Universal (Modern Web) |
| **Latency** | Sub-millisecond | High (Polling delay) | Real-time (< 5ms) |
| **Header Overhead** | Minimal (Raw bytes) | High (500B - 2KB) | 2–10 bytes per frame |
| **Security & Auth** | Custom byte framing | Standard Cookies/JWT | JWT Channel Interceptors |
| **Offline Handling** | Manual OS retry | Manual HTTP retry | IndexedDB + Service Worker |

---

## 18. Conclusion & Takeaways

- **Foundational Networking:** Sockets and TCP concurrency are essential for understanding how data travels across network interfaces.
- **Distributed Scale:** Modern enterprise chat requires layering WebSockets, Pub/Sub fan-out, idempotency deduplication, and presence heartbeats on top of raw transport protocols.
- **Resilience:** Combining IndexedDB local persistence with Service Worker background sync guarantees communication continuity even in degraded network conditions.

---

# Thank You!
### Questions & Discussion
