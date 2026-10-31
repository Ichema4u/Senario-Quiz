const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static("public"));

const rooms = new Map();
const QUESTIONS = [
  { q: "Your team has 10 minutes before a presentation. The projector stops working. What is the best first move?", a: ["Cancel the presentation", "Check connections and switch to a backup display", "Blame the venue", "Wait for someone else"], correct: 1, why: "A quick diagnosis and a practical backup keeps the presentation moving." },
  { q: "You receive an email asking you to urgently confirm your password through an unfamiliar link. What should you do?", a: ["Click immediately", "Forward it to everyone", "Report it as suspicious and verify through an official channel", "Reply with your password"], correct: 2, why: "Never use an unexpected link to disclose credentials. Verify independently." },
  { q: "Two teammates disagree about how to complete a task. What is the most constructive response?", a: ["Ignore both", "Clarify the goal and compare options against the requirements", "Let the loudest person decide", "Escalate immediately"], correct: 1, why: "A shared goal and clear criteria help resolve disagreement fairly." },
  { q: "You realise you may miss a deadline. What should you do first?", a: ["Say nothing", "Change the deadline yourself", "Tell the relevant people early, explain the impact and propose a recovery plan", "Submit unfinished work without warning"], correct: 2, why: "Early, transparent communication gives the team time to respond." },
  { q: "A stranger asks you to hold their unlocked phone while they step away. What is the safest response?", a: ["Open their messages", "Politely decline and suggest they secure it", "Take it home", "Share your own passcode"], correct: 1, why: "Respect privacy and avoid taking responsibility for an unsecured device." },
  { q: "A customer is frustrated because their issue has not been fixed. What should you do?", a: ["Interrupt them", "Listen, acknowledge the impact and explain the next steps", "Promise an instant fix you cannot guarantee", "End the conversation"], correct: 1, why: "Listening and setting realistic expectations builds trust." },
  { q: "You spot a possible error in a report just before it is shared. What is best?", a: ["Hope nobody notices", "Quietly delete the report", "Flag it promptly, verify the facts and correct the version", "Blame the author publicly"], correct: 2, why: "Raise the issue and correct the record before it spreads." },
  { q: "A team member has gone quiet and a shared task is blocked. What is a good next step?", a: ["Take over without telling them", "Send a clear check-in with the blocker and a reasonable response time", "Wait indefinitely", "Complain to the whole group"], correct: 1, why: "A respectful, specific check-in makes it easier to unblock work." },
  { q: "You find a USB drive in a public place. What should you do?", a: ["Plug it into your work laptop", "Give it to the appropriate lost-property or IT/security team", "Take it home and inspect it", "Leave it in a shared computer"], correct: 1, why: "Unknown USB devices can contain malicious software." },
  { q: "A friend gives you an answer during a solo quiz. What is the fairest action?", a: ["Use it secretly", "Submit your own answer", "Ask the host to change the score", "Share it with only one player"], correct: 1, why: "The game is based on each player's independent answer." }
];

