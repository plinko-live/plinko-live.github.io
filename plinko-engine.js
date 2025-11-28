// plinko-engine.js
// Vanilla JavaScript Plinko engine based on the Svelte/Matter.js version
// Simplified to run directly in the browser with Matter.js and a single <canvas>.
//
// Usage in HTML:
// <canvas id="plinkoCanvas" width="600" height="420"></canvas>
// <script src="https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js"></script>
// <script src="plinko-engine.js"></script>
// <script>
//   const engine = new PlinkoEngine(document.getElementById('plinkoCanvas'), {
//     rows: 10,
//     multipliers: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22]
//   });
//   engine.start();
// </script>

(function (global) {
  'use strict';

  const { Engine, Render, Runner, Composite, Bodies, Events } = global.Matter || {};

  if (!Engine || !Render) {
    console.warn('[PlinkoEngine] Matter.js not found. Include matter.min.js before this file.');
  }

  /**
   * Simple Plinko engine: builds a triangular peg grid and bottom buckets,
   * drops a ball from the top and reports in which slot it landed.
   */
  class PlinkoEngine {
    static WIDTH = 600;
    static HEIGHT = 420;

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {Object} [options]
     * @param {number} [options.rows=10] - number of peg rows
     * @param {number[]} [options.multipliers] - optional multipliers for buckets
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

      // Matter.js core
      this.engine = Engine.create({ gravity: { x: 0, y: 1 } });
      this.world = this.engine.world;
      this.runner = Runner.create();
      this.render = null;

      // Scene objects
      this.pegs = [];
      this.buckets = [];
      this.ball = null;

      // State
      this.isRunning = false;
      this.isDropping = false;
      this.onResultCallback = null;

      this.#setupScene();
    }

    /** Default symmetric multipliers if none are provided */
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

    /** Build walls, pegs and buckets */
    #setupScene() {
      const W = PlinkoEngine.WIDTH;
      const H = PlinkoEngine.HEIGHT;
      const wallThickness = 40;

      // Static walls
      const leftWall = Bodies.rectangle(-wallThickness / 2, H / 2, wallThickness, H, { isStatic: true });
      const rightWall = Bodies.rectangle(W + wallThickness / 2, H / 2, wallThickness, H, { isStatic: true });
      const floor = Bodies.rectangle(W / 2, H + wallThickness / 2, W, wallThickness, { isStatic: true });

      Composite.add(this.world, [leftWall, rightWall, floor]);

      // Peg grid
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

      // Buckets at the bottom (визуальные, логика по finish line)
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

      // Линия завершения: когда шар почти у пола, считаем, что он попал в слот
      const finishLineY = H - 10;

      Events.on(this.engine, 'afterUpdate', () => {
        if (!this.ball || !this.isDropping) return;
        const y = this.ball.position.y;
        if (y >= finishLineY) {
          this.#finishDrop();
        }
      });
    }

    /** Start rendering loop */
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

    /** Stop rendering loop and clear scene */
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

    /** Drop a new ball. Callback receives { slotIndex, multiplier } */
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

    /** Remove current ball from the world */
    #clearBall() {
      if (this.ball) {
        Composite.remove(this.world, this.ball);
        this.ball = null;
      }
      this.isDropping = false;
    }

    /** Compute final slot, call callback and reset dropping state */
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
})(typeof window !== 'undefined' ? window : globalThis);
