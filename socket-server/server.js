import { createServer } from "http";
import { Server } from "socket.io";

const PORT = process.env.PORT || 3000;

const httpServer = createServer((req, res) => {
  // health check simples
  if (req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["polling", "websocket"], // importante
});

io.on("connection", (socket) => {
  console.log("🔌 conectado:", socket.id);

  socket.on("ping", (data) => {
    socket.emit("pong", {
      ...data,
      serverAt: new Date().toISOString(),
    });
  });

  socket.on("disconnect", (reason) => {
    console.log("❌ desconectado:", socket.id, reason);
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Socket.IO rodando na porta ${PORT}`);
});
