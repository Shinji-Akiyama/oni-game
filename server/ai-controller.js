const { CONFIG } = require('./map-data');

class AIController {
    constructor(gameLogic) {
        this.gameLogic = gameLogic;
    }

    updateAI(player, gameState) {
        if (!player || !player.isAI) return;
        if (!gameState || !gameState.players) return;
        
        // 変身中は移動不可
        if (player.transforming || player.canMove === false) return;

        try {
            const speed = CONFIG.HUMAN_SPEED; // 全員同じ速度に統一
            let dx = 0, dy = 0;

            if (player.type === 'oni') {
                const movement = this.updateOniAI(player, gameState, speed);
                dx = movement.dx;
                dy = movement.dy;
            } else {
                const movement = this.updateHumanAI(player, gameState, speed);
                dx = movement.dx;
                dy = movement.dy;
            }

        // 移動実行（プレイヤーと同じ処理）
        if (dx !== 0 || dy !== 0) {
            const newX = player.x + dx;
            const newY = player.y + dy;

            if (!this.gameLogic.isWall(newX, player.y)) player.x = newX;
            if (!this.gameLogic.isWall(player.x, newY)) player.y = newY;

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
        } catch (error) {
            console.error('Error in updateAI:', error, player);
        }
    }

    updateOniAI(player, gameState, speed) {
        const humans = gameState.players.filter(p => p.type === 'human');
        const otherOnis = gameState.players.filter(p => p.type === 'oni' && p.id !== player.id);
        
        // 膠着状態検知
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
        
        let targetDx = 0, targetDy = 0;
        let separationDx = 0, separationDy = 0;
        
        // ターゲット選択（膠着時は強制変更）
        let currentTarget = player.aiTarget;
        
        if (humans.length > 0) {
            if (!currentTarget || player.stuckTime >= CONFIG.STUCK_TIME_THRESHOLD || !humans.find(h => h.id === currentTarget.id)) {
                if (player.stuckTime >= CONFIG.STUCK_TIME_THRESHOLD) {
                    this.gameLogic.addCommentary(`👹 鬼がターゲットを変更！`, 'warning');
                    player.stuckTime = 0;
                }
                
                const availableTargets = humans.filter(h => h.id !== (currentTarget ? currentTarget.id : ''));
                
                if (availableTargets.length > 0) {
                    currentTarget = availableTargets.reduce((closest, human) => {
                        const dist1 = Math.hypot(player.x - human.x, player.y - human.y);
                        const dist2 = Math.hypot(player.x - closest.x, player.y - closest.y);
                        return dist1 < dist2 ? human : closest;
                    });
                } else {
                    currentTarget = humans[0];
                }
                
                player.aiTarget = currentTarget;
            }

            // ターゲットに向かう
            if (currentTarget) {
                const distance = Math.hypot(player.x - currentTarget.x, player.y - currentTarget.y);
                if (distance > 0) {
                    targetDx = ((currentTarget.x - player.x) / distance) * speed;
                    targetDy = ((currentTarget.y - player.y) / distance) * speed;
                }
                
                // 膠着状態の場合は迂回行動
                if (player.stuckTime >= CONFIG.DETOUR_START_TIME) {
                    const detourAngle = Math.sin(Date.now() * 0.01) * Math.PI * 0.5;
                    const detourDx = Math.cos(detourAngle) * speed * 0.6;
                    const detourDy = Math.sin(detourAngle) * speed * 0.6;
                    targetDx += detourDx;
                    targetDy += detourDy;
                }
            }
        }
        
        // 分離行動
        otherOnis.forEach(otherOni => {
            const distance = Math.hypot(player.x - otherOni.x, player.y - otherOni.y);
            if (distance < CONFIG.SEPARATION_DISTANCE && distance > 0) {
                const separationForce = Math.pow((CONFIG.SEPARATION_DISTANCE - distance) / CONFIG.SEPARATION_DISTANCE, 2);
                separationDx += ((player.x - otherOni.x) / distance) * separationForce * CONFIG.SEPARATION_STRENGTH * speed;
                separationDy += ((player.y - otherOni.y) / distance) * separationForce * CONFIG.SEPARATION_STRENGTH * speed;
            }
        });
        
        // 個性的な移動パターン
        let personalityDx = 0, personalityDy = 0;
        const playerNum = parseInt(player.id.replace(/\D/g, '')) || 1;
        
        if (playerNum % 4 === 1) {
            personalityDx = Math.sin(Date.now() * 0.001 + playerNum) * speed * 0.3;
            personalityDy = Math.cos(Date.now() * 0.001 + playerNum) * speed * 0.3;
        } else if (playerNum % 4 === 2) {
            personalityDx = -Math.sin(Date.now() * 0.001 + playerNum) * speed * 0.3;
            personalityDy = -Math.cos(Date.now() * 0.001 + playerNum) * speed * 0.3;
        } else if (playerNum % 4 === 3) {
            personalityDx = Math.sin(Date.now() * 0.005 + playerNum) * speed * 0.4;
            personalityDy = 0;
        }
        
        // 各行動の重み付け合成
        let dx, dy;
        if (Math.hypot(separationDx, separationDy) > 0.5) {
            dx = targetDx * 0.3 + separationDx * 1.2 + personalityDx * 0.2;
            dy = targetDy * 0.3 + separationDy * 1.2 + personalityDy * 0.2;
        } else {
            dx = targetDx * 0.8 + separationDx * 0.5 + personalityDx * 0.4;
            dy = targetDy * 0.8 + separationDy * 0.5 + personalityDy * 0.4;
        }
        
        // 速度制限
        const totalSpeed = Math.hypot(dx, dy);
        if (totalSpeed > speed) {
            dx = (dx / totalSpeed) * speed;
            dy = (dy / totalSpeed) * speed;
        }
        
        return { dx, dy };
    }

    updateHumanAI(player, gameState, speed) {
        const onis = gameState.players.filter(p => p.type === 'oni');
        const nearbyOni = onis.find(oni => 
            Math.hypot(player.x - oni.x, player.y - oni.y) < CONFIG.VISION_RADIUS
        );

        let dx = 0, dy = 0;

        if (nearbyOni) {
            // 鬼が近くにいる場合は逃げる
            const distance = Math.hypot(player.x - nearbyOni.x, player.y - nearbyOni.y);
            if (distance > 0) {
                dx = ((player.x - nearbyOni.x) / distance) * speed;
                dy = ((player.y - nearbyOni.y) / distance) * speed;
            }
        } else {
            // ランダム移動
            if (Math.random() < 0.1) {
                const angle = Math.random() * Math.PI * 2;
                player.aiLastDirection = {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed
                };
            }
            dx = player.aiLastDirection.x || 0;
            dy = player.aiLastDirection.y || 0;
        }

        return { dx, dy };
    }
}

module.exports = AIController;