import { Server } from "socket.io";

const io = new Server(3001, {
  cors: {
    origin: "*",
  },
});

console.log("Signaling server running on port 3001");

let waitingUser = null;

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("find-stranger", () => {
    if (waitingUser && waitingUser !== socket.id) {
      const stranger = waitingUser;
      waitingUser = null;

      io.to(stranger).emit("matched", {
        strangerId: socket.id,
        initiator: true,
      });

      io.to(socket.id).emit("matched", {
        strangerId: stranger,
        initiator: false,
      });

      console.log("Matched:", stranger, socket.id);
    } else {
      waitingUser = socket.id;
      console.log("Waiting:", socket.id);
    }
  });

  socket.on("signal", ({ target, data }) => {
    io.to(target).emit("signal", {
      sender: socket.id,
      data,
    });
  });

  socket.on("disconnect", () => {
    if (waitingUser === socket.id) {
      waitingUser = null;
    }

    console.log("User disconnected:", socket.id);
  });
});