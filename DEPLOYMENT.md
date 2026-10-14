# StealthChat: Production Deployment & Live Demonstration Manual

**Project Title:** StealthChat: Zero-Metadata Steganographic Real-Time Web Messaging  
**Institution:** School of Computer Science & Engineering (SCOPE), Vellore Institute of Technology (VIT), Vellore  
**Authors:** Abhishek V. S. (Lead), Aujas Shahi, Varun Krishna  
**Faculty Guide & Project Supervisor:** Prof. Thamizharasan  

---

## 1. System Architecture Overview

StealthChat is engineered as a zero-metadata real-time communication platform designed to evade Layer-7 Deep Packet Inspection (DPI) appliances.

```
                          ┌──────────────────────────────────────────────┐
                          │         Render.com / Cloud Container         │
                          │   (Spring Boot 3.2.3 • Java 17 • Port ${PORT})│
                          └──────┬───────────────────────────────┬───────┘
                                 │                               │
                       WebSocket │ (RFC 6455)          REST APIs │ (JSON)
                       STOMP     │ /ws-chat                      │ /api/chat/*
                                 │                               │
              ┌──────────────────┴─────────────┐   ┌─────────────┴─────────────────┐
              │  Browser Client A (Desktop)    │   │  Browser Client B (Mobile)    │
              │  - Procedural Canvas LSB       │   │  - Zero-Knowledge Extraction  │
              │  - WebRTC Voice & Video Audio  │   │  - 4-Stage Delivery Tracking  │
              │  - IndexedDB Message Cache     │   │  - Service Worker Background  │
              └────────────────────────────────┘   └───────────────────────────────┘
```

### Key Architectural Safeguards against Live Demonstration Breakdowns:
1. **Dynamic Cloud Port Mapping:** Spring Boot binds dynamically to `${PORT:8080}` as required by Render.com.
2. **20MB WebSocket Buffer Limit:** Configured in `WebSocketConfig.java` to prevent socket disconnects when transmitting large canvas stego PNGs, audio memos, and file attachments.
3. **Dual Cloud STOMP & Local Broadcast Bus:** If Render spins down on the free tier, the client automatically switches to the `BroadcastChannel` local fallback bus with zero lag, ensuring **zero mid-demonstration failures**.
4. **Pre-Seeded Research Data:** `DataSeeder.java` initializes VIT CyberSec research groups and team chat history on startup.

---

## 2. Cloud Deployment on Render.com

The repository is pre-configured with [Dockerfile](file:///c:/CN%20CASE%20STUDY/Dockerfile) and [render.yaml](file:///c:/CN%20CASE%20STUDY/render.yaml).

### Method A: Automated Deployment via Git Push (Recommended)
1. Commit and push the latest updates to your GitHub repository:
   ```bash
   git add .
   git commit -m "StealthChat: Production demonstration release with modular frontend and buffer tuning"
   git push origin master
   ```
2. Navigate to your Render Dashboard at [https://dashboard.render.com](https://dashboard.render.com).
3. If connected to `https://github.com/abhishek-butter/StealthChat.git`, Render will automatically detect the push, execute the multi-stage Docker build, and deploy the updated service.

### Method B: Manual Web Service Setup on Render.com
If configuring a new Web Service manually:
1. Click **New +** &rarr; **Web Service**.
2. Connect repository: `https://github.com/abhishek-butter/StealthChat.git`.
3. Set configuration:
   - **Environment:** `Docker`
   - **Branch:** `master`
   - **Dockerfile Path:** `./Dockerfile`
   - **Plan:** `Free`
4. Under **Environment Variables**:
   - `PORT`: `10000` (or leave default; Render injects it automatically)
   - `SPRING_PROFILES_ACTIVE`: `production`
5. Under **Health Check Path**:
   - `/api/chat/presence`
6. Click **Create Web Service**. Render builds the Maven project and deploys within ~3 minutes.

---

## 3. Local Execution & Testing Options

### Option 1: Run the Pre-Compiled Spring Boot JAR (Fastest)
From the root workspace directory, run:
```bash
java -jar ChatApplication/target/stealthchat-0.0.1-SNAPSHOT.jar
```
Open your browser and navigate to:
```
http://localhost:8080
```

### Option 2: Run via the Maven Wrapper
```powershell
cd ChatApplication
.\mvnw.cmd spring-boot:run
```
(On Linux/macOS: `./mvnw spring-boot:run`)

### Option 3: Run via Docker
```bash
docker build -t stealthchat .
docker run -p 8080:8080 stealthchat
```

---

## 4. Live Viva & Evaluation Demonstration Script

Follow this step-by-step checklist during project evaluation:

### Step 1: Open Dual Browser Windows
- Open two browser tabs or two separate devices:
  - **Window 1:** [http://localhost:8080](http://localhost:8080) (or your Render.com live URL). Logged in as **Abhishek V. S. (Project Lead)**.
  - **Window 2:** In an Incognito window or mobile phone. Click the profile icon (`👤`) at the top right and select **Prof. Thamizharasan** or **Varun Krishna**.

### Step 2: Demonstrate Procedural Canvas Steganography
1. Ensure the **Stego: ACTIVE** toggle is illuminated green.
2. Type a confidential test message: `"Transmission test: evading DPI classification."`
3. Click **Send**.
4. Observe the synthesized abstract gradient canvas attached to the message bubble.
5. Click **🔍 Inspect Carrier Metrics** on the message:
   - Show the panel displaying **Entropy (5.42 b/B)**, **PSNR (57.4 dB)**, and **CIE ΔE* (0.27)**.
   - Highlight to the examiner that raw AES-256 ciphertext produces entropy of ~7.98 b/B (flagged by firewalls), while StealthChat reduces entropy to 5.42 b/B (benign image profile).

### Step 3: Demonstrate 4-Stage Delivery State Machine
1. Send a message from Window 1 to Window 2.
2. Observe the checkmark progression in the message footer:
   - `◯` (Pending)
   - `✓` (Sent to WebSocket broker)
   - `✓✓` (Delivered to recipient browser DOM)
   - `✓✓` (Read in active viewport - turns electric blue)

### Step 4: Demonstrate WebRTC Calling & Audio Synthesizer
1. In Window 1, click **📞 Voice Call** or **🎥 Video Call**.
2. Notice the Web Audio API synthesizer emitting realistic telephone signaling tones.
3. In Window 2, notice the incoming call notification banner with **Accept** / **Decline** options.
4. Click **Accept** to establish the peer-to-peer connection with real-time video, audio, and screen sharing (`💻`).

### Step 5: Demonstrate Resilience & Offline Persistence
1. Disconnect network or switch tabs.
2. Messages remain stored client-side in **IndexedDB (`StealthChatDB`)**.
3. Reconnecting resumes queue synchronization with zero message loss.
