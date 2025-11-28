document.addEventListener("DOMContentLoaded", () => {
  const balanceEl = document.getElementById("balance");
  const betInput = document.getElementById("bet");
  const dropBtn = document.getElementById("dropBtn");
  const autoBtn = document.getElementById("autoBtn");
  const resultText = document.getElementById("resultText");
  const boardEl = document.getElementById("plinkoBoard");
  const slotsRowEl = document.getElementById("slotsRow");
  const multipliersRowEl = document.getElementById("multipliersRow");
  const ballEl = document.getElementById("ball");
  const pegsLayerEl = document.getElementById("pegsLayer");
  const yearEl = document.getElementById("year");
  const riskSelect = document.getElementById("risk");
  const rowsLabel = document.getElementById("rowsLabel");

  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const ROWS = 10;          // количество рядов
  const SLOTS = ROWS + 1;   // количество слотов
  const BALL_RADIUS = 11;
  const AUTO_DELAY = 550;   // пауза между дропами в авто-режиме (мс)

  rowsLabel.textContent = ROWS.toString();

  // payout-таблицы, максимально близкие к оригинальному примеру
  const BIN_PAYOUTS = {
    low:   [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
    medium:[22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
    high:  [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76]
  };

  let balance = 1000;
  let isDropping = false;
  let autoMode = false;
  let currentRisk = riskSelect.value; // 'low' | 'medium' | 'high'
  let geometry = null;
  let slots = [];

  balanceEl.textContent = balance.toFixed(2);

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setResult(msg, type = "neutral") {
    resultText.textContent = msg;
    resultText.style.color =
      type === "win" ? "#4ade80" : type === "lose" ? "#22d3ee" : "#9ca3af";
  }

  // Геометрия доски (в px внутри padding)
  function computeGeometry() {
    const boardWidth = boardEl.clientWidth;
    const boardHeight = boardEl.clientHeight;

    const leftPadding = 12;
    const rightPadding = 12;
    const topPadding = 14;
    const bottomPadding = 46;

    const innerLeft = leftPadding;
    const innerRight = boardWidth - rightPadding;
    const innerTop = topPadding;
    const innerBottom = boardHeight - bottomPadding;

    const innerWidth = innerRight - innerLeft;
    const innerHeight = innerBottom - innerTop;

    geometry = {
      innerLeft,
      innerTop,
      innerWidth,
      innerHeight
    };
  }

  // координаты центра для "состояния" (row, rightsCount)
  // row — от 0 до ROWS (может быть дробным для пинов)
  function getCenterCoord(row, rightsCount) {
    const slotWidth = geometry.innerWidth / SLOTS;

    // сколько "сдвигов" нужно, чтобы состояние (row, rights) встало по центру доски
    const shift = (SLOTS - 1 - row) / 2; // row может быть дробным
    const centerIndex = rightsCount + shift + 0.5; // индекс «ячейки» по горизонтали

    const x = geometry.innerLeft + centerIndex * slotWidth;
    const y = geometry.innerTop + geometry.innerHeight * (row / ROWS);

    return { x, y };
  }

  function setBallPosition(row, rightsCount) {
    const { x, y } = getCenterCoord(row, rightsCount);
    ballEl.style.left = `${x - BALL_RADIUS}px`;
    ballEl.style.top = `${y - BALL_RADIUS}px`;
  }

  function resetBallInstant() {
    // старт — row = 0, rights = 0 (центр)
    setBallPosition(0, 0);
  }

  function createSlots() {
    const multipliers = BIN_PAYOUTS[currentRisk];
    slotsRowEl.textContent = "";
    multipliersRowEl.textContent = "";

    const created = [];

    multipliers.forEach((m, index) => {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.dataset.index = String(index);
      slot.textContent = `x${m}`;
      slotsRowEl.appendChild(slot);
      created.push(slot);
    });

    multipliers.forEach((m, index) => {
      const span = document.createElement("span");
      span.textContent =
        index === 0
          ? `Multipliers (risk ${currentRisk}): x${m}`
          : `• x${m}`;
      multipliersRowEl.appendChild(span);
    });

    return created;
  }

  function createPegs() {
    pegsLayerEl.textContent = "";
    // ряды пинов: от 1 до ROWS-1 условно, но визуально можно от 1 до ROWS-1,
    // чтобы не ставить пины прямо у слотов
    for (let row = 1; row < ROWS; row++) {
      const pegsInRow = row + 1; // как в классическом Plinko
      for (let i = 0; i < pegsInRow; i++) {
        // центр пина на "полушаге" между рядами
        const pegRow = row - 0.5;
        const { x, y } = getCenterCoord(pegRow, i);
        const peg = document.createElement("div");
        peg.className = "peg";
        const size = 6;
        peg.style.left = `${x - size / 2}px`;
        peg.style.top = `${y - size / 2}px`;
        pegsLayerEl.appendChild(peg);
      }
    }
  }

  function initBoard() {
    computeGeometry();
    slots = createSlots();
    createPegs();
    resetBallInstant();
  }

  // Переинициализация при изменении размера окна
  window.addEventListener("resize", () => {
    initBoard();
  });

  async function dropBall(fromAuto = false) {
    if (isDropping) return;

    let bet = parseFloat(betInput.value);
    if (isNaN(bet) || bet <= 0) {
      setResult("Enter a valid bet greater than 0.", "lose");
      return;
    }

    if (bet > balance) {
      setResult("Insufficient balance.", "lose");
      // если авто-режим и денег не хватает — сразу стоп
      if (fromAuto) stopAuto();
      return;
    }

    isDropping = true;
    dropBtn.disabled = true;

    balance -= bet;
    balanceEl.textContent = balance.toFixed(2);

    // подчищаем подсветки
    slots.forEach((s) => s.classList.remove("highlight", "active"));

    // каждый шаг — row++, ball идёт влево/вправо
    let rights = 0;
    resetBallInstant();
    setResult("Ball is dropping...", "neutral");

    // небольшая плавность движения (медленнее, чем раньше)
    const STEP_MS = 130;

    // ряд от 1 до ROWS
    for (let row = 1; row <= ROWS; row++) {
      const dirRight = Math.random() < 0.5;
      if (dirRight) rights = Math.min(rights + 1, row); // число «правых» шагов

      const { x, y } = getCenterCoord(row, rights);
      ballEl.style.transition =
        "top 0.14s ease-out, left 0.14s ease-in-out";
      ballEl.style.left = `${x - BALL_RADIUS}px`;
      ballEl.style.top = `${y - BALL_RADIUS}px`;

      await sleep(STEP_MS);
    }

    // Число правых шагов = индекс слота (0..ROWS)
    const slotIndex = Math.max(0, Math.min(SLOTS - 1, rights));
    const multipliers = BIN_PAYOUTS[currentRisk];
    const multiplier = multipliers[slotIndex];

    const targetSlot = slots[slotIndex];
    if (targetSlot) {
      targetSlot.classList.add("highlight", "active");
    }

    const win = bet * multiplier;
    balance += win;
    balanceEl.textContent = balance.toFixed(2);

    if (win > bet) {
      setResult(
        `Rows: ${ROWS}, risk: ${currentRisk}. Slot x${multiplier.toFixed(
          2
        )}. You won ${win.toFixed(2)}.`,
        "win"
      );
    } else if (win === bet) {
      setResult(
        `Rows: ${ROWS}, risk: ${currentRisk}. Slot x${multiplier.toFixed(
          2
        )}. You got your bet back (${win.toFixed(2)}).`,
        "neutral"
      );
    } else {
      setResult(
        `Rows: ${ROWS}, risk: ${currentRisk}. Slot x${multiplier.toFixed(
          2
        )}. You receive ${win.toFixed(2)} back.`,
        "lose"
      );
    }

    isDropping = false;
    dropBtn.disabled = false;
  }

  function stopAuto() {
    autoMode = false;
    autoBtn.textContent = "Start auto";
    autoBtn.classList.remove("auto-active");
  }

  async function startAuto() {
    if (autoMode) return;
    autoMode = true;
    autoBtn.textContent = "Stop auto";
    autoBtn.classList.add("auto-active");

    while (autoMode) {
      if (isDropping) {
        await sleep(50);
        continue;
      }

      let bet = parseFloat(betInput.value);
      if (isNaN(bet) || bet <= 0 || bet > balance) {
        setResult(
          "Auto stopped: invalid bet or insufficient balance.",
          "lose"
        );
        stopAuto();
        break;
      }

      await dropBall(true);
      await sleep(AUTO_DELAY);
    }
  }

  dropBtn.addEventListener("click", () => {
    if (autoMode) return; // при авто-режиме ручной дроп блокируем, чтобы не путаться
    dropBall(false);
  });

  autoBtn.addEventListener("click", () => {
    if (!autoMode) startAuto();
    else stopAuto();
  });

  riskSelect.addEventListener("change", () => {
    currentRisk = riskSelect.value;
    initBoard();
    setResult(
      `Risk changed to "${currentRisk}". Press "Drop ball" to continue.`,
      "neutral"
    );
  });

  // первая инициализация
  initBoard();
  setResult('Choose bet and press "Drop ball".');
});
