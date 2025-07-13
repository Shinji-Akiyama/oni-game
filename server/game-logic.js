const { mapData, CONFIG } = require('./map-data');
const AIController = require('./ai-controller');

class GameLogic {
    constructor(io) {
        this.io = io;
        this.gameState = {
            players: [],
            timeRemaining: CONFIG.GAME_DURATION,
            gameStatus: 'waiting', // waiting, playing, finished
            commentaryMessages: [],
            rooms: {} // ルームごとのゲーム状態を管理
        };
        this.aiController = new AIController(this);
        this.gameLoopInterval = null;
    }

    createRoom(roomId) {
        this.gameState.rooms[roomId] = {
            players: [],
            timeRemaining: CONFIG.GAME_DURATION,
            gameStatus: 'waiting',
            commentaryMessages: [],
            lowSurvivorWarned: false,
            aiIdCounter: 1,
            transformingPlayers: new Set()
        };
    }

    joinGame(socket, playerName, roomId) {
        console.log('受信したプレイヤー名:', playerName);
        console.log('プレイヤー名の長さ:', playerName.length);
        
        // ルームが存在しない場合は作成
        if (!this.gameState.rooms[roomId]) {
            this.createRoom(roomId);
        }

        let room = this.gameState.rooms[roomId];
        
        // ゲームが終了している場合は新しいゲームを作成
        if (room.gameStatus === 'finished') {
            this.createRoom(roomId);
            room = this.gameState.rooms[roomId];
        }
        
        // 既にゲームが進行中の場合は参加拒否
        if (room.gameStatus === 'playing') {
            socket.emit('join_failed', { reason: 'ゲームは既に開始されています' });
            return;
        }

        // 人間プレイヤーとして追加
        const playerPos = this.getRandomSpawnPosition(room);
        const newPlayer = {
            id: socket.id,
            name: playerName,
            x: playerPos.x,
            y: playerPos.y,
            type: 'human',
            isAI: false,
            lastMoveTime: Date.now(),
            captureCount: 0,
            stuckTime: 0,
            lastPosition: { x: playerPos.x, y: playerPos.y },
            stuckCheckTimer: 0,
            aiTarget: null,
            roomId: roomId,
            transforming: false,
            canMove: true,
            transformStartTime: null,
            direction: 'right'
        };

        room.players.push(newPlayer);
        socket.join(roomId);
        socket.roomId = roomId;

        socket.emit('join_success', { playerId: socket.id, roomId: roomId });
        this.io.to(roomId).emit('player_joined', { player: newPlayer });

        // 最初のプレイヤーが参加したらゲームを開始
        if (room.players.filter(p => !p.isAI).length === 1) {
            this.startGame(roomId);
        }
    }

    startGame(roomId) {
        const room = this.gameState.rooms[roomId];
        room.gameStatus = 'playing';
        room.timeRemaining = CONFIG.GAME_DURATION;

        // AIプレイヤーを追加
        const humanPlayers = room.players.filter(p => !p.isAI).length;
        const aiCount = CONFIG.MAX_PLAYERS - humanPlayers - 1; // -1は鬼の分

        for (let i = 0; i < aiCount; i++) {
            const pos = this.getRandomSpawnPosition(room);
            room.players.push({
                id: `ai_${roomId}_${room.aiIdCounter++}`,
                name: `AI_${i + 1}`,
                x: pos.x,
                y: pos.y,
                type: 'human',
                isAI: true,
                lastMoveTime: Date.now(),
                aiTarget: null,
                aiLastDirection: { x: 0, y: 0 },
                captureCount: 0,
                roomId: roomId,
                transforming: false,
                canMove: true,
                transformStartTime: null,
                direction: 'right'
            });
        }

        // 鬼を追加
        const oniPos = this.getRandomSpawnPosition(room);
        room.players.push({
            id: `oni_${roomId}_1`,
            name: '👹 鬼',
            x: oniPos.x,
            y: oniPos.y,
            type: 'oni',
            isAI: true,
            lastMoveTime: Date.now(),
            aiTarget: null,
            aiLastDirection: { x: 0, y: 0 },
            captureCount: 0,
            stuckTime: 0,
            lastPosition: { x: oniPos.x, y: oniPos.y },
            stuckCheckTimer: 0,
            roomId: roomId,
            transforming: false,
            canMove: true,
            transformStartTime: null,
            direction: 'right'
        });

        // 実況
        const humanPlayerNames = room.players.filter(p => !p.isAI).map(p => p.name).join('、');
        this.addCommentary(roomId, `${humanPlayerNames}さんを含む${CONFIG.MAX_PLAYERS}人が参戦！`, 'info');
        this.addCommentary(roomId, '恐ろしい鬼が徘徊している...', 'warning');

        this.io.to(roomId).emit('game_started', {
            players: room.players.map(p => ({
                id: p.id,
                name: p.name,
                x: p.x,
                y: p.y,
                type: p.type,
                isAI: p.isAI,
                transforming: p.transforming,
                transformStartTime: p.transformStartTime,
                canMove: p.canMove,
                direction: p.direction || 'right',
                captureCount: p.captureCount || 0
            })),
            mapData: mapData
        });

        // ゲームループ開始
        if (!this.gameLoopInterval) {
            this.gameLoopInterval = setInterval(() => this.updateGame(), 1000 / 60);
        }
    }

