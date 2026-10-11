# Case Study: Real-Time Multi-Client Communication & Novel Steganographic Web Messaging

**Course:** Computer Networking (CN)  
**Topic:** Transport Layer Protocols, Distributed Pub/Sub, WebSockets, and Steganographic Network Security  
**Project:** StealthChat — From Raw Java TCP Sockets to Enterprise Steganographic Web Messaging  

---

## 1. Executive Summary & Problem Formulation

In modern distributed networks, real-time communication systems (such as WhatsApp, Signal, Slack, and Discord) face two competing engineering challenges:
1. **Network Performance & Scalability:** Maintaining millions of concurrent, persistent, bidirectional connections with minimal protocol overhead, low latency, and zero dropped packets across unstable consumer networks.
2. **Network-Level Privacy & Censorship Resistance:** Traditional End-to-End Encryption (E2EE) protects message plaintext mathematically, but **it loudly leaks cryptographic metadata**. Deep Packet Inspection (DPI) appliances, internet service providers (ISPs), and network firewalls easily detect high-entropy ciphertext streams. In hostile or monitored networks, transmitting encrypted text itself triggers traffic throttling, blocking, or targeted surveillance.

This case study investigates both challenges through a two-phase implementation:
* **Phase 1 (Transport Layer Foundations):** A custom multi-threaded Java TCP socket system (`ServerSocket`, blocking I/O, thread-safe synchronization, and Swing desktop GUI).
* **Phase 2 (Enterprise Evolution & The Core Novelty):** A production-grade Spring Boot 3 + WebSocket application featuring **StealthChat** — an innovative client-side **Least Significant Bit (LSB) Steganographic Carrier Channel** that camouflages confidential communications into procedural digital images, rendering them invisible to Deep Packet Inspection (DPI) and snooping proxy administrators.

---

## 2. The Core Innovation & Novelty: Steganographic Carrier Encryption

### 2.1 The Critical Limitation of Commercial Apps (WhatsApp, Signal, Telegram)
Leading instant messaging applications rely on symmetric ciphers (such as AES-256-GCM) and public-key handshakes (such as Curve25519). While computationally secure against decryption, the resulting packets exhibit **high Shannon entropy** characteristic of raw ciphertext. 

Any intermediate network observer running packet analysis tools (e.g., Wireshark) or hardware DPI firewalls can immediately deduce:
* That private communication is occurring.
* The exact timestamp, packet length, and communication frequency.
* The participant identities and network endpoints.

In many corporate, campus, or sovereign networks, detecting encrypted payloads leads to immediate blocking or administrative interrogation.

### 2.2 StealthChat's Novel Solution: Security Through Visual Camouflage
Instead of sending suspicious ciphertext strings across the wire, **StealthChat introduces a procedural zero-knowledge carrier channel**:
1. **Procedural Carrier Synthesis:** When the sender initiates secret communication, the browser dynamically generates a random visual gradient artwork on an ephemeral HTML5 Canvas element. This eliminates hardcoded images or predictable cryptographic signatures.
2. **Binary Stream Conversion:** Secret text is converted into UTF-8 binary bytes and terminated with a proprietary 16-bit null delimiter (`0000000000000000`), avoiding any plaintext length headers in packet metadata.
3. **Bitwise Least Significant Bit (LSB) Mutation:**
   For every pixel's Red, Green, and Blue channels (skipping Alpha to preserve opacity), the lowest bit is replaced:
   $$\text{Pixel\_Channel}' = (\text{Pixel\_Channel} \ \& \ \sim 1) \ | \ \text{Secret\_Bit}$$
4. **Imperceptible Visual Distortion:** The maximum change per color byte is at most $\pm 1$ out of 255 ($\approx 0.39\%$), well below the human visual threshold ($\Delta E$). To human observers and statistical image filters, the carrier appears as a legitimate piece of abstract digital art.
5. **MIME-Type Disguise & Network Evasion:** The WebSocket frame transmits a standard `image/png` Base64 payload. Network middleboxes, firewalls, and server audit logs see only benign image sharing.
6. **Zero-Knowledge Client Decryption:** Decryption occurs purely on the recipient's GPU/canvas buffer. The server never possesses the plaintext or secret keys.

