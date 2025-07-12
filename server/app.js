const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const GameLogic = require('./game-logic');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// CSPヘッダーを設定（開発環境用）
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "font-src 'self'; " +
        "img-src 'self' data:; " +
        "connect-src 'self' ws: wss:;"
    );
    next();
});

// 静的ファイルの配信
app.use(express.static(path.join(__dirname, '../public')));

// ゲームロジックの初期化
const gameLogic = new GameLogic(io);

// Socket.io接続処理
io.on('connection', (socket) => {
    console.log('New player connected:', socket.id);

    // プレイヤー参加
    socket.on('join_game', (data) => {
        const { playerName, roomId = 'default' } = data;
        gameLogic.joinGame(socket, playerName, roomId);
    });

    // プレイヤー入力
    socket.on('player_input', (data) => {
        gameLogic.handlePlayerInput(socket, data);
    });

    // 切断処理
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        gameLogic.handleDisconnect(socket);
    });
});

// サーバー起動
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Game URL: http://localhost:${PORT}`);
});