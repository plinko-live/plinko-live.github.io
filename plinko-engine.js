// plinko-engine.js
// Vanilla JS Plinko + UI. Основано на Matter.js.

(function (global) {
  'use strict';

  const { Engine, Render, Runner, Composite, Bodies, Events } = global.Matter || {};

  if (!Engine || !Render) {
    console.warn('[PlinkoEngine] Matter.js not found. Include matter.min.js before this file.');
  }

  class PlinkoEngine {
    static WIDTH = 600;
    static HEIGHT = 420;

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {Object} [options]
     * @param {number} [options.rows=10]
     * @param {number[]} [options.multipliers]
     */
    constructor(canvas, options = {}) {
      if (!canvas) throw new Error('PlinkoEngine requires a canvas element');
      if (!Engine) throw new Error('PlinkoEngine requires Matter.js');

      this.canvas = canvas;
      this.rows = options.rows || 10;
      this.slotsCount = this.rows + 1;
      this.multipliers =
        Array.isArray(options.multipliers) && options.multipliers.length === this.slotsCount
          ? options.multipliers
          : this.#defaultMultipliers(this.slotsCount);

      this.engine = Engine.create({ gravity: { x: 0, y: 1 } });
      this.world = this.engine.world;
      this.runner = Runner.create();
      this.render = null;

      this.pegs = [];
      this.buckets = [];
      this.ball = null;

      this.isRunning = false;
      this.isDropping = false;
      this.onResultCallback = null;

      this.#setupScene();
    }

    #defaultMultipliers(count) {
      const mid = (count - 1) / 2;
      const arr = [];
      for (let i = 0; i < count; i++) {
        const dist = Math.abs(i - mid);
        const base = 1 + dist * 0.8;
        arr.push(Number(base.toFixed(2)));
      }
      return arr;
    }

    #setupScene() {
      const W = PlinkoEngine.WIDTH;
      const H = PlinkoEngine.HEIGHT;
      const wallThickness = 40;

      const leftWall = Bodies.rectangle(-wallThickness / 2, H / 2, wallThickness, H, { isStatic: true });
      const rightWall = Bodies.rectangle(W + wallThickness / 2, H / 2, wallThickness, H, { isStatic: true });
      const floor = Bodies.rectangle(W / 2, H + wallThickness / 2, W, wallThickness, { isStatic: true });

      Composite.add(this.world, [leftWall, rightWall, floor]);

      const topOffsetY = 40;
      const bottomOffsetY = 90;
      const usableHeight = H - topOffsetY - bottomOffsetY;
      const rowSpacing = usableHeight / this.rows;
      const pegRadius = 4;

      for (let row = 0; row < this.rows; row++) {
        const y = topOffsetY + row * rowSpacing;
        const cols = row + 1;
        const spacing = W / (cols + 1);
        for (let col = 0; col < cols; col++) {
          const x = spacing * (col + 1);
          const peg = Bodies.circle(x, y, pegRadius, {
            isStatic: true,
            restitution: 0.3,
            render: { fillStyle: '#9CA3AF' }
          });
          this.pegs.push(peg);
        }
      }

      Composite.add(this.world, this.pegs);

      const bucketsY = H - 40;
      const slotWidth = W / this.slotsCount;
      const bucketHeight = 50;

      for (let i = 0; i < this.slotsCount; i++) {
        const x = slotWidth * (i + 0.5);
        const bucket = Bodies.rectangle(x, bucketsY, slotWidth * 0.9, bucketHeight, {
          isStatic: true,
          chamfer: { radius: 4 },
          render: {
            fillStyle: 'transparent',
            strokeStyle: 'rgba(148,163,184,0.5)',
            lineWidth: 1
          }
        });
        bucket.slotIndex = i;
        this.buckets.push(bucket);
      }

      Composite.add(this.world, this.buckets);

      // Линия завершения раунда — чуть выше пола
      const finishLineY = H - 10;

      Events.on(this.engine, 'afterUpdate', () => {
        if (!this.ball || !this.isDropping) return;
        const y = this.ball.position.y;
        if (y >= finishLineY) {
          this.#finishDrop();
        }
      });
    }

    start() {
      if (this.isRunning) return;
      this.isRunning = true;

      this.render = Render.create({
        canvas: this.canvas,
        engine: this.engine,
        options: {
          width: PlinkoEngine.WIDTH,
          height: PlinkoEngine.HEIGHT,
          background: 'transparent',
          wireframes: false,
          pixelRatio: global.devicePixelRatio || 1
        }
      });

      Render.run(this.render);
      Runner.run(this.runner, this.engine);
    }

    stop() {
      if (!this.isRunning) return;
      this.isRunning = false;

      Runner.stop(this.runner);
      if (this.render) {
        Render.stop(this.render);
        const ctx = this.render.context;
        if (ctx) {
          ctx.clearRect(0, 0, PlinkoEngine.WIDTH, PlinkoEngine.HEIGHT);
        }
      }
      this.#clearBall();
    }

    dropBall(onResult) {
      if (this.isDropping) return;
      this.onResultCallback = typeof onResult === 'function' ? onResult : null;

      this.#clearBall();

      const startX = PlinkoEngine.WIDTH / 2;
      const startY = 30;
      const radius = 10;

      this.ball = Bodies.circle(startX, startY, radius, {
        restitution: 0.6,
        friction: 0.02,
        frictionAir: 0.005,
        render: { fillStyle: '#22D3EE' }
      });

      Composite.add(this.world, this.ball);
      this.isDropping = true;
    }

    #clearBall() {
      if (this.ball) {
        Composite.remove(this.world, this.ball);
        this.ball = null;
      }
      this.isDropping = false;
    }

    #finishDrop() {
      if (!this.ball) return;

      const x = this.ball.position.x;
      const slotWidth = PlinkoEngine.WIDTH / this.slotsCount;
      let slotIndex = Math.floor(x / slotWidth);
      if (slotIndex < 0) slotIndex = 0;
      if (slotIndex >= this.slotsCount) slotIndex = this.slotsCount - 1;

      const multiplier = this.multipliers[slotIndex];
      const payload = { slotIndex, multiplier };

      this.#clearBall();

      if (this.onResultCallback) {
        this.onResultCallback(payload);
      }
    }
  }

  global.PlinkoEngine = PlinkoEngine;

  // === UI-демо: привязка к текущей странице ===
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      const ROWS = 10;
      const RISK_MULTIPLIERS = {
        low:    [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
        medium: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
        high:   [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76]
      };

      let balance = 1000;
      let autoMode = false;
      let isDropping = false;

      const canvas         = document.getElementById('plinkoCanvas');
      const betInput       = document.getElementById('bet');
      const riskSelect     = document.getElementById('risk');
      const rowsLabel      = document.getElementById('rowsLabel');
      const balanceEl      = document.getElementById('balance');
      const dropBtn        = document.getElementById('dropBtn');
      const autoBtn        = document.getElementById('autoBtn');
      const resultText     = document.getElementById('resultText');
      const multipliersRow = document.getElementById('multipliersRow');
      const yearEl         = document.getElementById('year');

      if (!canvas || !betInput || !riskSelect || !rowsLabel || !balanceEl ||
          !dropBtn || !autoBtn || !resultText || !multipliersRow) {
        return;
      }

      if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
      }

      rowsLabel.textContent = ROWS.toString();
      balanceEl.textContent = balance.toFixed(2);

      function setResult(msg, type) {
        resultText.textContent = msg;
        if (type === 'win') {
          resultText.style.color = '#4ade80';
        } else if (type === 'lose') {
          resultText.style.color = '#f97373';
        } else {
          resultText.style.color = '#9ca3af';
        }
      }

      function updateMultipliersUI(risk) {
        const multipliers = RISK_MULTIPLIERS[risk] || RISK_MULTIPLIERS.medium;
        multipliersRow.innerHTML = '';

        multipliers.forEach(function (m, idx) {
          const span = document.createElement('span');
          span.textContent =
            idx === 0
              ? 'Multipliers (' + risk + ' risk): x' + m
              : '• x' + m;
          multipliersRow.appendChild(span);
        });
      }

      const engine = new PlinkoEngine(canvas, {
        rows: ROWS,
        multipliers: RISK_MULTIPLIERS[riskSelect.value] || RISK_MULTIPLIERS.medium
      });
      engine.start();

      function applyRisk() {
        const risk = riskSelect.value || 'medium';
        const multipliers = RISK_MULTIPLIERS[risk] || RISK_MULTIPLIERS.medium;
        engine.multipliers = multipliers;
        updateMultipliersUI(risk);
        setResult('Risk set to ' + risk + '. Press "Drop ball" to play.', 'neutral');
      }

      applyRisk();

      function stopAuto() {
        autoMode = false;
        autoBtn.textContent = 'Start auto';
        autoBtn.classList.remove('auto-active');
      }

      function scheduleNextAuto() {
        if (!autoMode) return;
        if (balance <= 0) {
          setResult('Auto stopped: balance is 0.', 'lose');
          stopAuto();
          return;
        }
        setTimeout(function () {
          if (autoMode && !isDropping) {
            dropOnce(true);
          }
        }, 500);
      }

      function dropOnce(fromAuto) {
        if (isDropping) return;

        const bet = parseFloat(betInput.value);
        if (isNaN(bet) || bet <= 0) {
          setResult('Enter a valid bet larger than 0.', 'lose');
          if (fromAuto) stopAuto();
          return;
        }
        if (bet > balance) {
          setResult('Insufficient balance.', 'lose');
          if (fromAuto) stopAuto();
          return;
        }

        isDropping = true;
        dropBtn.disabled = true;

        balance -= bet;
        balanceEl.textContent = balance.toFixed(2);
        setResult('Ball is dropping…', 'neutral');

        engine.dropBall(function (result) {
          const multiplier = typeof result.multiplier === 'number'
            ? result.multiplier
            : 0;

          const win = bet * multiplier;
          balance += win;
          balanceEl.textContent = balance.toFixed(2);

          const risk = riskSelect.value || 'medium';

          if (win > bet) {
            setResult(
              'Risk: ' + risk + '. Slot x' + multiplier.toFixed(2) +
              '. You won ' + win.toFixed(2) + ' virtual credits.',
              'win'
            );
          } else if (win === bet) {
            setResult(
              'Risk: ' + risk + '. Slot x' + multiplier.toFixed(2) +
              '. You got your bet back (' + win.toFixed(2) + ').',
              'neutral'
            );
          } else {
            setResult(
              'Risk: ' + risk + '. Slot x' + multiplier.toFixed(2) +
              '. You receive ' + win.toFixed(2) +
              ' back from ' + bet.toFixed(2) + '.',
              'lose'
            );
          }

          isDropping = false;
          dropBtn.disabled = false;

          if (autoMode) {
            scheduleNextAuto();
          }
        });
      }

      function startAuto() {
        if (autoMode) return;
        autoMode = true;
        autoBtn.textContent = 'Stop auto';
        autoBtn.classList.add('auto-active');
        dropOnce(true);
      }

      dropBtn.addEventListener('click', function () {
        if (autoMode) return;
        dropOnce(false);
      });

      autoBtn.addEventListener('click', function () {
        if (!autoMode) {
          startAuto();
        } else {
          stopAuto();
        }
      });

      riskSelect.addEventListener('change', function () {
        applyRisk();
      });

      setResult('Press "Drop ball" to start.', 'neutral');
    });
  }

})(typeof window !== 'undefined' ? window : globalThis);
