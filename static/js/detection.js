/**
 * YOLO Detection Controller & X-Ray Overlay Canvas Engine
 * Manages frame streaming, box rendering, X-Ray mode, and target lock-on verification.
 */
class DetectionEngine {
    constructor(cameraManager, overlayCanvas, options = {}) {
        this.camera = cameraManager;
        this.canvas = overlayCanvas;
        this.ctx = this.canvas.getContext('2d');

        this.xrayMode = false;
        this.isActive = false;
        this.isProcessingFrame = false;

        this.targetClass = null;
        this.gameId = null;

        // Callback hooks
        this.onTargetLocked = options.onTargetLocked || (() => {});
        this.onTelemetryUpdate = options.onTelemetryUpdate || (() => {});

        // Lock-on stability tracker (prevents 1-frame false positives)
        this.lockDurationMs = 300; // Require a brief stable target lock
        this.lockStartTime = null;
        this.lastTargetSeenAt = null;
        this.lockGraceMs = 900; // tolerate short YOLO misses between frames
        this.confidenceThreshold = Number(localStorage.getItem('detectionConfidenceThreshold')) || 0.35;
        this.lockedObject = null;
        this.isTriggered = false;

        this.lastDetections = [];
        this.lastInferenceMs = 0;
        this.fpsCounter = 0;
        this.lastFpsTimestamp = performance.now();
        this.currentFps = 0;

        // Visual animation state
        this.reticlePulse = 0;
        this.animationFrameId = null;
    }

    setTarget(targetClass, gameId) {
        this.targetClass = targetClass ? targetClass.toLowerCase().trim() : null;
        this.gameId = gameId;
        this.lockStartTime = null;
        this.lastTargetSeenAt = null;
        this.lockedObject = null;
        this.isTriggered = false;
        this.lastDetections = [];
    }

    setXrayMode(enabled) {
        this.xrayMode = enabled;
        this.clearCanvas();
    }

    toggleXrayMode() {
        this.xrayMode = !this.xrayMode;
        return this.xrayMode;
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;
        this.isTriggered = false;
        this.loopDetection();
        this.renderLoop();
    }

    stop() {
        this.isActive = false;
        this.lockStartTime = null;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.clearCanvas();
    }

    clearCanvas() {
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    async loopDetection() {
        while (this.isActive && !this.isTriggered) {
            if (!this.isProcessingFrame && this.camera.isStreaming) {
                await this.processSingleFrame();
            }
            // Dynamic adaptive throttling (~12-15 FPS for silky responsiveness)
            await new Promise(r => setTimeout(r, 65));
        }
    }

    async processSingleFrame() {
        this.isProcessingFrame = true;
        const frameData = this.camera.captureFrame(640, 0.65);
        if (!frameData) {
            this.isProcessingFrame = false;
            return;
        }

        try {
            const resp = await fetch('/api/detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: frameData,
                    target_class: this.targetClass,
                    game_id: this.gameId,
                    conf_threshold: this.confidenceThreshold
                })
            });

