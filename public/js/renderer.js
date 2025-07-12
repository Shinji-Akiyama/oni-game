class Renderer {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = config;
        this.mapData = null;
        this.images = {};
        this.loadImages();
    }
    
    loadImages() {
        // プレイヤー画像を読み込み
        const playerImage = new Image();
        playerImage.src = '/images/player.png';
        playerImage.onload = () => {
            this.images.player = playerImage;
        };
        
        // 鬼画像を読み込み
        const oniImage = new Image();
        oniImage.src = '/images/oni.png';
        oniImage.onload = () => {
            this.images.oni = oniImage;
        };
    }

    setMapData(mapData) {
        this.mapData = mapData;
    }

    render(gameState, playerId, localPlayerPos = null) {
        if (!gameState || !gameState.players) return;
        
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.config.CANVAS_WIDTH, this.config.CANVAS_HEIGHT);

        let player = gameState.players.find(p => p.id === playerId);
        if (!player) return;
        
        // ローカルプレイヤーの位置を使用（よりスムーズな動き）
        if (localPlayerPos && player.id === playerId) {
            player = { ...player, x: localPlayerPos.x, y: localPlayerPos.y };
        }

        // カメラオフセット計算
        const offsetX = this.config.CANVAS_WIDTH / 2 - player.x;
        const offsetY = this.config.CANVAS_HEIGHT / 2 - player.y;

        this.ctx.save();
        this.ctx.translate(offsetX, offsetY);

        // 床の描画（壁以外）
        if (this.mapData) {
            this.renderFloor(player);
        }

        // プレイヤーとの前後関係を考慮した描画
        if (this.mapData) {
            this.renderWallsAndPlayers(gameState.players, player);
        }

        this.ctx.restore();

        // 視界制限
        this.renderVisionMask(player);
    }

    renderFloor(viewerPlayer) {
        const startX = Math.max(0, Math.floor((viewerPlayer.x - this.config.VISION_RADIUS) / this.config.TILE_SIZE));
        const endX = Math.min(this.mapData[0].length, Math.ceil((viewerPlayer.x + this.config.VISION_RADIUS) / this.config.TILE_SIZE));
        const startY = Math.max(0, Math.floor((viewerPlayer.y - this.config.VISION_RADIUS) / this.config.TILE_SIZE));
        const endY = Math.min(this.mapData.length, Math.ceil((viewerPlayer.y + this.config.VISION_RADIUS) / this.config.TILE_SIZE));

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const tileX = x * this.config.TILE_SIZE;
                const tileY = y * this.config.TILE_SIZE;
                
                const distance = Math.hypot(viewerPlayer.x - (tileX + this.config.TILE_SIZE/2), 
                                          viewerPlayer.y - (tileY + this.config.TILE_SIZE/2));
                
                if (distance <= this.config.VISION_RADIUS) {
                    // 床だけを描画（壁と障害物は後で描画）
                    if (this.mapData[y][x] === 0) {
                        this.ctx.fillStyle = '#CCC';
                        this.ctx.fillRect(tileX, tileY, this.config.TILE_SIZE, this.config.TILE_SIZE);
                    }
                }
            }
        }
    }

    renderWallsAndPlayers(players, viewerPlayer) {
        // Y座標でソートした描画要素のリストを作成
        const renderables = [];
        
        // プレイヤーを追加
        players.forEach(player => {
            renderables.push({
                type: 'player',
                y: player.y,
                data: player
            });
        });
        
        // 視界内の壁と障害物を追加
        const startX = Math.max(0, Math.floor((viewerPlayer.x - this.config.VISION_RADIUS) / this.config.TILE_SIZE));
        const endX = Math.min(this.mapData[0].length, Math.ceil((viewerPlayer.x + this.config.VISION_RADIUS) / this.config.TILE_SIZE));
        const startY = Math.max(0, Math.floor((viewerPlayer.y - this.config.VISION_RADIUS) / this.config.TILE_SIZE));
        const endY = Math.min(this.mapData.length, Math.ceil((viewerPlayer.y + this.config.VISION_RADIUS) / this.config.TILE_SIZE));

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const tileX = x * this.config.TILE_SIZE;
                const tileY = y * this.config.TILE_SIZE;
                const distance = Math.hypot(viewerPlayer.x - (tileX + this.config.TILE_SIZE/2), 
                                          viewerPlayer.y - (tileY + this.config.TILE_SIZE/2));
                
                if (distance <= this.config.VISION_RADIUS) {
                    if (this.mapData[y][x] === 1) {
                        renderables.push({
                            type: 'wall',
                            y: tileY + this.config.TILE_SIZE, // 壁の底辺で判定
                            data: { x: tileX, y: tileY }
                        });
                    } else if (this.mapData[y][x] === 2) {
                        renderables.push({
                            type: 'obstacle',
                            y: tileY + this.config.TILE_SIZE, // 障害物の底辺で判定
                            data: { x: tileX, y: tileY }
                        });
                    }
                }
            }
        }
        
        // Y座標でソート（上から下へ）
        renderables.sort((a, b) => a.y - b.y);
        
        // 描画
        renderables.forEach(item => {
            if (item.type === 'wall') {
                this.renderWall(item.data.x, item.data.y);
            } else if (item.type === 'obstacle') {
                this.renderObstacle(item.data.x, item.data.y);
            } else if (item.type === 'player') {
                this.renderPlayer(item.data, viewerPlayer);
            }
        });
    }
    
    renderWall(tileX, tileY) {
        // 壁の底面（暗い色）
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(tileX, tileY, this.config.TILE_SIZE, this.config.TILE_SIZE);
        // 壁の上面（少し明るい色）を少し小さく描画して立体感を出す
        this.ctx.fillStyle = '#444';
        this.ctx.fillRect(tileX + 2, tileY + 2, this.config.TILE_SIZE - 4, this.config.TILE_SIZE - 4);
    }
    
    renderObstacle(tileX, tileY) {
        // 障害物の底面（暗い茶色）
        this.ctx.fillStyle = '#654321';
        this.ctx.fillRect(tileX, tileY, this.config.TILE_SIZE, this.config.TILE_SIZE);
        // 障害物の上面（明るい茶色）を少し小さく描画して立体感を出す
        this.ctx.fillStyle = '#8B4513';
        this.ctx.fillRect(tileX + 2, tileY + 2, this.config.TILE_SIZE - 4, this.config.TILE_SIZE - 4);
    }
    
    renderPlayer(player, viewerPlayer) {
        const distance = Math.hypot(viewerPlayer.x - player.x, viewerPlayer.y - player.y);
        
        // プレイヤーと鬼は常に表示
        const shouldShowPlayer = player.id === viewerPlayer.id || distance <= this.config.VISION_RADIUS;
        
        if (shouldShowPlayer) {
                // 変身エフェクト
                if (player.transforming) {
                    const elapsed = Date.now() - (player.transformStartTime || Date.now());
                    const progress = Math.min(elapsed / 1500, 1); // 1.5秒で完了
                    
                    // パルスエフェクト
                    const pulseSize = Math.sin(elapsed * 0.01) * 5 + 5;
                    
                    // 赤い光のエフェクト
                    this.ctx.save();
                    this.ctx.globalAlpha = 0.5 + Math.sin(elapsed * 0.02) * 0.3;
                    this.ctx.fillStyle = '#FF0000';
                    this.ctx.beginPath();
                    this.ctx.arc(player.x, player.y, this.config.PLAYER_SIZE + pulseSize, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.restore();
                    
                    // 色の遷移（緑から赤へ）
                    const r = Math.floor(76 + (244 - 76) * progress);
                    const g = Math.floor(175 + (67 - 175) * progress);
                    const b = Math.floor(80 + (54 - 80) * progress);
                    this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                } else {
                    // 通常の色
                    this.ctx.fillStyle = player.type === 'oni' ? '#F44336' : '#4CAF50';
                }
                
                // プレイヤー本体の描画
                const image = player.type === 'oni' ? this.images.oni : this.images.player;
                
                if (image && image.complete) {
                    // 画像がある場合は画像を描画
                    const size = 40;
                    this.ctx.save();
                    
                    // プレイヤーの位置に移動
                    this.ctx.translate(player.x, player.y);
                    
                    // 左向きの場合は反転
                    if (player.direction === 'left') {
                        this.ctx.scale(-1, 1);
                    }
                    
                    // 変身中は少し揺れる
                    if (player.transforming) {
                        const shake = Math.sin(Date.now() * 0.1) * 2;
                        this.ctx.translate(shake, 0);
                    }
                    
                    this.ctx.drawImage(
                        image,
                        -size/2,
                        -size/2,
                        size,
                        size
                    );
                    this.ctx.restore();
                } else {
                    // 鬼の場合は特別な描画
                    if (player.type === 'oni') {
                        this.drawOni(player);
                    } else {
                        // 通常のプレイヤーは円で描画
                        const radius = this.config.PLAYER_SIZE/2;
                        this.ctx.beginPath();
                        this.ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                }

                // 自分の場合は黄色い枠
                if (player.id === viewerPlayer.id) {
                    this.ctx.strokeStyle = '#FFD700';
                    this.ctx.lineWidth = 3;
                    this.ctx.stroke();
                }

                // 名前表示
                this.ctx.fillStyle = 'white';
                this.ctx.font = '18px Arial';
                this.ctx.textAlign = 'center';
                const displayName = player.name === '👹 鬼' ? '👹' : player.name;
                const nameOffset = image && image.complete ? 25 : this.config.PLAYER_SIZE/2 + 10;
                this.ctx.fillText(displayName, player.x, player.y - nameOffset);
                
                // 変身中の「！」マーク
                if (player.transforming) {
                    this.ctx.fillStyle = '#FFFF00';
                    this.ctx.font = 'bold 32px Arial';
                    const markOffset = image && image.complete ? 40 : this.config.PLAYER_SIZE/2 + 25;
                    this.ctx.fillText('！', player.x, player.y - markOffset);
                }
            }
    }

    drawOni(player) {
        const size = this.config.PLAYER_SIZE/2 + 5;
        
        // 鬼の体（赤い円）
        this.ctx.fillStyle = '#F44336';
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, size, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 角を描く
        this.ctx.fillStyle = '#8B0000';
        // 左の角
        this.ctx.beginPath();
        this.ctx.moveTo(player.x - size * 0.5, player.y - size * 0.5);
        this.ctx.lineTo(player.x - size * 0.6, player.y - size * 1.2);
        this.ctx.lineTo(player.x - size * 0.3, player.y - size * 0.7);
        this.ctx.closePath();
        this.ctx.fill();
        
        // 右の角
        this.ctx.beginPath();
        this.ctx.moveTo(player.x + size * 0.5, player.y - size * 0.5);
        this.ctx.lineTo(player.x + size * 0.6, player.y - size * 1.2);
        this.ctx.lineTo(player.x + size * 0.3, player.y - size * 0.7);
        this.ctx.closePath();
        this.ctx.fill();
        
        // 目（怒った目）
        this.ctx.fillStyle = 'white';
        this.ctx.beginPath();
        this.ctx.arc(player.x - size * 0.3, player.y - size * 0.1, size * 0.2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(player.x + size * 0.3, player.y - size * 0.1, size * 0.2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 黒目
        this.ctx.fillStyle = 'black';
        this.ctx.beginPath();
        this.ctx.arc(player.x - size * 0.3, player.y - size * 0.1, size * 0.1, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(player.x + size * 0.3, player.y - size * 0.1, size * 0.1, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 怖い口
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y + size * 0.2, size * 0.4, 0.2 * Math.PI, 0.8 * Math.PI);
        this.ctx.stroke();
    }
    
    renderVisionMask(player) {
        const gradient = this.ctx.createRadialGradient(
            this.config.CANVAS_WIDTH / 2, this.config.CANVAS_HEIGHT / 2, this.config.VISION_RADIUS * 0.8,
            this.config.CANVAS_WIDTH / 2, this.config.CANVAS_HEIGHT / 2, this.config.VISION_RADIUS
        );
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.8)');

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.config.CANVAS_WIDTH, this.config.CANVAS_HEIGHT);
    }
}