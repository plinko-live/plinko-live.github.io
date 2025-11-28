(function (global) {
  'use strict';

  var Matter = global.Matter || {};
  var Engine = Matter.Engine;
  var Render = Matter.Render;
  var Runner = Matter.Runner;
  var Composite = Matter.Composite;
  var Bodies = Matter.Bodies;
  var Body = Matter.Body;
  var Events = Matter.Events;

  if (!Engine || !Render) {
    console.warn('[PlinkoEngine] Matter.js not found. Include matter.min.js before this file.');
  }

  // --------- КЛАСС ДВИЖКА ---------
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

  // запасной набор множителей, если не передали свои
  function defaultMultipliers(count) {
    var mid = (count - 1) / 2;
    var arr = [];
    for (var i = 0; i < count; i++) {
      var dist = Math.abs(i - mid);
      var base = 1 + dist * 0.8;
      arr.push(Number(base.toFixed(2)));
    }
    return arr;
  }

  // построение сцены: треугольная сетка пинов + «коробки» слотов
  PlinkoEngine.prototype._setupScene = function () {
    var W = PlinkoEngine.WIDTH;
    var H = PlinkoEngine.HEIGHT;
    var wallThickness = 40;

    // стенки и пол
    var leftWall = Bodies.rectangle(-wallThickness / 2, H / 2, wallThickness, H, { isStatic: true });
    var rightWall = Bodies.rectangle(W + wallThickness / 2, H / 2, wallThickness, H, { isStatic: true });
    var floor = Bodies.rectangle(W / 2, H + wallThickness / 2, W, wallThickness, { isStatic: true });

    Composite.add(this.world, [leftWall, rightWall, floor]);

    // геометрия сетки пинов
    var topOffsetY = 40;
    var bottomOffsetY = 90;
    var usableHeight = H - topOffsetY - bottomOffsetY;
    var rowSpacing = usableHeight / this.rows;
    var pegRadius = 4;

    var centerX = W / 2;
    var baseStepX = W / (this.rows + 1); // горизонтальный шаг

    // треугольная (пирамидальная) сетка
    for (var row = 0; row < this.rows; row++) {
      var y = topOffsetY + (row + 1) * rowSpacing;
      var cols = row + 1;
      for (var col = 0; col < cols; col++) {
        var offsetFromCenter = (col - row / 2) * baseStepX;
        var x = centerX + offsetFromCenter;
        var peg = Bodies.circle(x, y, pegRadius, {
          isStatic: true,
          restitution: 0.3,
          render: { fillStyle: '#9CA3AF' }
        });
        this.pegs.push(peg);
      }
    }
    Composite.add(this.world, this.pegs);

    // слоты (коробки внизу)
    var bucketsY = H - 40;
    var slotWidth = W / this.slotsCount;
    var bucketHeight = 60;
    this.slotWidth = slotWidth;
    this.bucketHeight = bucketHeight;
    var bucket, bx;

    for (var i = 0; i < this.slotsCount; i++) {
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

    // когда шарик сталкивается с одной из коробок — раунд закончен
    Events.on(this.engine, 'collisionStart', function (event) {
      if (!self.ball || !self.isDropping) return;

      var pairs = event.pairs;
      for (var p = 0; p < pairs.length; p++) {
        var pair = pairs[p];
        var a = pair.bodyA;
        var b = pair.bodyB;

        var bucketBody = null;

        if (a === self.ball && self.buckets.indexOf(b) !== -1) {
          bucketBody = b;
        } else if (b === self.ball && self.buckets.indexOf(a) !== -1) {
          bucketBody = a;
        }

        if (bucketBody) {
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

  // подписи мультипликаторов прямо в слотах
  var self = this;
  Matter.Events.on(this.render, 'afterRender', function () {
    if (!self.render) return;
    var ctx = self.render.context;
    if (!ctx) return;

    ctx.save();
    ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (var i = 0; i < self.buckets.length; i++) {
      var bucket = self.buckets[i];
      var m = self.multipliers[i];
      if (m == null) continue;

      var pos = bucket.position;

      // цвет можно усложнить, но пока просто читаемый
      ctx.fillStyle = '#e5e7eb';
      ctx.fillText('x' + m, pos.x, pos.y);
    }

    ctx.restore();
  });
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

  // запуск шарика
  PlinkoEngine.prototype.dropBall = function (onResult) {
    if (this.isDropping) return;
    this.onResultCallback = typeof onResult === 'function' ? onResult : null;

    this._clearBall();

    var slotWidth = PlinkoEngine.WIDTH / this.slotsCount;
    // Рандомный сдвиг по X, чтобы путь не был одинаковым
    var randomOffset = (Math.random() - 0.5) * slotWidth * 0.7;
    var startX = PlinkoEngine.WIDTH / 2 + randomOffset;
    var startY = 20;
    // чем больше рядов, тем меньше шарик: 10 рядов ≈ 8px, 16 рядов ≈ 5px
    var radius = 8 - (this.rows - 10) * 0.5;
    if (radius < 4) radius = 4;


    this.ball = Bodies.circle(startX, startY, radius, {
      restitution: 0.6,
      friction: 0.02,
      frictionAir: 0.005,
      render: { fillStyle: '#22D3EE' }
    });

    // небольшой случайный начальный «пинок» по X
    var randomVX = (Math.random() - 0.5) * 2;
    Body.setVelocity(this.ball, { x: randomVX, y: 0 });

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

    var slotIndex =
      typeof slotIndexFromBucket === 'number' ? slotIndexFromBucket : 0;

    if (slotIndex < 0) slotIndex = 0;
    if (slotIndex >= this.slotsCount) slotIndex = this.slotsCount - 1;

    var multiplier = this.multipliers[slotIndex] || 0;
    var payload = { slotIndex: slotIndex, multiplier: multiplier };

    this._clearBall();

    if (this.onResultCallback) {
      this.onResultCallback(payload);
    }
  };

  global.PlinkoEngine = PlinkoEngine;

  // --------- ПРОСТАЯ UI-ОБВЁРТКА ---------
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

      if (
        !canvas || !betInput || !riskSelect ||
        !balanceEl || !dropBtn || !autoBtn ||
        !resultText || !multipliersRow
      ) {
        return;
      }

      if (yearEl) {
        yearEl.textContent = String(new Date().getFullYear());
      }

      // табличка множителей: точные для 10 и 16, остальные — генерация по профилю
      var MULTIPLIERS = {
        low: {
          10: [5.6, 2.4, 1.6, 1.3, 1.1, 1, 1.1, 1.3, 1.6, 2.4, 5.6]
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
        var value = rowsSelect ? parseInt(rowsSelect.value, 10) : 10;
        if (isNaN(value) || value < 10) value = 10;
        if (value > 16) value = 16;
        return value;
      }

      // fallback-генерация множителей для любого количества слотов
      function defaultForRisk(risk, slotsCount) {
        var arr = [];
        var edge, center;
        if (risk === 'low') {
          edge = 13;
          center = 1;
        } else if (risk === 'high') {
          edge = 200;
          center = 0.3;
        } else {
          edge = 60;
          center = 0.5;
        }
        var mid = (slotsCount - 1) / 2;
        for (var i = 0; i < slotsCount; i++) {
          var dist = Math.abs(i - mid) / mid;
          var val = center + (edge - center) * Math.pow(dist, 2);
          arr.push(Number(val.toFixed(1)));
        }
        return arr;
      }

      function getMultipliers(risk, rows) {
        var byRisk = MULTIPLIERS[risk] || {};
        var arr = byRisk[rows];
        if (Array.isArray(arr) && arr.length === rows + 1) {
          return arr.slice();
        }
        return defaultForRisk(risk, rows + 1);
      }

      // мультипликаторы в «кубиках» под доской
      function updateMultipliersUI(risk, rows, multipliers) {
        multipliersRow.textContent =
          'Multipliers (' + risk + ' risk, ' + rows + ' rows): ' +
          multipliers.map(function (m) { return 'x' + m; }).join(' · ');
      }

      function updateRowsLabel(rows) {
        if (rowsLabel) rowsLabel.textContent = String(rows);
      }

      function refreshEngine() {
        var rows = getRows();
        var risk = riskSelect.value || 'medium';
        var mults = getMultipliers(risk, rows);

        if (engine) engine.stop();
        engine = new global.PlinkoEngine(canvas, {
          rows: rows,
          multipliers: mults
        });
        engine.start();

        updateMultipliersUI(risk, rows, mults);
        updateRowsLabel(rows);
        setResult(
          'Risk: ' + risk + ', rows: ' + rows + '. Press "Drop ball" to play.',
          'neutral'
        );
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

      refreshEngine();
    });
  }
})(typeof window !== 'undefined' ? window : this);
