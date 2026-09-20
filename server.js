import { Server } from "socket.io";

const PORT = process.env.PORT || 3001;

const io = new Server(PORT, {
  cors: {
    origin: "*",
  },
});

console.log(`Signaling server running on port ${PORT}`);

let waitingUser = null;

const partners = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("find-stranger", () => {
    if (partners.has(socket.id)) {
      const oldPartner = partners.get(socket.id);

      partners.delete(socket.id);
      partners.delete(oldPartner);

      io.to(oldPartner).emit("stranger-left");
    }

    if (waitingUser && waitingUser !== socket.id) {
      const stranger = waitingUser;
      waitingUser = null;

      partners.set(socket.id, stranger);
      partners.set(stranger, socket.id);

      io.to(stranger).emit("matched", {
        strangerId: socket.id,
        initiator: true,
      });

      io.to(socket.id).emit("matched", {
        strangerId: stranger,
        initiator: false,
      });

      console.log(
        `Matched ${stranger} with ${socket.id}`
      );
    } else {
      waitingUser = socket.id;

      console.log(
        `User waiting: ${socket.id}`
      );
    }
  });

  socket.on("signal", ({ target, data }) => {
    if (!target) return;

    io.to(target).emit("signal", {
      sender: socket.id,
      data,
    });
  });

  socket.on("next", () => {
    const partner = partners.get(socket.id);

    if (partner) {
      partners.delete(socket.id);
      partners.delete(partner);

      io.to(partner).emit("stranger-left");
    }

    if (waitingUser === socket.id) {
      waitingUser = null;
    }

    socket.emit("ready-for-next");
  });

  socket.on("disconnect", () => {
    if (waitingUser === socket.id) {
      waitingUser = null;
    }

    const partner = partners.get(socket.id);

    if (partner) {
      partners.delete(socket.id);
      partners.delete(partner);

      io.to(partner).emit("stranger-left");
    }

    console.log(
      `User disconnected: ${socket.id}`
    );
  });
});