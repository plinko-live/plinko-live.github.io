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

  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // Множители по слотам (можешь подправить под нужный риск-профиль)
  const multipliers = [0.5, 0.7, 1, 1.5, 2, 1.5, 1, 0.7, 0.5];
  let balance = 1000;
  let isDropping = false;

  balanceEl.textContent = balance.toFixed(2);

  // Создаём слоты в DOM
  const slots = multipliers.map((m, index) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.index = index.toString();
    slot.textContent = `x${m}`;
    slotsRowEl.appendChild(slot);
    return slot;
  });

  // Подписи множителей
  multipliersRowEl.textContent = "";
  multipliers.forEach((m, index) => {
    const span = document.createElement("span");
    span.textContent = index === 0 ? `Multipliers: x${m}` : `• x${m}`;
    multipliersRowEl.appendChild(span);
  });

  function setResult(msg, type = "neutral") {
    resultText.textContent = msg;
    resultText.style.color =
      type === "win" ? "#4ade80" : type === "lose" ? "#f97316" : "#9ca3af";
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

    // Снимаем ставку с баланса
    balance -= bet;
    balanceEl.textContent = balance.toFixed(2);

    // Выбираем случайный слот
    const index = Math.floor(Math.random() * multipliers.length);
    const multiplier = multipliers[index];
    const targetSlot = slots[index];

    // Подсветка слота
    slots.forEach((s) => s.classList.remove("highlight"));
    targetSlot.classList.add("highlight");

    // Координаты слота
    const boardRect = boardEl.getBoundingClientRect();
    const slotRect = targetSlot.getBoundingClientRect();

    const ballSize = ballEl.offsetWidth || 18;
    const targetLeft =
      slotRect.left - boardRect.left + slotRect.width / 2 - ballSize / 2;
    const targetTop =
      slotRect.top - boardRect.top - ballSize / 2; // немного над слотом

    // Сбрасываем мяч в стартовую позицию
    ballEl.style.transition = "none";
    ballEl.style.top = "-24px";
    ballEl.style.left = "50%";
    ballEl.style.transform = "translateX(-50%)";

    // Небольшая задержка для корректной анимации
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ballEl.style.transition =
          "top 0.9s ease-out, left 0.9s ease-in-out, transform 0.9s ease-in-out";
        ballEl.style.transform = "translateX(0)";
        ballEl.style.left = `${targetLeft}px`;
        ballEl.style.top = `${targetTop}px`;
      });
    });

    isDropping = true;
    dropBtn.disabled = true;
    setResult("Ball is dropping...", "neutral");

    // Когда "анимация" закончится — считаем выигрыш
    setTimeout(() => {
      const win = bet * multiplier;
      balance += win;
      balanceEl.textContent = balance.toFixed(2);

      if (win > bet) {
        setResult(
          `Ball landed in x${multiplier.toFixed(
            2
          )}. You won ${win.toFixed(2)}!`,
          "win"
        );
      } else if (win === bet) {
        setResult(
          `Ball landed in x${multiplier.toFixed(
            2
          )}. You got your bet back (${win.toFixed(2)}).`,
          "neutral"
        );
      } else {
        setResult(
          `Ball landed in x${multiplier.toFixed(
            2
          )}. You got ${win.toFixed(2)} back.`,
          "lose"
        );
      }

      isDropping = false;
      dropBtn.disabled = false;
    }, 950);
  }

  dropBtn.addEventListener("click", dropBall);
});
