class GameClient {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.gameState = {
            players: [],
            timeRemaining: 60,
            gameStatus: 'waiting'
        };
        this.config = {
            CANVAS_WIDTH: 1024,
            CANVAS_HEIGHT: 768,
            MAP_WIDTH: 1200,
            MAP_HEIGHT: 900,
            TILE_SIZE: 30,
            PLAYER_SIZE: 30,
            VISION_RADIUS: 300,
            HUMAN_SPEED: 3,
            ONI_SPEED: 3,
            INFECTION_DISTANCE: 25
        };
        
        this.renderer = null;
        this.inputManager = null;
        this.canvas = null;
        this.animationId = null;
        this.lastInputTime = 0;
        this.inputInterval = 1000 / 60; // 60 FPS for input（サーバーと同じ）
        this.lastInput = null;
        this.localPlayerPosition = null;
        this.inputIntervalId = null;
    }

    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new Renderer(this.canvas, this.config);
        this.inputManager = new InputManager(this);
        
        // スクロールを完全に防ぐ
        window.addEventListener('wheel', (e) => {
            e.preventDefault();
        }, { passive: false });
        
        // ゲームキャンバス上でのタッチスクロールのみ防ぐ
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
        
        // Enterキーでゲーム開始
        const playerNameInput = document.getElementById('playerName');
        if (playerNameInput) {
            playerNameInput.addEventListener('keypress', (e) => {
                if (e && e.key === 'Enter') {
                    this.startGame();
                }
            });
        }
    }

    connect(playerName, roomId = 'default') {
        console.log('入力された名前:', playerName);
        console.log('名前の長さ:', playerName.length);
        console.log('ルームID:', roomId);

        // Socket.io接続（App Engine対応）
        this.socket = io({
            transports: ['polling', 'websocket'], // Cloud Runは両方サポート
            upgrade: true, // WebSocketへのアップグレードを有効化
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        
        
        // イベントリスナー設定
        this.setupSocketListeners();
        
        // ゲームに参加
        this.socket.emit('join_game', { 
            playerName: playerName,
            roomId: roomId
        });
    }
    
    startGame() {
        // 後方互換性のため残す
        const nameInput = document.getElementById('playerName');
        const playerName = nameInput.value.trim();
        
        if (!playerName) {
            alert('プレイヤー名を入力してください');
            return;
        }
        
        this.connect(playerName, 'default');
    }

    setupSocketListeners() {
        // 参加成功
        this.socket.on('join_success', (data) => {
            this.playerId = data.playerId;
            document.getElementById('startScreen').style.display = 'none';
            document.getElementById('gameScreen').style.display = 'block';
        });

        // 参加失敗
        this.socket.on('join_failed', (data) => {
            alert(data.reason);
        });

        // ゲーム開始
        this.socket.on('game_started', (data) => {
            this.gameState.players = data.players;
            this.renderer.setMapData(data.mapData);
            this.updatePlayerList();
            this.startGameLoop();
        });

        // ゲーム状態更新
        this.socket.on('game_state', (data) => {
            this.gameState = data;
            this.updateUI();
            
        });

        // 実況メッセージ
        this.socket.on('commentary', (data) => {
            this.addCommentary(data.message, data.type);
        });

        // プレイヤー変身開始
        this.socket.on('player_transforming', (data) => {
            // 変身エフェクトの開始
            const player = this.gameState.players.find(p => p.id === data.playerId);
            if (player) {
                player.transforming = true;
                player.transformStartTime = Date.now();
            }
        });
        
        // プレイヤー感染
        this.socket.on('player_infected', (data) => {
            if (data.playerId === this.playerId) {
                setTimeout(() => {
                    this.addCommentary('🔄 あなたも鬼の仲間入り！', 'warning');
                }, 1000);
            }
        });

        // ゲーム終了
        this.socket.on('game_end', (data) => {
            this.endGame(data);
        });

        // プレイヤー切断
        this.socket.on('player_disconnected', (data) => {
            console.log('Player disconnected:', data.playerId);
        });
    }

    startGameLoop() {
        // 既存のゲームループがある場合は停止
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        // 既存の入力インターバルがある場合はクリア
        if (this.inputIntervalId) {
            clearInterval(this.inputIntervalId);
        }
        
        const gameLoop = () => {
            // 描画（60 FPS）
            this.renderer.render(this.gameState, this.playerId);
            
            this.animationId = requestAnimationFrame(gameLoop);
        };
        
        // 入力処理をサーバーと同じ60FPSで実行
        this.inputIntervalId = setInterval(() => {
            this.processInput();
        }, 1000 / 60); // 60FPSで入力チェック（サーバーと同じ）
        
        gameLoop();
    }
    
    processInput() {
        if (!this.socket || !this.socket.connected) return;
        
        const currentTime = Date.now();
        
        // 前回の送信から最低16ms（約60FPS）待つ
        if (currentTime - this.lastInputTime < 16) return;
        
        const input = this.inputManager.getInput();
        
        // 入力がある場合のみ送信
        if (input.keys || input.mobileInput || input.mouseInput) {
            this.socket.emit('player_input', input);
            this.lastInputTime = currentTime;
        }
    }

    updateUI() {
        // タイマー更新
        document.getElementById('timeRemaining').textContent = Math.ceil(this.gameState.timeRemaining);
        
        // 生存者数更新
        const humans = this.gameState.players.filter(p => p.type === 'human');
        document.getElementById('survivorCount').textContent = humans.length;
        
        // プレイヤーリスト更新
        this.updatePlayerList();
    }

    updatePlayerList() {
        const listElement = document.getElementById('playerList');
        listElement.innerHTML = '';

        this.gameState.players.forEach(player => {
            const item = document.createElement('div');
            item.className = 'player-item';

            const icon = document.createElement('div');
            icon.className = `player-icon ${player.type}`;
            if (player.id === this.playerId) {
                icon.classList.add('you');
            }

            const name = document.createElement('span');
            const displayText = `${player.name}${player.id === this.playerId ? ' (YOU)' : ''}`;
            name.textContent = displayText;
            
            // デバッグ用
            if (player.id === this.playerId) {
                console.log('プレイヤーリストに表示される名前:', player.name);
            }

            item.appendChild(icon);
            item.appendChild(name);
            listElement.appendChild(item);
        });
    }

    addCommentary(message, type = 'info') {
        const commentaryContent = document.getElementById('commentaryContent');
        if (!commentaryContent) return;
        
        const item = document.createElement('div');
        item.className = `commentary-item commentary-${type}`;
        item.textContent = message;
        
        commentaryContent.appendChild(item);
        
        // 最大10個まで保持
        const items = commentaryContent.children;
        if (items.length > 10) {
            commentaryContent.removeChild(items[0]);
        }
        
        // 自動スクロール
        commentaryContent.scrollTop = commentaryContent.scrollHeight;
    }

    endGame(data) {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        const player = this.gameState.players.find(p => p.id === this.playerId);
        
        // 結果画面の表示
        const resultScreen = document.getElementById('resultScreen');
        const resultTitle = document.getElementById('resultTitle');
        const resultStats = document.getElementById('resultStats');
        const survivorList = document.getElementById('survivorList');
        
        if (data.winner === 'humans') {
            if (player.type === 'human') {
                resultTitle.textContent = '🎉 勝利！';
                resultTitle.className = 'result-title victory';
                resultStats.innerHTML = `
                    <div>おめでとう！60秒間逃げ切りました！</div>
                    <div>生存時間: 60秒</div>
                `;
            } else {
                resultTitle.textContent = '😔 敗北';
                resultTitle.className = 'result-title defeat';
                resultStats.innerHTML = `
                    <div>鬼になってしまいましたが、他の人間が逃げ切りました</div>
                    <div>あなたの捕獲数: ${player.captureCount || 0}人</div>
                    <div>最終結果: 人間側の勝利</div>
                `;
            }
            
            survivorList.innerHTML = `
                <h4>🏆 生存者一覧</h4>
                ${data.survivors.map(s => `<div>${s}</div>`).join('')}
            `;
        } else {
            // 全員鬼化
            const topCatcher = data.captureRanking[0];
            
            if (player.name === topCatcher.name) {
                resultTitle.textContent = '👑 最多捕獲！';
                resultTitle.className = 'result-title victory';
                resultStats.innerHTML = `
                    <div>プレイヤーは全滅しました。</div>
                    <div>あなたが最も多く捕獲しました！</div>
                    <div>捕獲数: ${player.captureCount || 0}人</div>
                `;
            } else if (player.type === 'oni') {
                resultTitle.textContent = '💀 全滅';
                resultTitle.className = 'result-title defeat';
                resultStats.innerHTML = `
                    <div>プレイヤーは全滅しました。</div>
                    <div>あなたの捕獲数: ${player.captureCount || 0}人</div>
                    <div>最多捕獲: ${topCatcher.name} (${topCatcher.count}人)</div>
                `;
            } else {
                resultTitle.textContent = '💀 全滅';
                resultTitle.className = 'result-title defeat';
                resultStats.innerHTML = `
                    <div>プレイヤーは全滅しました。</div>
                    <div>最多捕獲: ${topCatcher.name} (${topCatcher.count}人)</div>
                `;
            }
            
            // 鬼の捕獲ランキング
            survivorList.innerHTML = `
                <h4>👹 鬼の捕獲ランキング</h4>
                ${data.captureRanking.map((oni, index) => 
                    `<div>${index + 1}位: ${oni.name} - ${oni.count}人捕獲 ${index === 0 ? '👑' : ''}</div>`
                ).join('')}
            `;
        }
        
        // 1秒後に結果画面を表示
        setTimeout(() => {
            resultScreen.style.display = 'flex';
        }, 1000);
    }

    restartGame() {
        document.getElementById('resultScreen').style.display = 'none';
        
        // 実況をリセット
        const commentaryContent = document.getElementById('commentaryContent');
        if (commentaryContent) {
            commentaryContent.innerHTML = '';
        }
        
        // 既存の名前を使って直接ゲームを再開
        const playerName = this.gameState.players.find(p => p.id === this.playerId)?.name || 'Player';
        
        // Socket.io接続がまだ有効な場合は再利用
        if (this.socket && this.socket.connected) {
            // 新しいゲームに参加
            this.socket.emit('join_game', { 
                playerName: playerName,
                roomId: 'default'
            });
        } else {
            // 接続が切れている場合は再接続
            this.socket = io();
            this.setupSocketListeners();
            this.socket.emit('join_game', { 
                playerName: playerName,
                roomId: 'default'
            });
        }
    }
}

// グローバル変数と関数
let gameClient = null;
let currentPlayerName = '';
let socket = null;

function showRoomSelect() {
    const playerName = document.getElementById('playerName').value.trim();
    if (!playerName) {
        alert('プレイヤー名を入力してください');
        return;
    }
    
    currentPlayerName = playerName;
    document.getElementById('startScreen').style.display = 'none';
    document.getElementById('roomSelectScreen').style.display = 'flex';
    
    // Socket接続してルーム一覧を取得
    if (!socket) {
        socket = io({
            transports: ['polling', 'websocket'],
            upgrade: true,
            reconnection: true
        });
        
        socket.on('room_list', (rooms) => {
            updateRoomList(rooms);
        });
        
        socket.emit('get_rooms');
    }
}

function updateRoomList(rooms) {
    const roomListDiv = document.getElementById('roomList');
    roomListDiv.innerHTML = '';
    
    if (rooms.length === 0) {
        roomListDiv.innerHTML = '<p style="color: #666;">アクティブなルームがありません</p>';
        return;
    }
    
    rooms.forEach(room => {
        const roomDiv = document.createElement('div');
        roomDiv.className = 'room-item';
        roomDiv.innerHTML = `
            <div class="room-info">
                <div class="room-name">ルーム: ${room.id}</div>
                <div class="room-players">${room.playerCount}/10 プレイヤー</div>
            </div>
            <button class="join-button" onclick="joinRoomById('${room.id}')" ${room.playerCount >= 10 ? 'disabled' : ''}>
                ${room.playerCount >= 10 ? '満員' : '参加'}
            </button>
        `;
        roomListDiv.appendChild(roomDiv);
    });
}

function createNewRoom() {
    const roomId = generateRoomId();
    startGameWithRoom(roomId);
}

function joinRoom() {
    const roomCode = document.getElementById('roomCodeInput').value.trim();
    if (!roomCode) {
        alert('ルームコードを入力してください');
        return;
    }
    startGameWithRoom(roomCode);
}

function joinRoomById(roomId) {
    startGameWithRoom(roomId);
}

function startGameWithRoom(roomId) {
    document.getElementById('roomSelectScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'block';
    
    gameClient = new GameClient();
    gameClient.connect(currentPlayerName, roomId);
}

function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let roomId = '';
    for (let i = 0; i < 6; i++) {
        roomId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return roomId;
}

function backToStart() {
    document.getElementById('roomSelectScreen').style.display = 'none';
    document.getElementById('startScreen').style.display = 'block';
}

function startGame() {
    // 互換性のため残す
    showRoomSelect();
}

function restartGame() {
    location.reload();
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    gameClient = new GameClient();
    gameClient.init();
});

// グローバル関数（HTMLから呼び出し用）
function startGame() {
    if (gameClient) {
        gameClient.startGame();
    }
}

function restartGame() {
    if (gameClient) {
        gameClient.restartGame();
    }
}