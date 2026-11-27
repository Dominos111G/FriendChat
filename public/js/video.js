import { initSocket } from "/js/socket.js";

const socket = initSocket();
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const statusMessage = document.getElementById("videoStatus");
const startButton = document.getElementById("StartButton");
const microphoneButton = document.getElementById("MicrophoneButton");
const cameraButton = document.getElementById("CameraButton");

const peerConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

let localStream = null;
let peerConnection = null;
let pendingCandidates = [];
let isSearching = false;
let isPaired = false;

function setStatus(message) {
  statusMessage.textContent = message;
}

function updateMediaButtons() {
  const hasAudio = Boolean(localStream?.getAudioTracks().length);
  const hasVideo = Boolean(localStream?.getVideoTracks().length);
  microphoneButton.disabled = !hasAudio;
  cameraButton.disabled = !hasVideo;
  microphoneButton.textContent = localStream?.getAudioTracks().some(track => track.enabled)
    ? "Mute microphone"
    : "Unmute microphone";
  cameraButton.textContent = localStream?.getVideoTracks().some(track => track.enabled)
    ? "Turn camera off"
    : "Turn camera on";
}

function updateStartButton() {
  startButton.textContent = isSearching ? "Cancel search" : isPaired ? "Leave Chat" : "New Chat";
}

function closePeerConnection() {
  if (!peerConnection) return;

  peerConnection.onicecandidate = null;
  peerConnection.ontrack = null;
  peerConnection.onconnectionstatechange = null;
  peerConnection.close();
  peerConnection = null;
  pendingCandidates = [];
}

function stopMedia() {
  closePeerConnection();
  localStream?.getTracks().forEach(track => track.stop());
  localStream = null;
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  updateMediaButtons();
}

function endChat(notifyServer = true) {
  if (notifyServer && socket.connected) {
    socket.emit("leave");
  }
  isSearching = false;
  isPaired = false;
  stopMedia();
  updateStartButton();
}

function signalPartner(eventName, data) {
  socket.timeout(5000).emit(eventName, data, (error, response) => {
    if (error) {
      setStatus("The video connection could not reach the server. Please try again.");
      return;
    }
    if (!response?.success) {
      setStatus(response?.message || "The video signal could not be sent.");
    }
  });
}

function getPeerConnection() {
  if (peerConnection) return peerConnection;
  if (!localStream) {
    throw new Error("Camera and microphone are not ready.");
  }

  const connection = new RTCPeerConnection(peerConfiguration);
  peerConnection = connection;
  localStream.getTracks().forEach(track => connection.addTrack(track, localStream));

  connection.onicecandidate = event => {
    if (event.candidate && isPaired) {
      signalPartner("video:candidate", event.candidate.toJSON());
    }
  };
  connection.ontrack = event => {
    remoteVideo.srcObject = event.streams[0] || new MediaStream([event.track]);
    remoteVideo.play().catch(() => {
      setStatus("The guest video is ready. Press play to start playback.");
    });
  };
  connection.onconnectionstatechange = () => {
    if (peerConnection !== connection) return;
    if (connection.connectionState === "connected") {
      setStatus("Video call connected.");
    } else if (connection.connectionState === "failed") {
      setStatus("Could not establish the video connection. Check your network and try again.");
    } else if (connection.connectionState === "disconnected") {
      setStatus("Video connection interrupted.");
    }
  };

  return connection;
}

async function addPendingCandidates(connection) {
  const candidates = pendingCandidates;
  pendingCandidates = [];
  for (const candidate of candidates) {
    await connection.addIceCandidate(new RTCIceCandidate(candidate));
  }
}

async function handleOffer(offer) {
  if (!isPaired) return;
  try {
    const connection = getPeerConnection();
    await connection.setRemoteDescription(offer);
    await addPendingCandidates(connection);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    signalPartner("video:answer", {
      type: connection.localDescription.type,
      sdp: connection.localDescription.sdp
    });
  } catch (error) {
    console.error("Could not handle video offer:", error);
    setStatus("Could not start the video call. Please leave and try again.");
  }
}

async function handleAnswer(answer) {
  if (!isPaired || !peerConnection) return;
  try {
    await peerConnection.setRemoteDescription(answer);
    await addPendingCandidates(peerConnection);
  } catch (error) {
    console.error("Could not handle video answer:", error);
    setStatus("Could not connect the video call. Please leave and try again.");
  }
}

async function handleCandidate(candidate) {
  if (!isPaired) return;
  try {
    if (!peerConnection?.remoteDescription) {
      pendingCandidates.push(candidate);
      return;
    }
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.error("Could not add video connection candidate:", error);
    setStatus("Could not establish the video connection. Please leave and try again.");
  }
}

startButton.addEventListener("click", async () => {
  if (isSearching || isPaired) {
    endChat();
    setStatus("You left the conversation.");
    return;
  }

  if (!socket.connected) {
    setStatus("Not connected to the server. Please wait and try again.");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Camera and microphone access requires a supported browser and a secure connection.");
    return;
  }

  startButton.disabled = true;
  startButton.textContent = "Requesting camera and microphone...";
  setStatus("Allow camera and microphone access to start a video chat.");

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    if (!socket.connected) {
      stopMedia();
      setStatus("Server connection lost. Please reconnect and try again.");
      return;
    }

    localVideo.srcObject = localStream;
    updateMediaButtons();
    isSearching = true;
    updateStartButton();
    setStatus("Looking for someone to talk to...");
    socket.emit("startVideo");
  } catch (error) {
    console.error("Could not access camera and microphone:", error);
    setStatus(`Could not access camera and microphone: ${error.message}`);
  } finally {
    startButton.disabled = false;
    updateStartButton();
  }
});

microphoneButton.addEventListener("click", () => {
  const tracks = localStream?.getAudioTracks() || [];
  if (!tracks.length) return;
  tracks.forEach(track => {
    track.enabled = !track.enabled;
  });
  updateMediaButtons();
});

cameraButton.addEventListener("click", () => {
  const tracks = localStream?.getVideoTracks() || [];
  if (!tracks.length) return;
  tracks.forEach(track => {
    track.enabled = !track.enabled;
  });
  updateMediaButtons();
});

socket.on("paired", async data => {
  isSearching = false;
  isPaired = true;
  updateStartButton();
  setStatus(data?.partner?.nick
    ? `Connected with ${data.partner.nick}. Starting video...`
    : "Connected with a user. Starting video...");

  if (!data?.initiator) return;
  try {
    const connection = getPeerConnection();
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    signalPartner("video:offer", {
      type: connection.localDescription.type,
      sdp: connection.localDescription.sdp
    });
  } catch (error) {
    console.error("Could not create video offer:", error);
    setStatus("Could not start the video call. Please leave and try again.");
  }
});

socket.on("video:offer", handleOffer);
socket.on("video:answer", handleAnswer);
socket.on("video:candidate", handleCandidate);

socket.on("left", () => {
  endChat(false);
  setStatus("The other user left the conversation.");
});

socket.on("disconnect", () => {
  endChat(false);
  setStatus("Server connection lost. Reconnect and start a new chat.");
});

socket.on("connect", () => {
  if (!isSearching && !isPaired) {
    setStatus("Connected to the server. Start a chat to connect with someone.");
  }
});

updateMediaButtons();
