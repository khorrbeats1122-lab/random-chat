import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

function App() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerRef = useRef(null);
  const strangerIdRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [status, setStatus] = useState("READY");
  const [error, setError] = useState("");

  useEffect(() => {
    socket.on("matched", async ({ strangerId, initiator }) => {
      strangerIdRef.current = strangerId;

      setStatus("CONNECTED");

      const peer = createPeerConnection(strangerId);
      peerRef.current = peer;

      if (initiator) {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);

        socket.emit("signal", {
          target: strangerId,
          data: {
            type: "offer",
            offer,
          },
        });
      }
    });

    socket.on("signal", async ({ sender, data }) => {
      const peer = peerRef.current;

      if (!peer) return;

      if (data.type === "offer") {
        await peer.setRemoteDescription(
          new RTCSessionDescription(data.offer)
        );

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        socket.emit("signal", {
          target: sender,
          data: {
            type: "answer",
            answer,
          },
        });
      }

      if (data.type === "answer") {
        await peer.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
      }

      if (data.type === "candidate" && data.candidate) {
        try {
          await peer.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        } catch (error) {
          console.error("ICE error:", error);
        }
      }
    });

    return () => {
      socket.off("matched");
      socket.off("signal");
    };
  }, []);

  function createPeerConnection(strangerId) {
    const peer = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.l.google.com:19302",
        },
      ],
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, localStreamRef.current);
      });
    }

    peer.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", {
          target: strangerId,
          data: {
            type: "candidate",
            candidate: event.candidate,
          },
        });
      }
    };

    peer.onconnectionstatechange = () => {
      console.log("WebRTC:", peer.connectionState);

      if (peer.connectionState === "connected") {
        setStatus("CONNECTED");
      }

      if (
        peer.connectionState === "disconnected" ||
        peer.connectionState === "failed"
      ) {
        setStatus("DISCONNECTED");
      }
    };

    return peer;
  }

  async function startChat() {
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setCameraOn(true);
      setStatus("LOOKING FOR SOMEONE...");

      socket.emit("find-stranger");
    } catch (error) {
      console.error(error);
      setError(`${error.name}: ${error.message}`);
    }
  }

  function toggleMic() {
    if (!localStreamRef.current) return;

    const audioTrack = localStreamRef.current.getAudioTracks()[0];

    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicOn(audioTrack.enabled);
    }
  }

  function stopChat() {
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    strangerIdRef.current = null;

    setCameraOn(false);
    setMicOn(true);
    setStatus("READY");
  }

  return (
    <main className="app">
      <header className="header">
        <div className="logo">RANDOM CHAT</div>

        <div className="status">
          <span className="status-dot"></span>
          {status}
        </div>
      </header>

      <section className="chat">
        <div className="video-box stranger">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="video"
          />

          {!remoteVideoRef.current?.srcObject && (
            <div className="waiting">
              <div className="waiting-circle">?</div>
              <h2>STRANGER</h2>
              <p>{status === "LOOKING FOR SOMEONE..." ? "Looking for someone..." : "Waiting..."}</p>
            </div>
          )}
        </div>

        <div className="video-box you">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="video"
          />

          {!cameraOn && (
            <div className="camera-off">
              <div className="camera-icon">📹</div>
              <p>Your camera is off</p>
            </div>
          )}

          <div className="label">YOU</div>
        </div>
      </section>

      {!cameraOn ? (
        <button className="start-button" onClick={startChat}>
          START CHAT
        </button>
      ) : (
        <div className="controls">
          <button className="control" onClick={toggleMic}>
            {micOn ? "🎤" : "🔇"}
          </button>

          <button className="next-button" onClick={stopChat}>
            NEXT →
          </button>

          <button className="control" onClick={stopChat}>
            📹
          </button>
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </main>
  );
}

export default App;