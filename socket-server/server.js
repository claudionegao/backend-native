
// server.js
import { createServer } from "http";
import { Server } from "socket.io";
import crypto from "crypto";

const PORT = process.env.PORT || 3000;

const httpServer = createServer((req, res) => {
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
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
});

/** Estado dos pareamentos em memória */
const pairs = new Map(); // pairId -> { members: Set, values: {}, confirmed: Set, lastResult: {} }

/** util: cria um ID curto aleatório */
function makePairId() {
  return crypto.randomBytes(3).toString("hex"); // 6 chars
}

/** helper: calcula resultado final */
function computeResult(pair) {
  const ids = [...pair.members];
  if (ids.length !== 2) return null;
  const [idA, idB] = ids;
  const a = pair.values[idA];
  const b = pair.values[idB];
  if (typeof a !== "number" || typeof b !== "number") return null;
  const avg = Math.round((a + b) / 2);
  return { a, b, avg, at: new Date().toISOString() };
}

io.on("connection", (socket) => {
  console.log("🔌 conectado:", socket.id);

  // ping/pong (do seu exemplo)
  socket.on("ping", (data) => {
    socket.emit("pong", { ...data, serverAt: new Date().toISOString() });
  });

  /** Criar pareamento */
  socket.on("pair:create", (_, cb) => {
    const pairId = makePairId();
    const state = {
      members: new Set([socket.id]),
      values: {},
      confirmed: new Set(),
      lastResult: null,
    };
    pairs.set(pairId, state);

    socket.join(pairId);
    console.log(`👫 pair:create ${pairId} by ${socket.id}`);
    cb?.({ ok: true, pairId, role: "A" });
  });

  /** Entrar no pareamento via pairId (QR) */
  socket.on("pair:join", ({ pairId }, cb) => {
    const state = pairs.get(pairId);
    if (!state) {
      cb?.({ ok: false, error: "PAIR_NOT_FOUND" });
      return;
    }
    if (state.members.size >= 2) {
      cb?.({ ok: false, error: "PAIR_FULL" });
      return;
    }
    state.members.add(socket.id);
    socket.join(pairId);
    console.log(`👫 pair:join ${pairId} by ${socket.id}`);

    // notifica sala que agora tem 2
    io.to(pairId).emit("pair:ready", { pairId, count: state.members.size });
    cb?.({ ok: true, role: "B" });
  });

  /** Atualizar valor do slider (não divulgar ao parceiro) */
  socket.on("vote:update", ({ pairId, value }, cb) => {
    const state = pairs.get(pairId);
    if (!state || !state.members.has(socket.id)) {
      cb?.({ ok: false, error: "INVALID_PAIR_OR_MEMBER" });
      return;
    }
    const v = Math.max(0, Math.min(100, Number(value)));
    state.values[socket.id] = v;
    // ao mudar valor, se já estava confirmado, desconfirma
    if (state.confirmed.has(socket.id)) {
      state.confirmed.delete(socket.id);
    }
    cb?.({ ok: true });
  });

  /** Confirmar voto; se os dois confirmaram e ambos têm valores, envia o resultado */
  socket.on("vote:confirm", ({ pairId }, cb) => {
    const state = pairs.get(pairId);
    if (!state || !state.members.has(socket.id)) {
      cb?.({ ok: false, error: "INVALID_PAIR_OR_MEMBER" });
      return;
    }
    state.confirmed.add(socket.id);

    if (state.confirmed.size === 2) {
      const result = computeResult(state);
      if (result) {
        state.lastResult = result;
        io.to(pairId).emit("vote:result", { pairId, ...result });
      } else {
        // dados incompletos; mantém confirmação?
        // opção: limpar confirmações
        state.confirmed.clear();
      }
    }
    cb?.({ ok: true });
  });

  /** Resetar votação */
  socket.on("vote:reset", ({ pairId }, cb) => {
    const state = pairs.get(pairId);
    if (!state || !state.members.has(socket.id)) {
      cb?.({ ok: false, error: "INVALID_PAIR_OR_MEMBER" });
      return;
    }
    state.values = {};
    state.confirmed.clear();
    state.lastResult = null;
    io.to(pairId).emit("vote:reset", { pairId });
    cb?.({ ok: true });
  });

  /** Cleanup ao desconectar */
  socket.on("disconnect", (reason) => {
    console.log("❌ desconectado:", socket.id, reason);
    // remover o socket de qualquer pair
    for (const [pairId, state] of pairs.entries()) {
      if (state.members.delete(socket.id)) {
        // se sala ficou vazia, remove
        if (state.members.size === 0) {
          pairs.delete(pairId);
        } else {
          // se sobrou 1 membro, desconfirma e limpa resultado
          state.confirmed.clear();
          state.lastResult = null;
          io.to(pairId).emit("pair:member_left", { pairId, count: state.members.size });
        }
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Socket.IO rodando na porta ${PORT}`);
});
