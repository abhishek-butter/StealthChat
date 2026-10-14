/**
 * STEALTHCHAT WEBRTC AUDIO & VIDEO CALLING ENGINE (webrtc.js)
 * Dual Cloud STOMP & Local Broadcast WebRTC Signaling with Synthesizer Audio
 * School of Computer Science & Engineering (SCOPE), VIT
 */

const StealthCall = (function () {
  'use strict';

  let peerConnection = null;
  let localStream = null;
  let remoteStream = null;
  let currentCallType = 'voice'; // 'voice' or 'video'
  let currentTargetUser = null;
  let isInitiator = false;
  let audioContext = null;
  let ringtoneOscillator = null;
  let callTimerInterval = null;
  let callSeconds = 0;

  // Local fallback signaling channel
  const localBus = new BroadcastChannel('stealthchat_webrtc_bus');

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  /**
   * Initializes Web Audio Synthesizer for ringtones
   */
  function initAudio() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
  }

  function playRingtone(isIncoming = false) {
    try {
      initAudio();
      if (!audioContext) return;
      stopRingtone();

      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      if (isIncoming) {
        // Melodic dual-tone ring for incoming call
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, audioContext.currentTime); // A4
        osc.frequency.setValueAtTime(554.37, audioContext.currentTime + 0.3); // C#5
      } else {
        // European standard dial tone (425Hz)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(425, audioContext.currentTime);
      }

      gain.gain.setValueAtTime(0.08, audioContext.currentTime);
      osc.connect(gain);
      gain.connect(audioContext.destination);

      osc.start();
      ringtoneOscillator = osc;
    } catch (e) {
      console.warn('Audio synth not permitted yet:', e);
    }
  }

  function stopRingtone() {
    if (ringtoneOscillator) {
      try {
        ringtoneOscillator.stop();
        ringtoneOscillator.disconnect();
      } catch (e) {}
      ringtoneOscillator = null;
    }
  }

  /**
   * Starts Call (Initiator)
   */
  async function startCall(targetUser, type = 'voice', sendSignalCallback) {
    currentTargetUser = targetUser;
    currentCallType = type;
    isInitiator = true;

    showCallOverlay(targetUser, type, 'Calling...');
    playRingtone(false);

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video'
      });
      attachLocalStream(localStream);

      setupPeerConnection(sendSignalCallback);

      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const signal = {
        signalType: 'OFFER',
        sender: window.StealthApp.getCurrentUsername(),
        target: targetUser,
        callType: type,
        sdp: offer
      };

      // Send via Cloud STOMP and Local Broadcast bus
      sendSignal(signal, sendSignalCallback);
    } catch (err) {
      console.error('Failed to get media devices:', err);
      stopRingtone();
      alert('Camera or microphone access denied or not available: ' + err.message);
      endCall(sendSignalCallback);
    }
  }

  /**
   * Handles Incoming Offer Signal
   */
  function handleIncomingOffer(signal, sendSignalCallback) {
    if (peerConnection) return; // Busy

    currentTargetUser = signal.sender;
    currentCallType = signal.callType || 'voice';
    isInitiator = false;

    showIncomingBanner(signal.sender, signal.callType, sendSignalCallback, signal);
    playRingtone(true);
  }

  /**
   * User accepts incoming call
   */
  async function acceptCall(signal, sendSignalCallback) {
    stopRingtone();
    hideIncomingBanner();
    showCallOverlay(signal.sender, signal.callType, 'Connecting...');

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: signal.callType === 'video'
      });
      attachLocalStream(localStream);

      setupPeerConnection(sendSignalCallback);

      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      const answerSignal = {
        signalType: 'ANSWER',
        sender: window.StealthApp.getCurrentUsername(),
        target: signal.sender,
        callType: signal.callType,
        sdp: answer
      };

      sendSignal(answerSignal, sendSignalCallback);
      startCallTimer();
    } catch (err) {
      console.error('Accept call failed:', err);
      endCall(sendSignalCallback);
    }
  }

  /**
   * Handles Remote Answer Signal
   */
  async function handleIncomingAnswer(signal) {
    stopRingtone();
    if (peerConnection && peerConnection.signalingState !== 'stable') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      updateCallStatus('Connected');
      startCallTimer();
    }
  }

  /**
   * Handles Remote ICE Candidate
   */
  async function handleIceCandidate(signal) {
    if (peerConnection && signal.candidate) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch (e) {
        console.warn('Error adding ICE candidate:', e);
      }
    }
  }

  /**
   * Sets up RTCPeerConnection and handlers
   */
  function setupPeerConnection(sendSignalCallback) {
    peerConnection = new RTCPeerConnection(rtcConfig);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const iceSignal = {
          signalType: 'CANDIDATE',
          sender: window.StealthApp.getCurrentUsername(),
          target: currentTargetUser,
          candidate: event.candidate
        };
        sendSignal(iceSignal, sendSignalCallback);
      }
    };

    peerConnection.ontrack = (event) => {
      remoteStream = event.streams[0];
      attachRemoteStream(remoteStream);
      updateCallStatus('Connected');
      startCallTimer();
    };

    peerConnection.oniceconnectionstatechange = () => {
      if (
        peerConnection.iceConnectionState === 'disconnected' ||
        peerConnection.iceConnectionState === 'failed' ||
        peerConnection.iceConnectionState === 'closed'
      ) {
        endCall(sendSignalCallback, false);
      }
    };
  }

  function sendSignal(signal, sendSignalCallback) {
    // 1. Send via Spring Boot Cloud STOMP if callback available
    if (typeof sendSignalCallback === 'function') {
      sendSignalCallback(signal);
    }
    // 2. Broadcast on local cross-tab bus
    localBus.postMessage(signal);
  }

  /**
   * Call Signaling Dispatcher
   */
  function handleSignal(signal, sendSignalCallback) {
    const currentUsername = window.StealthApp.getCurrentUsername();
    // Ignore signals sent by self
    if (signal.sender === currentUsername) return;
    // Only accept signals directed to us or public room
    if (signal.target && signal.target !== currentUsername && signal.target !== 'ALL') return;

    switch (signal.signalType) {
      case 'OFFER':
        handleIncomingOffer(signal, sendSignalCallback);
        break;
      case 'ANSWER':
        handleIncomingAnswer(signal);
        break;
      case 'CANDIDATE':
        handleIceCandidate(signal);
        break;
      case 'HANGUP':
        endCall(sendSignalCallback, false);
        break;
    }
  }

  // Listen on local cross-tab bus
  localBus.onmessage = (event) => {
    handleSignal(event.data);
  };

  /**
   * Ends Call & Cleans up hardware streams
   */
  function endCall(sendSignalCallback, notifyPeer = true) {
    stopRingtone();
    stopCallTimer();

    if (notifyPeer && currentTargetUser) {
      const hangupSignal = {
        signalType: 'HANGUP',
        sender: window.StealthApp.getCurrentUsername(),
        target: currentTargetUser
      };
      sendSignal(hangupSignal, sendSignalCallback);
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    currentTargetUser = null;
    hideCallOverlay();
    hideIncomingBanner();
  }

  /**
   * UI Helpers
   */
  function showCallOverlay(user, type, status) {
    const overlay = document.getElementById('callOverlay');
    if (!overlay) return;
    overlay.classList.add('active');
    document.getElementById('callUserName').textContent = user;
    document.getElementById('callStatusText').textContent = status;

    const remoteVideo = document.getElementById('remoteVideo');
    const localVideo = document.getElementById('localVideo');
    const avatarFallback = document.getElementById('callAvatarFallback');

    if (type === 'video') {
      remoteVideo.style.display = 'block';
      localVideo.style.display = 'block';
      avatarFallback.style.display = 'none';
    } else {
      remoteVideo.style.display = 'none';
      localVideo.style.display = 'none';
      avatarFallback.style.display = 'flex';
      avatarFallback.textContent = user.substring(0, 2).toUpperCase();
    }
  }

  function hideCallOverlay() {
    const overlay = document.getElementById('callOverlay');
    if (overlay) overlay.classList.remove('active');
  }

  function showIncomingBanner(sender, type, sendSignalCallback, signal) {
    const banner = document.getElementById('incomingCallBanner');
    if (!banner) return;
    banner.classList.add('active');
    document.getElementById('incomingCallerName').textContent = sender;
    document.getElementById('incomingCallType').textContent =
      type === 'video' ? 'Incoming Video Call...' : 'Incoming Voice Call...';

    const btnAccept = document.getElementById('btnAcceptCall');
    const btnReject = document.getElementById('btnRejectCall');

    btnAccept.onclick = () => acceptCall(signal, sendSignalCallback);
    btnReject.onclick = () => {
      stopRingtone();
      hideIncomingBanner();
      sendSignal({ signalType: 'HANGUP', sender: window.StealthApp.getCurrentUsername(), target: sender }, sendSignalCallback);
    };
  }

  function hideIncomingBanner() {
    const banner = document.getElementById('incomingCallBanner');
    if (banner) banner.classList.remove('active');
  }

  function attachLocalStream(stream) {
    const video = document.getElementById('localVideo');
    if (video) video.srcObject = stream;
  }

  function attachRemoteStream(stream) {
    const video = document.getElementById('remoteVideo');
    if (video) video.srcObject = stream;
  }

  function updateCallStatus(status) {
    const el = document.getElementById('callStatusText');
    if (el) el.textContent = status;
  }

  function startCallTimer() {
    stopCallTimer();
    callSeconds = 0;
    const timerEl = document.getElementById('callTimer');
    callTimerInterval = setInterval(() => {
      callSeconds++;
      const mins = Math.floor(callSeconds / 60)
        .toString()
        .padStart(2, '0');
      const secs = (callSeconds % 60).toString().padStart(2, '0');
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function stopCallTimer() {
    if (callTimerInterval) clearInterval(callTimerInterval);
    callTimerInterval = null;
    const timerEl = document.getElementById('callTimer');
    if (timerEl) timerEl.textContent = '00:00';
  }

  /**
   * Screen Sharing Toggle
   */
  async function toggleScreenShare() {
    if (!peerConnection) return;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      const sender = peerConnection.getSenders().find((s) => s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(screenTrack);
      }
      attachLocalStream(screenStream);
      screenTrack.onended = () => {
        if (localStream) {
          const videoTrack = localStream.getVideoTracks()[0];
          if (sender && videoTrack) sender.replaceTrack(videoTrack);
          attachLocalStream(localStream);
        }
      };
    } catch (e) {
      console.warn('Screen share canceled:', e);
    }
  }

  return {
    startCall,
    acceptCall,
    endCall,
    handleSignal,
    toggleScreenShare
  };
})();

window.StealthCall = StealthCall;