### 2.3 Novelty Comparison Matrix

| Architectural Feature | WhatsApp / Signal | Telegram / Slack | StealthChat (Our Novel Innovation) |
| :--- | :--- | :--- | :--- |
| **Payload Visibility to DPI** | Obvious Raw Ciphertext | Cleartext / Ciphertext | **100% Camouflaged as Benign PNG Image** |
| **Deniable Communication** | None (Cryptographic trail) | None | **Fully Supported (Artwork Camouflage)** |
| **Network Signature** | Flagged as Encrypted Stream | Standard Web API | **Indistinguishable from Image Sharing** |
| **Client Overhead** | Heavy Native C++ Libraries | Web App / Heavy SDK | **Zero-Plugin Native HTML5 Canvas + WebSockets** |
| **Delivery Receipts** | Sent / Delivered / Read Ticks | Sent / Read | **Sent (`✓`), Delivered (`✓✓`), Read (`✓✓` Blue)** |
| **Offline Architecture** | Native SQLite Database | Cloud-only Sync | **Native IndexedDB + Service Worker Background Sync** |

---

## 3. Transport Layer Foundations: TCP vs UDP & Sockets

### 3.1 Protocol Evaluation: Why TCP is Mandatory
* **TCP (Transmission Control Protocol):** Connection-oriented protocol providing reliable, in-order byte streams via sequence numbers, checksums, selective acknowledgments, and flow control.
* **UDP (User Datagram Protocol):** Connectionless, fire-and-forget protocol with no retransmissions or ordering guarantees.
* **Application Verdict:** Instant messaging requires strict semantic ordering. If a user transmits `"Authorize transaction $10,000"`, dropping or reordering packets alters the statement's meaning. TCP is the required transport layer protocol.

### 3.2 Sockets, Ports & Concurrency Models
* A **socket** is an endpoint of communication bound to an IP address and a specific port number (e.g., `127.0.0.1:8189`).
* **Concurrency Challenge:** A single-threaded server blocks inside `accept()` or `read()` loops. A slow client blocks all other users.
* **Multi-Threaded Architecture:**
  * Main thread binds `ServerSocket(8189)` and listens for incoming TCP handshakes.
  * For each connection, it spawns a dedicated `ClientHandler` thread.
  * Thread-safe `synchronized` blocks protect shared writer lists against `ConcurrentModificationException`.

---

## 4. Enterprise Evolution: WebSockets & Distributed Architecture

### 4.1 The Need for WebSockets (RFC 6455)
Web browsers prohibit raw TCP socket access for sandbox security.
* **HTTP/1.1 Polling:** Incurs 500B–2KB of redundant header overhead per request, overloading servers.
* **WebSockets:** Initiates via an HTTP `GET` with an `Upgrade: websocket` header. The server responds with `HTTP 101 Switching Protocols`, transitioning into a persistent, full-duplex TCP stream with tiny 2–10 byte framing overhead.

### 4.2 Distributed Publish-Subscribe (Pub/Sub) Fan-Out
In enterprise deployments, clients connect to different WebSocket gateway nodes:
* Nodes connect to a central **Pub/Sub Broker (Redis Cluster / Kafka)**.
* Group and room messages publish to `/topic/{roomId}`.
* 1-on-1 direct messages route to `user:{recipient_id}`.
* Gateway servers subscribe to relevant channels and push frames down the target client's socket, achieving linear horizontal scaling.

### 4.3 Stateless Microservices & JWT Channel Access Control
* **Stateless REST Layer:** Authentication (`/api/auth`), Group Management (`/api/groups`), and Audit Logs (`/api/admin/logs`) run on stateless HTTP services behind standard L7 load balancers.
* **Stateless JWT Security:** Users receive an RFC 7519 HMAC-SHA256 signed JWT upon login.
* **WebSocket Channel Interceptor (`WebSocketSecurityChannelInterceptor`):**
  * **On `CONNECT`:** Validates JWT from STOMP native headers and binds an authenticated `StompPrincipal`.
  * **On `SUBSCRIBE`:** Verifies group membership in the relational database before allowing subscription to `/topic/{roomId}`. Unauthorized subscription attempts are dropped at the packet level.

