class InputManager {
    constructor(gameClient) {
        this.gameClient = gameClient;
        this.keys = {};
        this.mobileInput = { x: 0, y: 0 };
        this.mouseInput = { x: 0, y: 0, active: false };
        this.isDragging = false;
        this.padCenterX = 100;
        this.padCenterY = 100;
        
        this.setupKeyboardControls();
        this.setupMobileControls();
        this.setupMouseControls();
    }

    setupKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            if (e && e.key) {
                const key = e.key.toLowerCase();
                // 矢印キーとWASDでのスクロールを防ぐ
                if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
                    e.preventDefault();
                }
                this.keys[key] = true;
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e && e.key) {
                const key = e.key.toLowerCase();
                this.keys[key] = false;
            }
        });
    }

    setupMobileControls() {
        const virtualPad = document.getElementById('virtualPad');
        const padStick = document.getElementById('padStick');
        
        if (!virtualPad || !padStick) return;
        
        const handleStart = (e) => {
            e.preventDefault();
            this.isDragging = true;
            const rect = virtualPad.getBoundingClientRect();
            this.padCenterX = rect.width / 2;
            this.padCenterY = rect.height / 2;
        };
        
        const handleMove = (e) => {
            if (!this.isDragging) return;
            e.preventDefault();
            
            const rect = virtualPad.getBoundingClientRect();
            const touch = e.touches ? e.touches[0] : e;
            const x = touch.clientX - rect.left - this.padCenterX;
            const y = touch.clientY - rect.top - this.padCenterY;
            
            const distance = Math.min(Math.sqrt(x * x + y * y), 70);
            const angle = Math.atan2(y, x);
            
            const stickX = Math.cos(angle) * distance;
            const stickY = Math.sin(angle) * distance;
            
            padStick.style.transform = `translate(${stickX}px, ${stickY}px)`;
            
            // 入力値を正規化
            this.mobileInput.x = distance > 10 ? stickX / 70 : 0;
            this.mobileInput.y = distance > 10 ? stickY / 70 : 0;
        };
        
        const handleEnd = (e) => {
            e.preventDefault();
            this.isDragging = false;
            padStick.style.transform = 'translate(0px, 0px)';
            this.mobileInput.x = 0;
            this.mobileInput.y = 0;
        };
        
        // タッチイベント
        virtualPad.addEventListener('touchstart', handleStart, { passive: false });
        virtualPad.addEventListener('touchmove', handleMove, { passive: false });
        virtualPad.addEventListener('touchend', handleEnd, { passive: false });
        
        // マウスイベント（PC上でのテスト用）
        virtualPad.addEventListener('mousedown', handleStart);
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
    }
    
    setupMouseControls() {
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) return;
        
        // マウスダウンで移動開始
        canvas.addEventListener('mousedown', (e) => {
            this.mouseInput.active = true;
            this.updateMousePosition(e);
        });
        
        // マウス移動
        canvas.addEventListener('mousemove', (e) => {
            if (this.mouseInput.active) {
                this.updateMousePosition(e);
            }
        });
        
        // マウスアップで移動停止
        canvas.addEventListener('mouseup', () => {
            this.mouseInput.active = false;
        });
        
        // マウスがキャンバスから離れたら停止
        canvas.addEventListener('mouseleave', () => {
            this.mouseInput.active = false;
        });
    }
    
    updateMousePosition(e) {
        const canvas = document.getElementById('gameCanvas');
        const rect = canvas.getBoundingClientRect();
        this.mouseInput.x = e.clientX - rect.left;
        this.mouseInput.y = e.clientY - rect.top;
    }

    getInput() {
        // 複数キーの同時押しに対応
        const keyState = {
            up: this.keys['w'] || this.keys['arrowup'],
            down: this.keys['s'] || this.keys['arrowdown'],
            left: this.keys['a'] || this.keys['arrowleft'],
            right: this.keys['d'] || this.keys['arrowright'],
            w: this.keys['w'],
            s: this.keys['s'],
            a: this.keys['a'],
            d: this.keys['d']
        };
        
        // モバイル入力がある場合は優先
        const hasMobileInput = Math.abs(this.mobileInput.x) > 0.1 || Math.abs(this.mobileInput.y) > 0.1;
        
        // キー入力がある場合
        const hasKeyInput = keyState.up || keyState.down || keyState.left || keyState.right;
        
        return {
            keys: hasKeyInput ? keyState : null,
            direction: 'none', // 後方互換性のため残す
            mobileInput: hasMobileInput ? { ...this.mobileInput } : null,
            mouseInput: this.mouseInput.active ? { ...this.mouseInput } : null,
            timestamp: Date.now()
        };
    }
}