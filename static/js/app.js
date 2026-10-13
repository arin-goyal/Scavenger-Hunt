/**
 * Main Game Application Controller
 * Orchestrates rounds, countdown timer, scoring system, hints, and UI views.
 */
class ScavengerApp {
    constructor() {
        this.gameState = null;
        this.timerInterval = null;
        this.timeRemaining = 60;
        this.isRoundOver = false;

        // Subsystems
        this.camera = null;
        this.detector = null;

        // Elements
        this.views = {
            landing: document.getElementById('view-landing'),
            game: document.getElementById('view-game'),
            roundResult: document.getElementById('view-round-result'),
            finalScorecard: document.getElementById('view-final-scorecard'),
        };

        this.hud = {
            roundBadge: document.getElementById('hud-round'),
            timer: document.getElementById('hud-timer'),
            score: document.getElementById('hud-score'),
            telemetry: document.getElementById('hud-telemetry'),
        };

        this.riddle = {
            card: document.getElementById('riddle-card'),
            text: document.getElementById('riddle-text'),
            roundNumber: document.getElementById('riddle-round-number'),
            hint1Btn: document.getElementById('btn-hint-1'),
            hint2Btn: document.getElementById('btn-hint-2'),
            hint1Box: document.getElementById('hint-1-box'),
            hint2Box: document.getElementById('hint-2-box'),
            hint1Text: document.getElementById('hint-1-text'),
            hint2Text: document.getElementById('hint-2-text'),
            skipBtn: document.getElementById('btn-skip'),
        };

        this.controls = {
            btnXray: document.getElementById('btn-xray'),
            btnFlipCamera: document.getElementById('btn-flip-camera'),
            btnTorch: document.getElementById('btn-torch'),
            btnMute: document.getElementById('btn-mute'),
        };

        this.result = {
            title: document.getElementById('result-title'),
            subtitle: document.getElementById('result-subtitle'),
            objectName: document.getElementById('result-object-name'),
            snapshotImg: document.getElementById('result-snapshot'),
            scoreBase: document.getElementById('score-base'),
            scoreTime: document.getElementById('score-time'),
            scorePenalty: document.getElementById('score-penalty'),
            scoreClean: document.getElementById('score-clean'),
            scoreTotal: document.getElementById('score-total'),
            btnNextRound: document.getElementById('btn-next-round'),
        };

        this.final = {
            totalScore: document.getElementById('final-total-score'),
            rankTitle: document.getElementById('final-rank-title'),
            summaryStats: document.getElementById('final-summary-stats'),
            roundsList: document.getElementById('final-rounds-list'),
            btnPlayAgain: document.getElementById('btn-play-again'),
        };

        this.settings = {
            modal: document.getElementById('settings-modal'),
            btnOpen: document.getElementById('btn-open-settings'),
            btnClose: document.getElementById('btn-close-settings'),
            providerSelect: document.getElementById('ai-provider-select'),
            apiKeyInput: document.getElementById('ai-api-key-input'),
            btnSave: document.getElementById('btn-save-ai'),
            statusText: document.getElementById('ai-status-text'),
        };

        this.init();
    }

    async init() {
        // Initialize camera and detector
        const videoEl = document.getElementById('camera-feed');
        const canvasEl = document.getElementById('xray-canvas');
        this.camera = new CameraManager(videoEl);
        this.detector = new DetectionEngine(this.camera, canvasEl, {
            onTargetLocked: (targetMatch, snapshot) => this.onTargetDetected(targetMatch, snapshot),
            onTelemetryUpdate: (telemetry) => this.updateTelemetry(telemetry)
        });

        const confidenceInput = document.getElementById('detection-confidence');
        const lockDurationInput = document.getElementById('detection-lock-duration');
        const savedConfidence = Number(localStorage.getItem('detectionConfidenceThreshold')) || 0.35;
        const savedLockDuration = Number(localStorage.getItem('detectionLockDurationMs'));
        confidenceInput.value = String(Math.round(savedConfidence * 100));
        lockDurationInput.value = String(Number.isFinite(savedLockDuration) && localStorage.getItem('detectionLockDurationMs') !== null ? savedLockDuration : 300);
        document.getElementById('detection-confidence-value').textContent = `${confidenceInput.value}%`;
        document.getElementById('detection-lock-duration-value').textContent = `${lockDurationInput.value} ms`;
        this.detector.confidenceThreshold = savedConfidence;
        this.detector.lockDurationMs = Number(lockDurationInput.value);

        this.attachEventListeners();
        this.checkServerHealth();
    }

