// plinko-engine.js
// Plinko physics engine + simple UI wrapper for Plinko Live demo.
// Uses Matter.js for physics and canvas rendering.
// No external dependencies besides Matter.js.
//
// Страница должна содержать:
// - <canvas id="plinkoCanvas" width="600" height="420"></canvas>
// - input#bet (type="number")
// - select#risk (low / medium / high)
// - select#rows (например 10 и 16)
// - span#rowsLabel (выводит текущее количество рядов)
// - span#balance
// - button#dropBtn
// - button#autoBtn
// - div#resultText
// - div#multipliersRow
// - span#year (опционально)

(function (global) {
  'use strict';

  var Matter = global.Matter || {};
  var Engine = Matter.Engine;
  var Render = Matter.Render;
  var Runner = Matter.Runner;
  var Composite = Matter.Composite;
  var Bodies = Matter.Bodies;
  var Events = Matter.Events;

  if (!Engine || !Render) {
    console.warn('[PlinkoEngine] Matter.js not found. Include matter.min.js before this file.');
  }

  // ---------------------------------------------------------------------------
  // ЧИСТЫЙ ДВИЖОК ПЛИНКО
  // ---------------------------------------------------------------------------

  function PlinkoEngine(canvas, options) {
    if (!canvas) throw new Error('PlinkoEngine requires a canvas element');
    if (!Engine) throw new Error('PlinkoEngine requires Matter.js');

    options = options || {};
    this.canvas = canvas;

    this.rows = options.rows || 10;
    this.slotsCount = this.rows + 1;

    this.multipliers =
      Array.isArray(options.multipliers) &&
      options.multipliers.length === this.slotsCount
        ? options.multipliers.slice()
        : defaultMultipliers(this.slotsCount);

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

    this._setupScene();
  }

  PlinkoEngine.WIDTH = 600;
  PlinkoEngine.HEIGHT = 420;

  function defaultMultipliers(count) {
    // Симметричный профиль: центр ~1x, края выше
    var mid = (count - 1) / 2;
    var arr = [];
    for (var i = 0; i < count; i++) {
      var dist = Math.abs(i - mid);
      var base = 1 + dist * 0.8;
      arr.push(Number(base.toFixed(2)));
    }
    return arr;
  }

  PlinkoEngine.prototype._setupScene = function () {
    var W = PlinkoEngine.WIDTH;
    var H = PlinkoEngine.HEIGHT;
    var wallThickness = 40;

    // Статичные границы
    var leftWall = Bodies.rectangle(-wallThickness / 2, H / 2, wallThickness, H, { isStatic: true });
    var rightWall = Bodies.rectangle(W + wallThickness / 2, H / 2, wallThickness, H, { isStatic: true });
    var floor = Bodies.rectangle(W / 2, H + wallThickness / 2, W, wallThickness, { isStatic: true });

    Composite.add(this.world, [leftWall, rightWall, floor]);

    // Сетка пинов — классический треугольник
    var topOffsetY = 40;
    var bottomOffsetY = 100;
    var usableHeight = H - topOffsetY - bottomOffsetY;
    var rowSpacing = usableHeight / this.rows;
    var pegRadius = 4;

    for (var row = 0; row < this.rows; row++) {
      var y = topOffsetY + row * rowSpacing;
      var cols = row + 1;
      var spacing = W / (cols + 1);
      for (var col = 0; col < cols; col++) {
        var x = spacing * (col + 1);
        var peg = Bodies.circle(x, y, pegRadius, {
          isStatic: true,
          restitution: 0.3,
          render: { fillStyle: '#9CA3AF' }
        });
        this.pegs.push(peg);
      }
    }
    Composite.add(this.world, this.pegs);

    // Слоты внизу
    var bucketsY = H - 40;
    var slotWidth = W / this.slotsCount;
    var bucketHeight = 60;
    var i, bucket, bx;

    for (i = 0; i < this.slotsCount; i++) {
      bx = slotWidth * (i + 0.5);
      bucket = Bodies.rectangle(bx, bucketsY, slotWidth, bucketHeight, {
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

    var self = this;

    // Ключевой фикс: считаем раунд законченным, когда шар СТОЛКНУЛСЯ с любым слотом
    Events.on(this.engine, 'collisionStart', function (event) {
      if (!self.ball || !self.isDropping) return;

      var pairs = event.pairs;
      for (var p = 0; p < pairs.length; p++) {
        var pair = pairs[p];
        var a = pair.bodyA;
        var b = pair.bodyB;

        var ballBody = null;
        var bucketBody = null;

        if (a === self.ball && self.buckets.indexOf(b) !== -1) {
          ballBody = a;
          bucketBody = b;
        } else if (b === self.ball && self.buckets.indexOf(a) !== -1) {
          ballBody = b;
          bucketBody = a;
        }

        if (ballBody && bucketBody && self.isDropping) {
          self._finishDrop(bucketBody.slotIndex);
          break;
        }
      }
    });
  };

  PlinkoEngine.prototype.start = function () {
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
  };

  PlinkoEngine.prototype.stop = function () {
    if (!this.isRunning) return;
    this.isRunning = false;

    Runner.stop(this.runner);
    if (this.render) {
      Render.stop(this.render);
      var ctx = this.render.context;
      if (ctx) {
        ctx.clearRect(0, 0, PlinkoEngine.WIDTH, PlinkoEngine.HEIGHT);
      }
    }
    this._clearBall();
  };

  PlinkoEngine.prototype.dropBall = function (onResult) {
    if (this.isDropping) return;
    this.onResultCallback = typeof onResult === 'function' ? onResult : null;

    this._clearBall();

    var startX = PlinkoEngine.WIDTH / 2;
    var startY = 20;
    var radius = 10;

    this.ball = Bodies.circle(startX, startY, radius, {
      restitution: 0.6,
      friction: 0.02,
      frictionAir: 0.005,
      render: { fillStyle: '#22D3EE' }
    });

    Composite.add(this.world, this.ball);
    this.isDropping = true;
  };

  PlinkoEngine.prototype._clearBall = function () {
    if (this.ball) {
      Composite.remove(this.world, this.ball);
      this.ball = null;
    }
    this.isDropping = false;
  };

  PlinkoEngine.prototype._finishDrop = function (slotIndexFromBucket) {
    if (!this.isDropping) return;

    var slotIndex = slotIndexFromBucket;
    if (typeof slotIndex !== 'number') {
      // запасной вариант — считаем по X-координате
      var pos = this.ball ? this.ball.position : { x: PlinkoEngine.WIDTH / 2 };
      var slotWidth = PlinkoEngine.WIDTH / this.slotsCount;
      slotIndex = Math.floor(pos.x / slotWidth);
      if (slotIndex < 0) slotIndex = 0;
      if (slotIndex >= this.slotsCount) slotIndex = this.slotsCount - 1;
    }

    var multiplier = this.multipliers[slotIndex] || 0;
    var payload = { slotIndex: slotIndex, multiplier: multiplier };

    this._clearBall();

    if (this.onResultCallback) {
      this.onResultCallback(payload);
    }
  };

  global.PlinkoEngine = PlinkoEngine;

  // ---------------------------------------------------------------------------
  // UI-ОБВЯЗКА ДЛЯ ТЕКУЩЕЙ СТРАНИЦЫ PLINKO LIVE
  // ---------------------------------------------------------------------------
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      if (!global.PlinkoEngine || !global.Matter) return;

      var canvas         = document.getElementById('plinkoCanvas');
      var betInput       = document.getElementById('bet');
      var riskSelect     = document.getElementById('risk');
      var rowsSelect     = document.getElementById('rows');
      var rowsLabel      = document.getElementById('rowsLabel');
      var balanceEl      = document.getElementById('balance');
      var dropBtn        = document.getElementById('dropBtn');
      var autoBtn        = document.getElementById('autoBtn');
      var resultText     = document.getElementById('resultText');
      var multipliersRow = document.getElementById('multipliersRow');
      var yearEl         = document.getElementById('year');

      if (!canvas || !betInput || !riskSelect ||
          !balanceEl || !dropBtn || !autoBtn ||
          !resultText || !multipliersRow) {
        return;
      }

      if (yearEl) {
        yearEl.textContent = String(new Date().getFullYear());
      }

      // Мультипликаторы, близкие к оригиналу.
      // Medium / 16 rows — точно как на скрине:
      // 110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110
      var MULTIPLIERS = {
        low: {
          10: [5.6, 2.4, 1.6, 1.3, 1.1, 1, 1.1, 1.3, 1.6, 2.4, 5.6],
          16: [13, 4.4, 2.4, 1.8, 1.5, 1.2, 1.1, 1, 1, 1.1, 1.2, 1.5, 1.8, 2.4, 4.4, 13, 13]
        },
        medium: {
          10: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
          16: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110]
        },
        high: {
          10: [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76],
          16: [620, 165, 41, 15, 6.2, 2.6, 1.4, 0.7, 0.4, 0.7, 1.4, 2.6, 6.2, 15, 41, 165, 620]
        }
      };

      var balance = 1000;
      var autoMode = false;
      var isDropping = false;
      var engine = null;

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

      function getRows() {
        if (rowsSelect) {
          var v = parseInt(rowsSelect.value, 10);
          if (!isNaN(v) && v > 1) return v;
        }
        return 10;
      }

      function getMultipliers(risk, rows) {
        var byRisk = MULTIPLIERS[risk] || {};
        var arr = byRisk[rows];
        if (Array.isArray(arr) && arr.length === rows + 1) {
          return arr.slice();
        }
        return defaultMultipliers(rows + 1);
      }

      function updateMultipliersUI(risk, rows) {
        var mults = getMultipliers(risk, rows);
        multipliersRow.innerHTML = '';
        var text = 'Multipliers (' + risk + ' risk, ' + rows + ' rows): ' +
          mults.map(function (m) { return 'x' + m; }).join(' • ');
        multipliersRow.textContent = text;
      }

      function updateRowsLabel(rows) {
        if (rowsLabel) rowsLabel.textContent = String(rows);
      }

      function refreshEngine() {
        var rows = getRows();
        var risk = riskSelect.value || 'medium';
        var mults = getMultipliers(risk, rows);

        if (engine) engine.stop();
        engine = new global.PlinkoEngine(canvas, { rows: rows, multipliers: mults });
        engine.start();

        updateMultipliersUI(risk, rows);
        updateRowsLabel(rows);
        setResult('Risk: ' + risk + '. Rows: ' + rows + '. Press "Drop ball" to play.', 'neutral');
      }

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
        if (!engine || isDropping) return;

        var bet = parseFloat(betInput.value);
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
          var multiplier =
            result && typeof result.multiplier === 'number'
              ? result.multiplier
              : 0;

          var win = bet * multiplier;
          balance += win;
          balanceEl.textContent = balance.toFixed(2);

          var risk = riskSelect.value || 'medium';
          var rows = getRows();

          if (win > bet) {
            setResult(
              'Risk: ' + risk + ', rows: ' + rows +
              '. Slot x' + multiplier.toFixed(2) +
              '. You won ' + win.toFixed(2) + ' virtual credits.',
              'win'
            );
          } else if (win === bet) {
            setResult(
              'Risk: ' + risk + ', rows: ' + rows +
              '. Slot x' + multiplier.toFixed(2) +
              '. You got your bet back (' + win.toFixed(2) + ').',
              'neutral'
            );
          } else {
            setResult(
              'Risk: ' + risk + ', rows: ' + rows +
              '. Slot x' + multiplier.toFixed(2) +
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

      // Привязка событий
      balanceEl.textContent = balance.toFixed(2);

      dropBtn.addEventListener('click', function () {
        if (autoMode) return;
        dropOnce(false);
      });

      autoBtn.addEventListener('click', function () {
        if (!autoMode) {
          autoMode = true;
          autoBtn.textContent = 'Stop auto';
          autoBtn.classList.add('auto-active');
          dropOnce(true);
        } else {
          stopAuto();
        }
      });

      riskSelect.addEventListener('change', refreshEngine);
      if (rowsSelect) rowsSelect.addEventListener('change', refreshEngine);

      // Первый запуск
      refreshEngine();
    });
  }
})(typeof window !== 'undefined' ? window : this);
