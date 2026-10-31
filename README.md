# Scenario Quiz

A real-time, room-code multiplayer quiz for 2–8 players. Built with Node.js, Express and Socket.IO.

## Rules
- 2–8 players per room; six-character room code.
- Host starts when at least two players have joined.
- Eight multiple-choice scenario rounds, each with a 20-second server-controlled timer.
- One private answer per player per round.
- Correct answers score `max(50, ceil(remaining_seconds × 50))`; wrong or missing answers score zero.
- Answers and explanation are revealed after everyone answers or time expires.
- Six seconds between results and the next round.
- Highest total score wins. The host can start another game.

## Run locally
Requires Node.js 20+.

```bash
npm install
npm start
```

Open http://localhost:3000. For a local network test, use the computer's LAN IP address on the other devices (same Wi-Fi).

## Deploy publicly (Render)
1. Create a GitHub repository and upload this project.
2. In Render, choose **New → Web Service**, connect the repository.
3. Set Build Command to `npm install` and Start Command to `npm start`.
4. Choose a Node runtime and deploy. Render supplies the public HTTPS URL.
5. Share that URL; players join with the room code shown in the game.

The app uses Socket.IO over WebSockets with a server-side room state and timer. The server must remain running for active games. This starter uses in-memory rooms: active rooms are lost if the server restarts, and a single server instance is intended. For a scaled multi-instance deployment, add a Socket.IO Redis adapter and shared room persistence.

## Security / integrity notes
- Correct answers never go to clients during the question phase.
- Scores and timers are calculated by the server.
- Display names are sanitised and limited to 18 characters.
- No accounts or personal information are required.
