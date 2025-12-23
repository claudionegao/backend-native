
// server.js
import { createServer } from "http";
import { Server } from "socket.io";
import { handleData } from "./handledata";

const PORT = process.env.PORT || 3000;

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end();
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

const io = new Server(httpServer, {
  path: "/socket.io", // explícito (combina com o cliente)
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
});

io.on("connection", (socket) => {
  console.log("🔌 conectado:", socket.id);

  // ping/pong (do seu exemplo)
  socket.on("ping", (data) => {
    socket.emit("pong", { ...data, serverAt: new Date().toISOString() });
  });

  socket.on('message', (data) => {
    socket.emit('message',data)
  })
  /** Cleanup ao desconectar */
  socket.on("disconnect", (reason) => {
    console.log("❌ desconectado:", socket.id, reason);
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Socket.IO rodando na porta ${PORT}`);
});