            if (resp.ok) {
                const data = await resp.json();
                this.lastDetections = data.detections || [];
                this.lastInferenceMs = data.inference_ms || 0;

                // FPS calculation
                this.fpsCounter++;
                const now = performance.now();
                if (now - this.lastFpsTimestamp >= 1000) {
                    this.currentFps = Math.round((this.fpsCounter * 1000) / (now - this.lastFpsTimestamp));
                    this.fpsCounter = 0;
                    this.lastFpsTimestamp = now;
                    this.onTelemetryUpdate({
                        fps: this.currentFps,
                        inferenceMs: this.lastInferenceMs,
                        detectedCount: this.lastDetections.length
                    });
                }

                // Check target lock
                if (data.target_found && data.target_match && !this.isTriggered) {
                    this.handleTargetDetection(data.target_match, frameData);
                } else {
                    // Brief detector flicker should not restart a nearly complete lock.
                    if (this.lastTargetSeenAt && performance.now() - this.lastTargetSeenAt > this.lockGraceMs) {
                        this.lockStartTime = null;
                        this.lastTargetSeenAt = null;
                        this.lockedObject = null;
                    }
                }
            }
        } catch (err) {
            console.warn('Detection frame error:', err);
        } finally {
            this.isProcessingFrame = false;
        }
    }

    handleTargetDetection(targetMatch, snapshot) {
        const now = performance.now();
        this.lastTargetSeenAt = now;
        if (!this.lockStartTime) {
            this.lockStartTime = now;
            this.lockedObject = targetMatch;
            window.sounds.playLockOn();
        } else {
            const elapsed = now - this.lockStartTime;
            if (elapsed >= this.lockDurationMs && !this.isTriggered) {
                // Target successfully confirmed!
                this.isTriggered = true;
                window.sounds.playSuccess();
                if (navigator.vibrate) {
                    navigator.vibrate([80, 40, 140]);
                }
                this.onTargetLocked(targetMatch, snapshot);
            }
        }
    }

    renderLoop() {
        if (!this.isActive) return;

        this.reticlePulse = (this.reticlePulse + 0.05) % (Math.PI * 2);
        this.renderCanvas();
        this.animationFrameId = requestAnimationFrame(() => this.renderLoop());
    }

    renderCanvas() {
        const video = this.camera.video;
        if (!video || !video.videoWidth) return;

        const rect = video.getBoundingClientRect();
        if (this.canvas.width !== rect.width || this.canvas.height !== rect.height) {
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
        }

        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, cw, ch);

        // Minimalist center viewfinder guides
        this.drawCenterReticle(ctx, cw, ch);

        // If X-Ray mode is enabled, draw all detected object boxes
        if (this.xrayMode) {
            for (const det of this.lastDetections) {
                if (!det.is_target) {
                    this.drawObjectBox(ctx, det, cw, ch, false);
                }
            }
        }

        // Highlight target if detected (drawn in both X-Ray and normal mode for lock-on feedback)
        for (const det of this.lastDetections) {
            if (det.is_target) {
                this.drawObjectBox(ctx, det, cw, ch, true);
            }
        }
    }

    drawCenterReticle(ctx, cw, ch) {
        const cx = cw / 2;
        const cy = ch / 2;
        const size = 32;
        const gap = 8;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;

        // Top line
        ctx.beginPath();
        ctx.moveTo(cx, cy - size);
        ctx.lineTo(cx, cy - gap);
        ctx.stroke();

        // Bottom line
        ctx.beginPath();
        ctx.moveTo(cx, cy + gap);
        ctx.lineTo(cx, cy + size);
        ctx.stroke();

        // Left line
        ctx.beginPath();
        ctx.moveTo(cx - size, cy);
        ctx.lineTo(cx - gap, cy);
        ctx.stroke();

        // Right line
        ctx.beginPath();
        ctx.moveTo(cx + gap, cy);
        ctx.lineTo(cx + size, cy);
        ctx.stroke();

        // 4 corner brackets
        const frameW = Math.min(cw * 0.75, 420);
        const frameH = Math.min(ch * 0.55, 320);
        const fx1 = (cw - frameW) / 2;
        const fy1 = (ch - frameH) / 2;
        const fx2 = fx1 + frameW;
        const fy2 = fy1 + frameH;
        const bLen = 14;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1.5;

        // Top-left
        ctx.beginPath();
        ctx.moveTo(fx1, fy1 + bLen); ctx.lineTo(fx1, fy1); ctx.lineTo(fx1 + bLen, fy1);
        ctx.stroke();
        // Top-right
        ctx.beginPath();
        ctx.moveTo(fx2 - bLen, fy1); ctx.lineTo(fx2, fy1); ctx.lineTo(fx2, fy1 + bLen);
        ctx.stroke();
        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(fx1, fy2 - bLen); ctx.lineTo(fx1, fy2); ctx.lineTo(fx1 + bLen, fy2);
        ctx.stroke();
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(fx2 - bLen, fy2); ctx.lineTo(fx2, fy2); ctx.lineTo(fx2, fy2 - bLen);
        ctx.stroke();
    }

    drawObjectBox(ctx, det, cw, ch, isTarget) {
        const [nx1, ny1, nx2, ny2] = det.normalized_box;
        const x1 = nx1 * cw;
        const y1 = ny1 * ch;
        const x2 = nx2 * cw;
        const y2 = ny2 * ch;
        const w = x2 - x1;
        const h = y2 - y1;

        if (isTarget) {
            // Target locked styling: Vivid emerald / gold tactical bracket
            const lockProgress = this.lockStartTime
                ? Math.min(1, (performance.now() - this.lockStartTime) / this.lockDurationMs)
                : 0;

            const glow = Math.sin(this.reticlePulse) * 0.15 + 0.85;
            ctx.strokeStyle = `rgba(16, 185, 129, ${glow})`;
            ctx.lineWidth = 2.5;

            // Box outline
            ctx.strokeRect(x1, y1, w, h);

            // Shaded fill
            ctx.fillStyle = `rgba(16, 185, 129, ${0.08 + lockProgress * 0.12})`;
            ctx.fillRect(x1, y1, w, h);

            // Corner accent brackets
            const cLen = Math.min(18, w / 4, h / 4);
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = '#10B981';

            // Top-left
            ctx.beginPath(); ctx.moveTo(x1, y1 + cLen); ctx.lineTo(x1, y1); ctx.lineTo(x1 + cLen, y1); ctx.stroke();
            // Top-right
            ctx.beginPath(); ctx.moveTo(x2 - cLen, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + cLen); ctx.stroke();
            // Bottom-left
            ctx.beginPath(); ctx.moveTo(x1, y2 - cLen); ctx.lineTo(x1, y2); ctx.lineTo(x1 + cLen, y2); ctx.stroke();
            // Bottom-right
            ctx.beginPath(); ctx.moveTo(x2 - cLen, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - cLen); ctx.stroke();

            // Label badge
            const labelText = `🎯 TARGET: ${det.class.toUpperCase()} (${Math.round(det.confidence * 100)}%)`;
            ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
            const textMetrics = ctx.measureText(labelText);
            const badgeW = textMetrics.width + 14;
            const badgeH = 22;
            const badgeY = Math.max(0, y1 - badgeH - 4);

            ctx.fillStyle = '#10B981';
            ctx.fillRect(x1, badgeY, badgeW, badgeH);

            ctx.fillStyle = '#0C0D0F';
            ctx.fillText(labelText, x1 + 7, badgeY + 15);

            // If locking in progress, draw progress bar under badge
            if (lockProgress > 0) {
                ctx.fillStyle = '#F59E0B';
                ctx.fillRect(x1, badgeY + badgeH - 2, badgeW * lockProgress, 2);
            }

        } else {
            // Non-target object styling (X-Ray mode only): Subtle industrial mono outline
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x1, y1, w, h);

            // Semi-transparent label
            const labelText = `${det.class.toUpperCase()} ${Math.round(det.confidence * 100)}%`;
            ctx.font = '500 10px ui-monospace, SFMono-Regular, Menlo, monospace';
            const textMetrics = ctx.measureText(labelText);
            const badgeW = textMetrics.width + 8;
            const badgeH = 18;
            const badgeY = Math.max(0, y1 - badgeH);

            ctx.fillStyle = 'rgba(20, 22, 26, 0.85)';
            ctx.fillRect(x1, badgeY, badgeW, badgeH);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillText(labelText, x1 + 4, badgeY + 13);
        }
    }
}

window.DetectionEngine = DetectionEngine;
