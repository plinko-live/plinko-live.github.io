// game.js — UI-обёртка над PlinkoEngine (Matter.js) для демо:
// bet, risk, balance, auto-play.

(function () {
  const ROWS = 10;
  const RISK_MULTIPLIERS = {
    low: [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
    medium: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
    high: [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76]
  };

  let engine = null;
  let balance = 1000;
  let autoMode = false;
  let isDropping = false;

  const balanceEl = document.getElementById("balance");
  const betInput = document.getElementById("bet");
  const dropBtn = document.getElementById("dropBtn");
  const autoBtn = document.getElementById("autoBtn");
  const resultText = document.getElementById("resultText");
  const riskSelect = document.getElementById("risk");
  const rowsLabel = document.getElementById("rowsLabel");
  const multipliersRowEl = document.getElementById("multipliersRow");
  const yearEl = document.getElementById("year");
  const canvas = document.getElementById("plinkoCanvas");

  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  rowsLabel.textContent = ROWS.toString();
  balanceEl.textContent = balance.toFixed(2);

  function setResult(msg, type) {
    resultText.textContent = msg;
    if (type === "win") {
      resultText.style.color = "#4ade80";
    } else if (type === "lose") {
      resultText.style.color = "#22d3ee";
    } else {
      resultText.style.color = "#9ca3af";
    }
  }

  function updateMultipliersUI(risk) {
    const multipliers = RISK_MULTIPLIERS[risk] || RISK_MULTIPLIERS.medium;
    multipliersRowEl.innerHTML = "";
    multipliers.forEach((m, index) => {
      const span = document.createElement("span");
      span.textContent =
        index === 0
          ? `Multipliers (${risk} risk): x${m}`
          : `• x${m}`;
      multipliersRowEl.appendChild(span);
    });
  }

  function createEngine() {
    if (!canvas || !window.PlinkoEngine) {
      console.error("PlinkoEngine or canvas not found");
      return;
    }
    const risk = riskSelect.value || "medium";
    const multipliers = RISK_MULTIPLIERS[risk] || RISK_MULTIPLIERS.medium;

    if (engine) {
      engine.stop();
    }

    engine = new window.PlinkoEngine(canvas, {
      rows: ROWS,
      multipliers
    });
    engine.start();
    updateMultipliersUI(risk);
    setResult(`Plinko board ready. Risk: ${risk}.`, "neutral");
  }

  function stopAuto() {
    autoMode = false;
    autoBtn.textContent = "Start auto";
    autoBtn.classList.remove("auto-active");
  }

  function nextAutoRound() {
    if (!autoMode) return;
    if (balance <= 0) {
      setResult("Auto stopped: balance is 0.", "lose");
      stopAuto();
      return;
    }
    setTimeout(() => {
      if (autoMode && !isDropping) {
        singleDrop(true);
      }
    }, 550);
  }

  function singleDrop(fromAuto) {
    if (!engine) {
      setResult("Game is not ready yet.", "lose");
      return;
    }
    if (isDropping) return;

    let bet = parseFloat(betInput.value);
    if (isNaN(bet) || bet <= 0) {
      setResult("Enter a valid bet greater than 0.", "lose");
      if (fromAuto) stopAuto();
      return;
    }
    if (bet > balance) {
      setResult("Insufficient balance.", "lose");
      if (fromAuto) stopAuto();
      return;
    }

    isDropping = true;
    dropBtn.disabled = true;

    balance -= bet;
    balanceEl.textContent = balance.toFixed(2);
    setResult("Ball is dropping...", "neutral");

    engine.dropBall((result) => {
      const multiplier = typeof result.multiplier === "number"
        ? result.multiplier
        : 0;
      const win = bet * multiplier;
      balance += win;
      balanceEl.textContent = balance.toFixed(2);

      const risk = riskSelect.value || "medium";

      if (win > bet) {
        setResult(
          `Risk: ${risk}. Slot x${multiplier.toFixed(
            2
          )}. You won ${win.toFixed(2)}.`,
          "win"
        );
      } else if (win === bet) {
        setResult(
          `Risk: ${risk}. Slot x${multiplier.toFixed(
            2
          )}. You got your bet back (${win.toFixed(2)}).`,
          "neutral"
        );
      } else {
        setResult(
          `Risk: ${risk}. Slot x${multiplier.toFixed(
            2
          )}. You receive ${win.toFixed(2)} back.`,
          "lose"
        );
      }

      isDropping = false;
      dropBtn.disabled = false;

      if (autoMode) {
        nextAutoRound();
      }
    });
  }

  function startAuto() {
    if (autoMode) return;
    autoMode = true;
    autoBtn.textContent = "Stop auto";
    autoBtn.classList.add("auto-active");
    singleDrop(true);
  }

  // === event listeners ===
  dropBtn.addEventListener("click", () => {
    if (autoMode) return; // не даём ручной клик во время авто
    singleDrop(false);
  });

  autoBtn.addEventListener("click", () => {
    if (!autoMode) {
      startAuto();
    } else {
      stopAuto();
    }
  });

  riskSelect.addEventListener("change", () => {
    createEngine();
  });

  // init
  createEngine();
  setResult('Choose bet and press "Drop ball".', "neutral");
})();
