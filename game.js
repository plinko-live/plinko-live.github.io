document.addEventListener("DOMContentLoaded", () => {
  const balanceEl = document.getElementById("balance");
  const betInput = document.getElementById("bet");
  const dropBtn = document.getElementById("dropBtn");
  const resultText = document.getElementById("resultText");
  const boardEl = document.getElementById("plinkoBoard");
  const slotsRowEl = document.getElementById("slotsRow");
  const multipliersRowEl = document.getElementById("multipliersRow");
  const ballEl = document.getElementById("ball");
  const yearEl = document.getElementById("year");
  const riskSelect = document.getElementById("risk");
  const rowsLabel = document.getElementById("rowsLabel");

  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // Количество рядов, как в одной из конфигураций оригинальной игры
  const ROWS = 10;
  rowsLabel.textContent = ROWS.toString();

  // Мультипликаторы из оригинального binPayouts для rowCount = 10
  const BIN_PAYOUTS = {
    low:   [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
    medium:[22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
    high:  [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76]
  };

  let balance = 1000;
  let isDropping = false;
  let currentRisk = riskSelect.value; // low / medium / high

  balanceEl.textContent = balance.toFixed(2);

  // --- Вспомогательные функции ---

  function setResult(msg, type = "neutral") {
    resultText.textContent = msg;
    resultText.style.color =
      type === "win" ? "#4ade80" : type === "lose" ? "#f97316" : "#9ca3af";
  }

  // биномиальное распределение для n рядов (n испытаний, p=0.5)
  function computeBinProbabilities(n) {
    const probs = [];
    const p = 0.5;
    const q = 1 - p;

    function nCk(nn, kk) {
      let res = 1;
      for (let i = 1; i <= kk; i++) {
        res = (res * (nn - (kk - i))) / i;
      }
      return res;
    }

    for (let k = 0; k <= n; k++) {
      const comb = nCk(n, k);
      const prob = comb * Math.pow(p, k) * Math.pow(q, n - k);
      probs.push(prob);
    }

    const sum = probs.reduce((a, b) => a + b, 0);
    return probs.map((x) => x / sum);
  }

  const BINOMIAL_PROBS = computeBinProbabilities(ROWS);

  function weightedRandomIndex(weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    const r = Math.random() * total;
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (r <= acc) return i;
    }
    return weights.length - 1;
  }

  function createSlots() {
    const multipliers = BIN_PAYOUTS[currentRisk];
    slotsRowEl.textContent = "";
    multipliersRowEl.textContent = "";

    const slots = [];

    multipliers.forEach((m, index) => {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.dataset.index = index.toString();
      slot.textContent = `x${m}`;
      slotsRowEl.appendChild(slot);
      slots.push(slot);
    });

    multipliers.forEach((m, index) => {
      const span = document.createElement("span");
      span.textContent =
        index === 0 ? `Multipliers (risk ${currentRisk}): x${m}` : `• x${m}`;
      multipliersRowEl.appendChild(span);
    });

    return slots;
  }

  let slots = createSlots();

  function resetBallToTop() {
    ballEl.style.transition = "none";
    ballEl.style.top = "-24px";
    ballEl.style.left = "50%";
    ballEl.style.transform = "translateX(-50%)";

    // форсим перерисовку
    void ballEl.offsetWidth;
    ballEl.style.transition =
      "top 0.9s ease-out, left 0.9s ease-in-out, transform 0.9s ease-in-out";
  }

  function dropBall() {
    if (isDropping) return;

    let bet = parseFloat(betInput.value);
    if (isNaN(bet) || bet <= 0) {
      setResult("Enter a valid bet greater than 0.", "lose");
      return;
    }

    if (bet > balance) {
      setResult("Insufficient balance.", "lose");
      return;
    }

    balance -= bet;
    balanceEl.textContent = balance.toFixed(2);

    // индекс слота по биномиальному распределению
    const index = weightedRandomIndex(BINOMIAL_PROBS);
    const multipliers = BIN_PAYOUTS[currentRisk];
    const multiplier = multipliers[index];
    const targetSlot = slots[index];

    // подсветка
    slots.forEach((s) => s.classList.remove("highlight", "active"));
    targetSlot.classList.add("highlight", "active");

    const boardRect = boardEl.getBoundingClientRect();
    const slotRect = targetSlot.getBoundingClientRect();

    const ballSize = ballEl.offsetWidth || 18;
    const targetLeft =
      slotRect.left - boardRect.left + slotRect.width / 2 - ballSize / 2;
    const targetTop =
      slotRect.top - boardRect.top - ballSize / 2;

    resetBallToTop();

    isDropping = true;
    dropBtn.disabled = true;
    setResult("Ball is dropping...", "neutral");

    // запускаем анимацию на следующий тик
    requestAnimationFrame(() => {
      ballEl.style.transform = "translateX(0)";
      ballEl.style.left = `${targetLeft}px`;
      ballEl.style.top = `${targetTop}px`;
    });

    setTimeout(() => {
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
    }, 950);
  }

  dropBtn.addEventListener("click", dropBall);

  riskSelect.addEventListener("change", () => {
    currentRisk = riskSelect.value;
    slots = createSlots();
    setResult(
      `Risk changed to "${currentRisk}". Press "Drop ball" to continue.`,
      "neutral"
    );
  });
});