    attachEventListeners() {
        const confidenceInput = document.getElementById('detection-confidence');
        const lockDurationInput = document.getElementById('detection-lock-duration');
        confidenceInput.addEventListener('input', () => {
            const threshold = Number(confidenceInput.value) / 100;
            this.detector.confidenceThreshold = threshold;
            localStorage.setItem('detectionConfidenceThreshold', String(threshold));
            document.getElementById('detection-confidence-value').textContent = `${confidenceInput.value}%`;
        });
        lockDurationInput.addEventListener('input', () => {
            this.detector.lockDurationMs = Number(lockDurationInput.value);
            localStorage.setItem('detectionLockDurationMs', lockDurationInput.value);
            document.getElementById('detection-lock-duration-value').textContent = `${lockDurationInput.value} ms`;
        });

        // Start Game
        const startBtn = document.getElementById('btn-start-game');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                window.sounds.playClick();
                this.startGame();
            });
        }

        // HUD Controls
        if (this.controls.btnXray) {
            this.controls.btnXray.addEventListener('click', () => {
                window.sounds.playClick();
                const active = this.detector.toggleXrayMode();
                this.controls.btnXray.classList.toggle('active', active);
                const label = this.controls.btnXray.querySelector('.btn-label');
                if (label) label.textContent = active ? 'X-RAY: ON' : 'X-RAY: OFF';
            });
        }

        if (this.controls.btnFlipCamera) {
            this.controls.btnFlipCamera.addEventListener('click', async () => {
                window.sounds.playClick();
                await this.camera.toggleFacing();
            });
        }

        if (this.controls.btnTorch) {
            this.controls.btnTorch.addEventListener('click', async () => {
                window.sounds.playClick();
                const active = await this.camera.toggleTorch();
                this.controls.btnTorch.classList.toggle('active', active);
            });
        }

        if (this.controls.btnMute) {
            this.controls.btnMute.addEventListener('click', () => {
                const muted = window.sounds.toggleMute();
                this.controls.btnMute.classList.toggle('muted', muted);
            });
        }

        // Riddle Hints & Skip
        if (this.riddle.hint1Btn) {
            this.riddle.hint1Btn.addEventListener('click', () => this.unlockHint(1));
        }
        if (this.riddle.hint2Btn) {
            this.riddle.hint2Btn.addEventListener('click', () => this.unlockHint(2));
        }
        if (this.riddle.skipBtn) {
            this.riddle.skipBtn.addEventListener('click', () => this.skipRound());
        }

        // Result & Next Round
        if (this.result.btnNextRound) {
            this.result.btnNextRound.addEventListener('click', () => {
                window.sounds.playClick();
                this.proceedNextRound();
            });
        }

        // Play Again
        if (this.final.btnPlayAgain) {
            this.final.btnPlayAgain.addEventListener('click', () => {
                window.sounds.playClick();
                this.switchView('landing');
            });
        }

        // AI Settings Modal
        if (this.settings.btnOpen) {
            this.settings.btnOpen.addEventListener('click', () => {
                window.sounds.playClick();
                this.settings.modal.classList.add('visible');
            });
        }
        if (this.settings.btnClose) {
            this.settings.btnClose.addEventListener('click', () => {
                window.sounds.playClick();
                this.settings.modal.classList.remove('visible');
            });
        }
        if (this.settings.btnSave) {
            this.settings.btnSave.addEventListener('click', () => this.saveAISettings());
        }
    }

    async checkServerHealth() {
        try {
            const res = await fetch('/api/health');
            if (res.ok) {
                const data = await res.json();
                const aiBadge = document.getElementById('landing-ai-badge');
                if (aiBadge) {
                    if (data.genai_configured.gemini || data.genai_configured.groq) {
                        aiBadge.textContent = '● GENAI ACTIVE';
                        aiBadge.classList.add('active');
                    } else {
                        aiBadge.textContent = '● CURATED AI MODE';
                    }
                }
            }
        } catch (e) {
            console.warn('Server health check error:', e);
        }
    }

    async saveAISettings() {
        const provider = this.settings.providerSelect.value;
        const apiKey = this.settings.apiKeyInput.value.trim();

        try {
            const res = await fetch('/api/settings/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, api_key: apiKey })
            });
            if (res.ok) {
                this.settings.statusText.textContent = `Configured ${provider.toUpperCase()} key successfully!`;
                this.settings.statusText.style.color = '#10B981';
                setTimeout(() => {
                    this.settings.modal.classList.remove('visible');
                    this.checkServerHealth();
                }, 1200);
            } else {
                const data = await res.json().catch(() => ({}));
                this.settings.statusText.textContent = data.detail || 'Could not save the API key.';
                this.settings.statusText.style.color = '#EF4444';
            }
        } catch (e) {
            this.settings.statusText.textContent = 'Error saving key: ' + e.message;
            this.settings.statusText.style.color = '#EF4444';
        }
    }

    switchView(viewName) {
        Object.entries(this.views).forEach(([name, el]) => {
            if (el) {
                el.classList.toggle('active', name === viewName);
            }
        });
    }

    async startGame() {
        const startBtn = document.getElementById('btn-start-game');
        if (startBtn) startBtn.disabled = true;

        try {
            // Request camera permission & start stream
            const camRes = await this.camera.start();
            if (!camRes.success) {
                const message = camRes.isHttpRestriction
                    ? 'This page is using HTTP, which blocks camera access on phones. Open the HTTPS address printed by “python run.py” (https://<computer-lan-ip>:8000), accept the local certificate warning, then tap START GAME again.'
                    : 'Camera could not start. Check that this page has camera permission in your browser settings and that no other app is using the camera. ' + (camRes.error || '');
                alert(message);
                if (startBtn) startBtn.disabled = false;
                return;
            }

            // Update torch visibility
            if (this.controls.btnTorch) {
                this.controls.btnTorch.style.display = camRes.hasTorch ? 'inline-flex' : 'none';
            }

            // Create new game session on backend
            const res = await fetch('/api/game/new', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ use_genai: true, rounds: 5 })
            });

            if (!res.ok) throw new Error('Failed to create game session');

            this.gameState = await res.json();
            this.switchView('game');
            this.setupRound();
        } catch (err) {
            console.error('Game start error:', err);
            alert('Could not start game session: ' + err.message);
        } finally {
            if (startBtn) startBtn.disabled = false;
        }
    }

    setupRound() {
        const curRound = this.gameState.current_round;
        if (!curRound) return;

        this.isRoundOver = false;
        this.timeRemaining = curRound.time_allocated || 60;

        // Configure HUD
        this.hud.roundBadge.textContent = `ROUND 0${curRound.round_number} / 0${this.gameState.total_rounds}`;
        this.hud.score.textContent = `${this.gameState.total_score.toLocaleString()} PTS`;
        this.updateTimerDisplay();

        // Configure Riddle Card
        this.riddle.roundNumber.textContent = `ROUND ${curRound.round_number} RIDDLE`;
        this.riddle.text.textContent = curRound.riddle;

        // Reset hint UI
        this.riddle.hint1Box.style.display = 'none';
        this.riddle.hint2Box.style.display = 'none';
        this.riddle.hint1Btn.disabled = false;
        this.riddle.hint2Btn.disabled = false;
        this.riddle.hint1Btn.classList.remove('used');
        this.riddle.hint2Btn.classList.remove('used');

        // Set target in detection engine
        this.detector.setTarget(curRound.yolo_class || this.gameState.target_yolo_class, this.gameState.game_id);
        this.detector.start();

        // Start countdown timer
        this.startTimer();
    }

    startTimer() {
        clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            if (this.timeRemaining > 0) {
                this.timeRemaining--;
                this.updateTimerDisplay();

                // Subtle audio tick when timer <= 10
                if (this.timeRemaining <= 10) {
                    window.sounds.playTick();
                }
            } else {
                clearInterval(this.timerInterval);
                this.onRoundTimeout();
            }
        }, 1000);
    }

    updateTimerDisplay() {
        const mins = Math.floor(this.timeRemaining / 60);
        const secs = this.timeRemaining % 60;
        const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        this.hud.timer.textContent = timeStr;

        if (this.timeRemaining <= 15) {
            this.hud.timer.classList.add('urgent');
        } else {
            this.hud.timer.classList.remove('urgent');
        }
    }

    async unlockHint(hintNum) {
        if (!this.gameState || this.isRoundOver) return;

        window.sounds.playHint();
        try {
            const res = await fetch(`/api/game/${this.gameState.game_id}/hint`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hint_number: hintNum })
            });

            if (res.ok) {
                this.gameState = await res.json();
                const cur = this.gameState.current_round;

                if (hintNum === 1 && cur.hint_1) {
                    this.riddle.hint1Text.textContent = cur.hint_1;
                    this.riddle.hint1Box.style.display = 'block';
                    this.riddle.hint1Btn.disabled = true;
                    this.riddle.hint1Btn.classList.add('used');
                } else if (hintNum === 2 && cur.hint_2) {
                    this.riddle.hint2Text.textContent = cur.hint_2;
                    this.riddle.hint2Box.style.display = 'block';
                    this.riddle.hint2Btn.disabled = true;
                    this.riddle.hint2Btn.classList.add('used');
                }
            }
        } catch (e) {
            console.error('Hint unlock error:', e);
        }
    }

    async skipRound() {
        if (this.isRoundOver) return;

        // Two-step tactile confirmation on button to avoid native blocking alerts
        if (!this.skipConfirming) {
            this.skipConfirming = true;
            const originalText = this.riddle.skipBtn.textContent;
            this.riddle.skipBtn.textContent = 'CONFIRM SKIP?';
            this.riddle.skipBtn.style.color = '#EF4444';

            this.skipConfirmTimeout = setTimeout(() => {
                this.skipConfirming = false;
                this.riddle.skipBtn.textContent = originalText;
                this.riddle.skipBtn.style.color = '';
            }, 3000);
            return;
        }

        clearTimeout(this.skipConfirmTimeout);
        this.skipConfirming = false;
        this.riddle.skipBtn.textContent = 'SKIP ROUND';
        this.riddle.skipBtn.style.color = '';

        window.sounds.playClick();
        this.isRoundOver = true;
        clearInterval(this.timerInterval);
        this.detector.stop();

        try {
            const res = await fetch(`/api/game/${this.gameState.game_id}/skip`, {
                method: 'POST'
            });

            if (res.ok) {
                const data = await res.json();
                this.gameState = data.game_state;
                this.showRoundResult(data.round_summary, false);
            }
        } catch (e) {
            console.error('Skip round error:', e);
        }
    }

    async onRoundTimeout() {
        if (this.isRoundOver) return;
        this.isRoundOver = true;
        this.detector.stop();

        try {
            const res = await fetch(`/api/game/${this.gameState.game_id}/timeout`, {
                method: 'POST'
            });

            if (res.ok) {
                const data = await res.json();
                this.gameState = data.game_state;
                this.showRoundResult(data.round_summary, false, true);
            }
        } catch (e) {
            console.error('Timeout error:', e);
        }
    }

    async onTargetDetected(targetMatch, snapshot) {
        if (this.isRoundOver) return;
        this.isRoundOver = true;

        clearInterval(this.timerInterval);
        this.detector.stop();
        window.sounds.playShutter();

        try {
            const res = await fetch(`/api/game/${this.gameState.game_id}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    time_remaining: this.timeRemaining,
                    snapshot: snapshot
                })
            });

            if (res.ok) {
                const data = await res.json();
                this.gameState = data.game_state;
                this.showRoundResult(data.round_summary, true);
            }
        } catch (e) {
            console.error('Target verification error:', e);
        }
    }

    showRoundResult(summary, isSuccess, isTimeout = false) {
        this.switchView('roundResult');

        if (isSuccess) {
            this.result.title.textContent = 'TARGET CONFIRMED';
            this.result.title.style.color = '#10B981';
            this.result.subtitle.textContent = `Identified in ${60 - summary.time_remaining}s`;
        } else if (isTimeout) {
            this.result.title.textContent = 'TIME EXPIRED';
            this.result.title.style.color = '#EF4444';
            this.result.subtitle.textContent = 'The clock ran out!';
        } else {
            this.result.title.textContent = 'ROUND SKIPPED';
            this.result.title.style.color = '#9CA3AF';
            this.result.subtitle.textContent = 'Round conceded';
        }

        this.result.objectName.textContent = summary.object_name.toUpperCase();

        const snapFrame = document.querySelector('.snapshot-frame');
        if (summary.snapshot) {
            this.result.snapshotImg.src = summary.snapshot;
            this.result.snapshotImg.style.display = 'block';
            if (snapFrame) snapFrame.style.display = 'block';
        } else {
            this.result.snapshotImg.style.display = 'none';
            if (snapFrame) snapFrame.style.display = 'none';
        }

        const breakdown = summary.points_breakdown || {};
        this.result.scoreBase.textContent = `+${breakdown.base || 0}`;
        this.result.scoreTime.textContent = `+${breakdown.time_bonus || 0}`;
        this.result.scorePenalty.textContent = `-${breakdown.hint_penalty || 0}`;
        this.result.scoreClean.textContent = `+${breakdown.clean_bonus || 0}`;
        this.result.scoreTotal.textContent = `+${summary.points_awarded || 0} PTS`;

        const isLastRound = this.gameState.is_finished || !this.gameState.current_round;
        this.result.btnNextRound.textContent = isLastRound ? 'VIEW FINAL SCORE →' : 'NEXT RIDDLE →';
    }

    proceedNextRound() {
        if (this.gameState.is_finished || !this.gameState.current_round) {
            this.showFinalScorecard();
        } else {
            this.switchView('game');
            this.setupRound();
        }
    }

    showFinalScorecard() {
        this.camera.stop();
        this.detector.stop();
        this.switchView('finalScorecard');

        const total = this.gameState.total_score || 0;
        this.final.totalScore.textContent = `${total.toLocaleString()} PTS`;

        // Determine Detective Rank
        let rank = 'ROOKIE SCOUT';
        if (total >= 7000) rank = 'MASTER DETECTIVE ★★★';
        else if (total >= 5000) rank = 'EAGLE EYE ★★';
        else if (total >= 3000) rank = 'KEEN OBSERVER ★';
        else if (total >= 1000) rank = 'SHARP APPRENTICE';
        this.final.rankTitle.textContent = rank;

        // Statistics
        const history = this.gameState.round_history || [];
        const solvedCount = history.filter(r => r.status === 'completed').length;
        const totalRounds = history.length;
        const totalTime = history.reduce((acc, r) => acc + (60 - (r.time_remaining || 0)), 0);

        this.final.summaryStats.innerHTML = `
            <div class="stat-pill">
                <span class="stat-label">FINDS</span>
                <span class="stat-value">${solvedCount} / ${totalRounds}</span>
            </div>
            <div class="stat-pill">
                <span class="stat-label">TOTAL TIME</span>
                <span class="stat-value">${totalTime}s</span>
            </div>
            <div class="stat-pill">
                <span class="stat-label">EFFICIENCY</span>
                <span class="stat-value">${Math.round((solvedCount / (totalRounds || 1)) * 100)}%</span>
            </div>
        `;

        // Render each round history card
        this.final.roundsList.innerHTML = '';
        history.forEach((r) => {
            const card = document.createElement('div');
            card.className = `history-item ${r.status}`;

            const badgeColor = r.status === 'completed' ? '#10B981' : '#6B7280';
            const badgeText = r.status === 'completed' ? 'SOLVED' : (r.status === 'skipped' ? 'SKIPPED' : 'TIMEOUT');

            card.innerHTML = `
                <div class="history-left">
                    <span class="history-round">R0${r.round_number}</span>
                    <div class="history-details">
                        <span class="history-name">${r.object_name}</span>
                        <span class="history-meta">${60 - (r.time_remaining || 0)}s · ${r.hints_used} hints</span>
                    </div>
                </div>
                <div class="history-right">
                    <span class="history-badge" style="color: ${badgeColor}">${badgeText}</span>
                    <span class="history-pts">+${r.points_awarded}</span>
                </div>
            `;
            this.final.roundsList.appendChild(card);
        });
    }

    updateTelemetry(t) {
        if (this.hud.telemetry) {
            this.hud.telemetry.textContent = `FPS: ${t.fps} · ${t.inferenceMs}ms · YOLOv8n`;
        }
    }
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ScavengerApp();
});