---

## 5. Reliability & Offline-First Client Architecture

### 5.1 Message Delivery State Machine
StealthChat tracks message states using a bidirectional ACK state machine:
1. **Pending (`🕒`):** Queued in the client's local IndexedDB outbox.
2. **Sent (`✓` Single Gray Tick):** Server acknowledges receipt, validates idempotency, and commits to database.
3. **Delivered (`✓✓` Double Gray Tick):** Recipient's WebSocket client receives the frame and emits `/app/chat.ackDelivery/{roomId}`.
4. **Read (`✓✓` Double Blue Tick):** Recipient focuses the active chat window; client emits `/app/chat.ackRead/{roomId}`.

### 5.2 Presence Status System (Heartbeat + TTL Cache)
* Clients emit a heartbeat frame to `/app/chat.heartbeat` every 15 seconds.
* The server maintains an in-memory presence cache with a **30-second Time-To-Live (TTL)**.
* An asynchronous `@Scheduled` sweeper runs every 5s; if a client crashes without a clean TCP FIN handshake, their presence key expires, broadcasting `OFFLINE` status to `/topic/presence`.

### 5.3 Cross-Tab Sync via `BroadcastChannel` API
Multiple open browser tabs communicate directly using `BroadcastChannel('stealthchat_sync_channel')`. When Tab 1 marks a conversation as read, Tab 2 updates its DOM ticks immediately with zero duplicate server requests.

### 5.4 Offline-First Resiliency: IndexedDB & Service Worker
* **IndexedDB (`StealthChatDB`):**
  * `messages` Object Store: Caches room history locally for instant, zero-latency rendering when switching channels.
  * `outbox` Object Store: Holds pending messages while disconnected.
* **Service Worker (`sw.js`):** Pre-caches the application shell and handles the **Background Sync API** (`sync-queued-messages`) to automatically flush outbox messages upon reconnection.
* **Client-Side Idempotency:** Each message is assigned a unique UUID `clientMsgId`. The server's `IdempotencyService` maintains a 5-minute sliding TTL cache to drop duplicate packets caused by network retries.

---

## 6. Real-World Engineering Challenges Encountered

1. **Port Conflicts (The HTTP 400 Mismatch):** When raw TCP sockets initially ran on port `8080`, local web servers rejected raw text with `HTTP 400 Bad Request`. Resolved by assigning dedicated port `8189` for raw TCP sockets and `8080` for the WebSockets HTTP server.
2. **Thread Safety & Race Conditions:** Concurrent client joins/leaves triggered `ConcurrentModificationException`. Resolved by implementing synchronized mutex blocks on shared writer sets.
3. **Spring Boot Circular Dependency Cycle:** `WebSocketConfig` $\rightarrow$ `SecurityInterceptor` $\rightarrow$ `PresenceService` $\rightarrow$ `SimpMessagingTemplate` created an unresolvable startup cycle. Resolved using `@Lazy` injection decoupling and decoupled event listeners.

---

## 7. Conclusion & Academic Contributions

This case study demonstrates the full evolutionary trajectory of real-time network communications:
* **Transport Foundations:** Illustrated raw socket bindings, TCP handshakes, and multi-threaded I/O concurrency in Java.
* **Enterprise Distributed Architecture:** Implemented full-duplex WebSockets, Pub/Sub fan-out, stateless JWT access control, delivery state tracking, and offline IndexedDB persistence.
* **The Core Novelty (StealthChat):** Successfully proved that **client-side image steganography provides an effective new paradigm for network privacy**, disguising confidential chat traffic as benign digital images to bypass Deep Packet Inspection (DPI) where conventional encryption fails.