const cleanName = n => String(n || "").trim().replace(/[<>]/g, "").slice(0, 18);
const publicRoom = room => ({
  code: room.code, phase: room.phase, round: room.round, totalRounds: room.totalRounds,
  players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score, answered: room.phase === "question" ? room.answers.has(p.id) : false, isHost: p.id === room.hostId })),
  question: room.phase === "question" ? { q: room.current.q, a: room.current.a } : null,
  secondsLeft: room.phase === "question" ? Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000)) : 0,
  results: room.phase === "results" ? { ...room.lastResults, correctAnswer: room.current.a[room.lastResults.correct] } : null,
  winner: room.phase === "gameover" ? [...room.players.values()].sort((a,b) => b.score-a.score)[0]?.name : null
});
function emitRoom(room) { io.to(room.code).emit("state", publicRoom(room)); }
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do { code = Array.from({length:6}, () => chars[crypto.randomInt(chars.length)]).join(""); } while (rooms.has(code));
  return code;
}
function endQuestion(room) {
  if (room.phase !== "question") return;
  clearTimeout(room.timer);
  const results = [];
  for (const p of room.players.values()) {
    const answer = room.answers.get(p.id);
    const correct = !!answer && answer.choice === room.current.correct;
    const points = correct ? Math.max(50, Math.ceil(Math.max(0, (room.deadline - answer.at) / 1000) * 50)) : 0;
    p.score += points;
    results.push({ id: p.id, name: p.name, choice: answer ? answer.choice : null, correct, points, total: p.score });
  }
  room.lastResults = { correct: room.current.correct, explanation: room.current.why, players: results };
  room.phase = "results";
  emitRoom(room);
  room.nextTimer = setTimeout(() => {
    if (!rooms.has(room.code)) return;
    if (room.round >= room.totalRounds) {
      room.phase = "gameover";
      emitRoom(room);
    } else startQuestion(room);
  }, 6000);
}
function startQuestion(room) {
  clearTimeout(room.timer); clearTimeout(room.nextTimer);
  room.round += 1;
  const q = QUESTIONS[(room.round - 1) % QUESTIONS.length];
  room.current = q; room.answers = new Map(); room.phase = "question";
  room.deadline = Date.now() + 20000;
  emitRoom(room);
  room.timer = setTimeout(() => endQuestion(room), 20000);
  room.tick = setInterval(() => {
    if (room.phase !== "question") { clearInterval(room.tick); return; }
    emitRoom(room);
  }, 1000);
}
io.on("connection", socket => {
  socket.on("create-room", ({name}, cb = () => {}) => {
    const playerName = cleanName(name);
    if (!playerName) return cb({error:"Enter a display name."});
    const code = makeCode(), player = {id:socket.id, name:playerName, score:0};
    const room = {code, hostId:socket.id, players:new Map([[socket.id, player]]), phase:"lobby", round:0, totalRounds:8, answers:new Map(), current:null};
    rooms.set(code, room); socket.join(code); socket.data.room = code;
    cb({ok:true, code}); emitRoom(room);
  });
  socket.on("join-room", ({code, name}, cb = () => {}) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code), playerName = cleanName(name);
    if (!room) return cb({error:"Room not found. Check the code."});
    if (!playerName) return cb({error:"Enter a display name."});
    if (room.phase !== "lobby") return cb({error:"This game has already started."});
    if (room.players.size >= 8) return cb({error:"This room is full (8 players maximum)."});
    if ([...room.players.values()].some(p => p.name.toLowerCase() === playerName.toLowerCase())) return cb({error:"That name is already taken in this room."});
    room.players.set(socket.id, {id:socket.id, name:playerName, score:0});
    socket.join(code); socket.data.room = code;
    cb({ok:true, code}); emitRoom(room);
  });
  socket.on("start-game", cb => {
    const room = rooms.get(socket.data.room);
    if (!room) return cb?.({error:"Room no longer exists."});
    if (room.hostId !== socket.id) return cb?.({error:"Only the host can start the game."});
    if (room.phase !== "lobby" || room.players.size < 2) return cb?.({error:"At least two players are required."});
    room.players.forEach(p => p.score = 0); startQuestion(room); cb?.({ok:true});
  });
  socket.on("submit-answer", ({choice}, cb = () => {}) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.phase !== "question") return cb({error:"This question is no longer active."});
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return cb({error:"Invalid answer."});
    if (!room.players.has(socket.id)) return cb({error:"You are not in this room."});
    if (room.answers.has(socket.id)) return cb({error:"Your answer is already locked in."});
    if (Date.now() >= room.deadline) return cb({error:"Time is up."});
    room.answers.set(socket.id, {choice, at:Date.now()});
    cb({ok:true}); emitRoom(room);
    if (room.answers.size === room.players.size) endQuestion(room);
  });
  socket.on("play-again", cb => {
    const room = rooms.get(socket.data.room);
    if (!room || room.hostId !== socket.id || room.phase !== "gameover") return cb?.({error:"Only the host can start another game."});
    room.players.forEach(p => p.score = 0); room.round = 0; room.lastResults = null; room.phase = "lobby"; emitRoom(room); cb?.({ok:true});
  });
  socket.on("disconnect", () => {
    const code = socket.data.room, room = rooms.get(code);
    if (!room) return;
    room.players.delete(socket.id); room.answers.delete(socket.id);
    if (!room.players.size) {
      clearTimeout(room.timer); clearTimeout(room.nextTimer); clearInterval(room.tick); rooms.delete(code); return;
    }
    if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
    if (room.phase === "question" && room.answers.size === room.players.size) endQuestion(room);
    emitRoom(room);
  });
});
server.listen(PORT, () => console.log(`Scenario Quiz listening on ${PORT}`));