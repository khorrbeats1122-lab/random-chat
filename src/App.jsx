import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const socket = io("https://random-chat-server-q733.onrender.com");

export default function App() {
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const localStream = useRef(null);
  const peer = useRef(null);
  const audioSender = useRef(null);
  const micTrack = useRef(null);
  const countdownTimer = useRef(null);

  const [started, setStarted] = useState(false);
  const [searching, setSearching] = useState(false);
  const [connected, setConnected] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(15);
  const [disconnectedMessage, setDisconnectedMessage] =
    useState(false);

  useEffect(() => {
    const handleMatch = ({ strangerId, initiator }) => {
      setSearching(false);
      setDisconnectedMessage(false);
      setCountdown(15);

      const connection = createPeer(strangerId);
      peer.current = connection;

      if (initiator) {
        connection
          .createOffer()
          .then((offer) =>
            connection.setLocalDescription(offer)
          )
          .then(() => {
            socket.emit("signal", {
              target: strangerId,
              data: {
                type: "offer",
                offer: connection.localDescription,
              },
            });
          })
          .catch((err) => {
            console.error("Offer error:", err);
          });
      }
    };

    const handleSignal = async ({ sender, data }) => {
      if (!peer.current) return;

      try {
        if (data.type === "offer") {
          await peer.current.setRemoteDescription(
            new RTCSessionDescription(data.offer)
          );

          const answer =
            await peer.current.createAnswer();

          await peer.current.setLocalDescription(answer);

          socket.emit("signal", {
            target: sender,
            data: {
              type: "answer",
              answer,
            },
          });
        }

        if (data.type === "answer") {
          await peer.current.setRemoteDescription(
            new RTCSessionDescription(data.answer)
          );
        }

        if (
          data.type === "candidate" &&
          data.candidate
        ) {
          await peer.current.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        }
      } catch (err) {
        console.error("Signal error:", err);
      }
    };

    const handleStrangerLeft = () => {
      clearCountdown();

      closePeer();

      if (remoteVideo.current) {
        remoteVideo.current.srcObject = null;
      }

      setConnected(false);
      setCountdown(15);
      setDisconnectedMessage(true);
      setSearching(false);

      setTimeout(() => {
        setDisconnectedMessage(false);
        setSearching(true);

        socket.emit("find-stranger");
      }, 1800);
    };

    socket.on("matched", handleMatch);
    socket.on("signal", handleSignal);
    socket.on("stranger-left", handleStrangerLeft);

    return () => {
      socket.off("matched", handleMatch);
      socket.off("signal", handleSignal);
      socket.off(
        "stranger-left",
        handleStrangerLeft
      );

      clearCountdown();
    };
  }, []);

  useEffect(() => {
    if (!connected) {
      clearCountdown();
      return;
    }

    setCountdown(15);

    countdownTimer.current = setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          clearCountdown();

          setTimeout(() => {
            nextStranger();
          }, 0);

          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => {
      clearCountdown();
    };
  }, [connected]);

  function clearCountdown() {
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
  }

  function createPeer(strangerId) {
    const connection = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.l.google.com:19302",
        },
      ],
    });

    if (localStream.current) {
      localStream.current
        .getTracks()
        .forEach((track) => {
          const sender = connection.addTrack(
            track,
            localStream.current
          );

          if (track.kind === "audio") {
            audioSender.current = sender;
            micTrack.current = track;
          }
        });
    }

    connection.ontrack = (event) => {
      if (
        remoteVideo.current &&
        event.streams[0]
      ) {
        remoteVideo.current.srcObject =
          event.streams[0];

        remoteVideo.current.volume = 1;
        remoteVideo.current.muted = false;
      }

      setConnected(true);
      setSearching(false);
      setDisconnectedMessage(false);
      setCountdown(15);
    };

    connection.onicecandidate = (event) => {
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

    connection.onconnectionstatechange = () => {
      if (
        connection.connectionState ===
        "connected"
      ) {
        setConnected(true);
        setSearching(false);
        setDisconnectedMessage(false);
        setCountdown(15);
      }

      if (
        connection.connectionState ===
          "failed" ||
        connection.connectionState ===
          "closed"
      ) {
        setConnected(false);
      }
    };

    return connection;
  }

  function closePeer() {
    clearCountdown();

    if (peer.current) {
      peer.current.ontrack = null;
      peer.current.onicecandidate = null;
      peer.current.close();
      peer.current = null;
    }

    audioSender.current = null;
  }

  async function startChat() {
    setError("");

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: true,
            audio: true,
          }
        );

      localStream.current = stream;

      const audioTrack =
        stream.getAudioTracks()[0];

      micTrack.current = audioTrack;

      if (localVideo.current) {
        localVideo.current.srcObject =
          stream;
      }

      setStarted(true);
      setSearching(true);
      setConnected(false);
      setMicOn(true);
      setDisconnectedMessage(false);
      setCountdown(15);

      socket.emit("find-stranger");
    } catch (err) {
      console.error(
        "Camera/microphone error:",
        err
      );

      setError(
        `${err.name}: ${err.message}`
      );
    }
  }

  async function toggleMic() {
    if (!micTrack.current) {
      setError(
        "Microphone is not available."
      );
      return;
    }

    try {
      if (micOn) {
        micTrack.current.enabled = false;

        if (audioSender.current) {
          await audioSender.current.replaceTrack(
            null
          );
        }

        setMicOn(false);
      } else {
        micTrack.current.enabled = true;

        if (audioSender.current) {
          await audioSender.current.replaceTrack(
            micTrack.current
          );
        }

        setMicOn(true);
      }
    } catch (err) {
      console.error(
        "Microphone error:",
        err
      );
    }
  }

  function nextStranger() {
    clearCountdown();
    closePeer();

    if (remoteVideo.current) {
      remoteVideo.current.srcObject = null;
    }

    setConnected(false);
    setSearching(true);
    setDisconnectedMessage(false);
    setCountdown(15);

    socket.emit("next");

    setTimeout(() => {
      socket.emit("find-stranger");
    }, 100);
  }

  function stopChat() {
    clearCountdown();
    closePeer();

    if (localStream.current) {
      localStream.current
        .getTracks()
        .forEach((track) =>
          track.stop()
        );

      localStream.current = null;
    }

    if (localVideo.current) {
      localVideo.current.srcObject = null;
    }

    if (remoteVideo.current) {
      remoteVideo.current.srcObject = null;
    }

    socket.emit("next");

    setStarted(false);
    setSearching(false);
    setConnected(false);
    setMicOn(true);
    setCountdown(15);
    setDisconnectedMessage(false);
    micTrack.current = null;
  }

  return (
    <main className="app">
      <section className="stranger-screen">
        <video
          ref={remoteVideo}
          className="stranger-video"
          autoPlay
          playsInline
        />

        {!connected && (
          <div className="search-screen">
            <img
              src="/strangr-logo.png"
              alt="STRANGR"
              className="search-logo"
            />

            {disconnectedMessage ? (
              <>
                <div className="question-mark">
                  !
                </div>

                <h2>
                  Person disconnected
                </h2>

                <p>
                  Finding someone new...
                </p>
              </>
            ) : searching ? (
              <>
                <div className="loader" />

                <h2>
                  Finding someone...
                </h2>

                <p>
                  Searching for your next chat
                </p>
              </>
            ) : (
              <>
                <div className="question-mark">
                  ?
                </div>

                <h2>
                  Meet someone new
                </h2>

                <p>
                  Press START to begin
                </p>
              </>
            )}
          </div>
        )}

        {connected && (
          <div className="countdown">
            NEXT IN {countdown}
          </div>
        )}

        <div className="stranger-info">
          <div className="avatar">
            ?
          </div>

          <div>
            <strong>
              STRANGER
            </strong>

            <span>
              {connected
                ? "Connected"
                : "Random chat"}
            </span>
          </div>
        </div>
      </section>

      <div className="self-view">
        <video
          ref={localVideo}
          className="self-video"
          autoPlay
          playsInline
          muted
        />

        {!started && (
          <div className="camera-placeholder">
            📹
          </div>
        )}

        <div className="you-label">
          YOU
        </div>
      </div>

      {!started ? (
        <button
          className="start-chat"
          onClick={startChat}
        >
          START CHAT
        </button>
      ) : (
        <div className="controls">
          <button
            className={`round-button ${
              !micOn ? "muted" : ""
            }`}
            onClick={toggleMic}
          >
            {micOn ? "🎤" : "🔇"}
          </button>

          <button
            className="next-button"
            onClick={nextStranger}
          >
            NEXT →
          </button>

          <button
            className="home-button"
            onClick={stopChat}
          >
            HOME
          </button>
        </div>
      )}

      {error && (
        <div className="error">
          {error}
        </div>
      )}
    </main>
  );
}