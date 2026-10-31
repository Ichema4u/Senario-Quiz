const socket = io();
const $ = id => document.getElementById(id);
let myRoom = null, isHost = false, myAnswer = null, latestState = null;
const sections = ["lobby","question","results","gameover"];
function showError(id, msg=""){ $(id).textContent = msg; }
function rpc(event, data) { return new Promise(resolve => socket.emit(event, data, resolve)); }
function showGame() { $("home").classList.add("hidden"); $("game").classList.remove("hidden"); }
function enterHome() { $("game").classList.add("hidden"); $("home").classList.remove("hidden"); }
$("create").onclick = async () => {
  showError("home-error");
  const r = await rpc("create-room", {name:$("name").value});
  if (r.error) return showError("home-error", r.error);
  myRoom = r.code; isHost = true; showGame();
};
$("join").onclick = async () => {
  showError("home-error");
  const r = await rpc("join-room", {code:$("code").value, name:$("name").value});
  if (r.error) return showError("home-error", r.error);
  myRoom = r.code; isHost = false; showGame();
};
$("code").addEventListener("input", e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""));
$("start").onclick = async () => { const r = await rpc("start-game"); if (r?.error) showError("game-error",r.error); };
$("again").onclick = async () => { const r = await rpc("play-again"); if (r?.error) showError("game-error",r.error); };
$("copy").onclick = async () => {
  try { await navigator.clipboard.writeText(myRoom); $("copy").textContent = "✓"; setTimeout(()=>$("copy").textContent="▢",1200); }
  catch { $("copy").textContent = myRoom; }
};
function renderPlayers(players) {
  $("players").innerHTML = players.map((p,i)=>`<div class="player"><span class="avatar">${escapeHtml(p.name[0].toUpperCase())}</span>${escapeHtml(p.name)}${p.isHost?'<span class="host-tag">HOST</span>':''}</div>`).join("");
  $("lobby-note").textContent = players.length < 2 ? "Waiting for another player…" : `${players.length} players ready. ${isHost ? "You're the host — start when ready." : "Waiting for the host to start."}`;
  $("start").classList.toggle("hidden", !isHost);
  $("start").disabled = players.length < 2;
  $("start").style.opacity = players.length < 2 ? ".5" : "1";
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function showPhase(phase) { sections.forEach(s => $(s).classList.toggle("hidden",s!==phase)); }
function renderScore(players) {
  $("score-strip").innerHTML = [...players].sort((a,b)=>b.score-a.score).map(p=>`<div class="score-chip">${escapeHtml(p.name)} <b>${p.score}</b></div>`).join("");
}
function renderResults(data, players, final=false) {
  const sorted = [...(data?.players || players.map(p=>({...p,points:0,total:p.score})))].sort((a,b)=>(b.total??b.score)-(a.total??a.score));
  const html = sorted.map((p,i)=>`<div class="result-row"><span class="rank">#${i+1}</span><span class="result-name">${escapeHtml(p.name)}</span><span class="result-detail">${p.correct===undefined?"":p.correct?"✓ Correct":"✕ Incorrect"}</span><span class="points">${final?(p.total??p.score):`+${p.points}`}</span></div>`).join("");
  $(final?"final-results":"round-results").innerHTML = html;
}
socket.on("state", state => {
  latestState = state; myRoom = state.code; showGame();
  $("room-code").textContent = state.code;
  $("game-title").textContent = state.phase === "lobby" ? "Waiting room" : `Round ${state.round}`;
  $("phase-label").textContent = ({lobby:"WAITING ROOM",question:"QUESTION LIVE",results:"ROUND RESULTS",gameover:"FINAL RESULTS"})[state.phase];
  showPhase(state.phase);
  if (state.phase === "lobby") renderPlayers(state.players);
  if (state.phase === "question") {
    if (state.round !== window.currentRound) { myAnswer = null; window.currentRound = state.round; }
    $("round").textContent = `ROUND ${state.round} / ${state.totalRounds}`;
    $("answered").textContent = `${state.players.filter(p=>p.answered).length} / ${state.players.length} ANSWERED`;
    $("prompt").textContent = state.question.q;
    $("timer").textContent = state.secondsLeft;
    $("timer").classList.toggle("urgent",state.secondsLeft<=5);
    $("answers").innerHTML = state.question.a.map((a,i)=>`<button class="answer ${myAnswer===i?"selected":""}" data-choice="${i}" ${myAnswer!==null?"disabled":""}><span class="letter">${"ABCD"[i]}</span>${escapeHtml(a)}</button>`).join("");
    $("answers").querySelectorAll("button").forEach(btn=>btn.onclick=async()=>{
      const choice=Number(btn.dataset.choice), r=await rpc("submit-answer",{choice});
      if(r.error) showError("game-error",r.error); else {myAnswer=choice; $("answers").querySelectorAll("button").forEach(b=>{b.disabled=true;if(Number(b.dataset.choice)===choice)b.classList.add("selected");});$("answer-note").textContent="Answer locked in. Waiting for the reveal…";}
    });
    $("answer-note").textContent = myAnswer===null ? "Choose carefully. Your answer is private until the reveal." : "Answer locked in. Waiting for the reveal…";
    renderScore(state.players);
  }
  if (state.phase === "results") {
    const correct = state.results.correct;
    $("correct-answer").textContent = `✓ ${"ABCD"[correct]} — ${escapeHtml(state.results.correctAnswer)}`;
    $("explanation").textContent = state.results.explanation;
    renderResults(state.results, state.players);
  }
  if (state.phase === "gameover") {
    $("winner").textContent = `🎉 ${state.winner || "No winner"} wins!`;
    renderResults(null,state.players,true);
    $("again").classList.toggle("hidden", !state.players.some(p=>p.isHost));
  }
});
socket.on("connect",()=>{ if (myRoom) showError("game-error","Connection restored. If the room has expired, create a new one."); });
socket.on("disconnect",()=>showError("game-error","Connection lost. Reconnecting…"));