    updateGame() {
        try {
            Object.keys(this.gameState.rooms).forEach(roomId => {
                const room = this.gameState.rooms[roomId];
                if (!room || room.gameStatus !== 'playing') return;

            // タイマー更新
            const prevTime = Math.ceil(room.timeRemaining);
            room.timeRemaining -= 1/60;
            const currentTime = Math.ceil(room.timeRemaining);
            
            // 時間警告の実況
            if (prevTime !== currentTime) {
                if (currentTime === 30) {
                    this.addCommentary(roomId, '⏰ 残り30秒！折り返し地点！', 'warning');
                } else if (currentTime === 15) {
                    this.addCommentary(roomId, '⏰ 残り15秒！緊迫の展開！', 'warning');
                } else if (currentTime === 5) {
                    this.addCommentary(roomId, '⏰ ラスト5秒！！', 'warning');
                }
            }
            
            if (room.timeRemaining <= 0) {
                this.addCommentary(roomId, '🎉 時間切れ！人間側の勝利！', 'info');
                this.endGame(roomId, 'humans');
                return;
            }

            // AI更新
            room.players.forEach(player => {
                if (player.isAI) {
                    this.aiController.updateAI(player, room);
                }
            });

            // 感染チェック
            this.checkInfections(roomId);

            // 勝敗判定
            const humans = room.players.filter(p => p.type === 'human');
            if (humans.length === 0) {
                this.addCommentary(roomId, '💀 プレイヤー全滅...', 'capture');
                this.endGame(roomId, 'oni');
                return;
            } else if (humans.length <= 3 && !room.lowSurvivorWarned) {
                if (humans.length === 1) {
                    this.addCommentary(roomId, `⚠️ 最後の1人！${humans[0].name}が孤軍奮闘！`, 'warning');
                } else {
                    this.addCommentary(roomId, `⚠️ 生存者残り${humans.length}人！`, 'warning');
                }
                room.lowSurvivorWarned = true;
            }

            // ゲーム状態を送信（directionを含む全プレイヤー情報を送信）
            this.io.to(roomId).emit('game_state', {
                players: room.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    x: p.x,
                    y: p.y,
                    type: p.type,
                    isAI: p.isAI,
                    transforming: p.transforming,
                    transformStartTime: p.transformStartTime,
                    canMove: p.canMove,
                    direction: p.direction || 'right',
                    captureCount: p.captureCount || 0
                })),
                timeRemaining: room.timeRemaining,
                gameStatus: room.gameStatus
            });
        });
        } catch (error) {
            console.error('Error in updateGame:', error);
            console.error('Stack trace:', error.stack);
        }
    }

    handlePlayerInput(socket, inputData) {
        const roomId = socket.roomId;
        if (!roomId || !this.gameState.rooms[roomId]) return;

        const room = this.gameState.rooms[roomId];
        const player = room.players.find(p => p.id === socket.id);
        if (!player || room.gameStatus !== 'playing') {
            return;
        }
        
        // 変身中は移動不可
        if (player.transforming || player.canMove === false) return;
        
        // 最後の入力から最低16ms（約60FPS）経過していない場合はスキップ
        const currentTime = Date.now();
        if (currentTime - player.lastMoveTime < 16) return;

        const speed = CONFIG.HUMAN_SPEED; // 全員同じ速度に統一
        let dx = 0, dy = 0;

        // 鬼になったプレイヤーの膠着状態検知
        if (player.type === 'oni') {
            player.stuckCheckTimer += 1/60;
            
            if (player.stuckCheckTimer >= CONFIG.STUCK_CHECK_INTERVAL) {
                const moveDistance = Math.hypot(
                    player.x - player.lastPosition.x,
                    player.y - player.lastPosition.y
                );
                
                if (moveDistance < CONFIG.STUCK_MOVE_THRESHOLD) {
                    player.stuckTime += CONFIG.STUCK_CHECK_INTERVAL;
                } else {
                    player.stuckTime = 0;
                }
                
                player.lastPosition = { x: player.x, y: player.y };
                player.stuckCheckTimer = 0;
            }
            
            if (player.stuckTime >= CONFIG.STUCK_TIME_THRESHOLD) {
                this.addCommentary(roomId, `💡 ${player.name}が戦術を変更！`, 'warning');
                player.stuckTime = 0;
            }
        }

        // 入力処理 - 複数キーの同時押しに対応
        if (inputData.keys) {
            // 斜め移動対応
            if (inputData.keys.up || inputData.keys.w) dy -= speed;
            if (inputData.keys.down || inputData.keys.s) dy += speed;
            if (inputData.keys.left || inputData.keys.a) dx -= speed;
            if (inputData.keys.right || inputData.keys.d) dx += speed;
            
            // 斜め移動時の速度を正規化（√2で割る）
            if (dx !== 0 && dy !== 0) {
                const factor = 0.707; // 1/√2
                dx *= factor;
                dy *= factor;
            }
        } else {
            // 旧形式の入力（後方互換性のため）
            switch(inputData.direction) {
                case 'up': dy = -speed; break;
                case 'down': dy = speed; break;
                case 'left': dx = -speed; break;
                case 'right': dx = speed; break;
            }
        }

        if (inputData.mobileInput) {
            dx = inputData.mobileInput.x * speed;
            dy = inputData.mobileInput.y * speed;
        }
        
        // マウス入力処理
        if (inputData.mouseInput) {
            // プレイヤーの画面上の位置を計算（画面中央）
            const screenPlayerX = CONFIG.CANVAS_WIDTH / 2;
            const screenPlayerY = CONFIG.CANVAS_HEIGHT / 2;
            
            // マウス位置への方向ベクトルを計算
            const diffX = inputData.mouseInput.x - screenPlayerX;
            const diffY = inputData.mouseInput.y - screenPlayerY;
            const distance = Math.hypot(diffX, diffY);
            
            // 最小距離（この距離以下では移動しない）
            const minDistance = 10;
            
            if (distance > minDistance) {
                // 方向を正規化して速度を掛ける
                dx = (diffX / distance) * speed;
                dy = (diffY / distance) * speed;
            }
        }

        if (dx !== 0 || dy !== 0) {
            const newX = player.x + dx;
            const newY = player.y + dy;

            if (!this.isWall(newX, player.y)) player.x = newX;
            if (!this.isWall(player.x, newY)) player.y = newY;

            // 境界チェック
            player.x = Math.max(CONFIG.PLAYER_SIZE/2, Math.min(CONFIG.MAP_WIDTH - CONFIG.PLAYER_SIZE/2, player.x));
            player.y = Math.max(CONFIG.PLAYER_SIZE/2, Math.min(CONFIG.MAP_HEIGHT - CONFIG.PLAYER_SIZE/2, player.y));
            
            // 移動方向を記録
            if (dx > 0) {
                player.direction = 'right';
            } else if (dx < 0) {
                player.direction = 'left';
            }
        }

        player.lastMoveTime = Date.now();
    }

    checkInfections(roomId) {
        const room = this.gameState.rooms[roomId];
        if (!room || !room.players) return;
        
        const onis = room.players.filter(p => p.type === 'oni' && !p.transforming);
        const humans = room.players.filter(p => p.type === 'human' && !p.transforming);

        // 処理中のプレイヤーIDを記録（重複処理を防ぐ）
        const processingPlayers = new Set();
        
        onis.forEach(oni => {
            humans.forEach(human => {
                // 既に処理中の場合はスキップ
                if (processingPlayers.has(human.id)) return;
                
                const distance = Math.hypot(oni.x - human.x, oni.y - human.y);
                if (distance < CONFIG.INFECTION_DISTANCE && !human.transforming && human.type === 'human') {
                    processingPlayers.add(human.id);
                    // 変身開始
                    human.transforming = true;
                    human.transformStartTime = Date.now();
                    human.canMove = false; // 移動不可
                    
                    // IDを保存（参照エラーを防ぐため）
                    const humanId = human.id;
                    const oniId = oni.id;
                    
                    // 捕獲者の捕獲数を増やす
                    oni.captureCount = (oni.captureCount || 0) + 1;
                    
                    // 実況メッセージ
                    const capturerName = oni.name === '👹 鬼' ? '鬼' : oni.name;
                    this.addCommentary(roomId, `💀 ${human.name}が${capturerName}に捕まった！`, 'capture');
                    
                    // 連続捕獲の実況
                    if (oni.captureCount >= 3) {
                        this.addCommentary(roomId, `🔥 ${capturerName}が${oni.captureCount}人目を捕獲！`, 'capture');
                    }
                    
                    // 変身エフェクト開始を通知
                    this.io.to(roomId).emit('player_transforming', {
                        playerId: humanId,
                        infectorId: oniId
                    });
                    
                    // 1.5秒後に変身完了
                    setTimeout(() => {
                        // ルームの存在確認
                        const currentRoom = this.gameState.rooms[roomId];
                        if (!currentRoom) return;
                        
                        // プレイヤーの存在確認（IDで検索）
                        const humanPlayer = currentRoom.players.find(p => p.id === humanId);
                        if (humanPlayer && humanPlayer.transforming) {
                            humanPlayer.type = 'oni';
                            humanPlayer.transforming = false;
                            humanPlayer.canMove = true;
                            
                            // 鬼になったプレイヤーに膠着状態検知システムを初期化
                            humanPlayer.stuckTime = 0;
                            humanPlayer.lastPosition = { x: humanPlayer.x, y: humanPlayer.y };
                            humanPlayer.stuckCheckTimer = 0;
                            humanPlayer.aiTarget = null;
                            
                            this.io.to(roomId).emit('player_infected', {
                                playerId: humanPlayer.id,
                                infectorId: oniId
                            });
                        }
                    }, 1500);
                }
            });
        });
    }

    endGame(roomId, winner) {
        const room = this.gameState.rooms[roomId];
        room.gameStatus = 'finished';
        
        const survivors = room.players.filter(p => p.type === 'human');
        const captureRanking = room.players
            .filter(p => p.type === 'oni')
            .sort((a, b) => b.captureCount - a.captureCount)
            .map(p => ({ name: p.name, count: p.captureCount }));

        this.io.to(roomId).emit('game_end', {
            winner: winner,
            survivors: survivors.map(s => s.name),
            captureRanking: captureRanking
        });

        // ルームをクリーンアップ（ゲームループは継続）
        setTimeout(() => {
            if (this.gameState.rooms[roomId] && this.gameState.rooms[roomId].gameStatus === 'finished') {
                delete this.gameState.rooms[roomId];
            }
        }, 10000);
    }

    addCommentary(roomId, message, type = 'info') {
        const room = this.gameState.rooms[roomId];
        if (!room) return;

        room.commentaryMessages.push({ message, type, timestamp: Date.now() });
        
        // 最大10件まで保持
        if (room.commentaryMessages.length > 10) {
            room.commentaryMessages.shift();
        }

        this.io.to(roomId).emit('commentary', { message, type });
    }

    getRandomSpawnPosition(room) {
        let x, y;
        let attempts = 0;
        const maxAttempts = 50;
        
        do {
            x = Math.random() * (CONFIG.MAP_WIDTH - 100) + 50;
            y = Math.random() * (CONFIG.MAP_HEIGHT - 100) + 50;
            attempts++;
            
            if (attempts > maxAttempts) {
                const safePositions = [
                    { x: 150, y: 150 },
                    { x: 1050, y: 150 },
                    { x: 150, y: 750 },
                    { x: 1050, y: 750 },
                    { x: 600, y: 450 }
                ];
                const randomSafe = safePositions[Math.floor(Math.random() * safePositions.length)];
                return randomSafe;
            }
        } while (this.isWall(x, y) || this.isNearOtherPlayers(x, y, room));
        
        return { x, y };
    }

    isNearOtherPlayers(x, y, room) {
        return room.players.some(player => {
            const distance = Math.hypot(x - player.x, y - player.y);
            return distance < CONFIG.SPAWN_MIN_DISTANCE;
        });
    }

    isWall(x, y) {
        const tileX = Math.floor(x / CONFIG.TILE_SIZE);
        const tileY = Math.floor(y / CONFIG.TILE_SIZE);
        
        if (tileY < 0 || tileY >= mapData.length || tileX < 0 || tileX >= mapData[0].length) {
            return true;
        }
        
        return mapData[tileY][tileX] === 1 || mapData[tileY][tileX] === 2;
    }

    handleDisconnect(socket) {
        const roomId = socket.roomId;
        if (!roomId || !this.gameState.rooms[roomId]) return;

        const room = this.gameState.rooms[roomId];
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        
        if (playerIndex !== -1) {
            const player = room.players[playerIndex];
            room.players.splice(playerIndex, 1);
            
            this.io.to(roomId).emit('player_disconnected', { playerId: socket.id });
            this.addCommentary(roomId, `${player.name}が退出しました`, 'info');

            // 人間プレイヤーがいなくなったらルームを削除
            if (room.players.filter(p => !p.isAI).length === 0) {
                delete this.gameState.rooms[roomId];
            }
        }
    }
}

module.exports = GameLogic;