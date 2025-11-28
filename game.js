(function () {
      'use strict';

      const ROWS = 10;
      const RISK_MULTIPLIERS = {
        low:    [8.9,  3,   1.4, 1.1, 1,   0.5, 1,   1.1, 1.4, 3,   8.9],
        medium: [22,   5,   2,   1.4, 0.6, 0.4, 0.6, 1.4, 2,   5,   22],
        high:   [76,   10,  3,   0.9, 0.3, 0.2, 0.3, 0.9, 3,   10,  76]
      };

      let balance = 1000;
      let autoMode = false;
      let isDropping = false;

      // DOM
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

        multipliers.forEach((m, idx) => {
          const span = document.createElement('span');
          span.textContent =
            idx === 0
              ? `Multipliers (${risk} risk): x${m}`
              : `• x${m}`;
          multipliersRow.appendChild(span);
        });
      }

      // === инициализация движка ===
      if (!window.PlinkoEngine || !canvas) {
        console.error('PlinkoEngine or canvas not found');
        return;
      }

      const engine = new window.PlinkoEngine(canvas, {
        rows: ROWS,
        multipliers: RISK_MULTIPLIERS[riskSelect.value] || RISK_MULTIPLIERS.medium
      });
      engine.start();

      // небольшая «дыра» в инкапсуляции, но нам норм: просто меняем multipliers у движка
      function applyRisk() {
        const risk = riskSelect.value || 'medium';
        const multipliers = RISK_MULTIPLIERS[risk] || RISK_MULTIPLIERS.medium;
        engine.multipliers = multipliers;
        updateMultipliersUI(risk);
        setResult(`Risk set to ${risk}. Press "Drop ball" to play.`, 'neutral');
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
        setTimeout(() => {
          if (autoMode && !isDropping) {
            dropOnce(true);
          }
        }, 500);
      }

      function dropOnce(fromAuto) {
        if (isDropping) return;

        let bet = parseFloat(betInput.value);
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

        engine.dropBall((result) => {
          const multiplier = typeof result.multiplier === 'number'
            ? result.multiplier
            : 0;

          const win = bet * multiplier;
          balance += win;
          balanceEl.textContent = balance.toFixed(2);

          const risk = riskSelect.value || 'medium';

          if (win > bet) {
            setResult(
              `Risk: ${risk}. Slot x${multiplier.toFixed(2)}. You won ${win.toFixed(2)} virtual credits.`,
              'win'
            );
          } else if (win === bet) {
            setResult(
              `Risk: ${risk}. Slot x${multiplier.toFixed(2)}. You got your bet back (${win.toFixed(2)}).`,
              'neutral'
            );
          } else {
            setResult(
              `Risk: ${risk}. Slot x${multiplier.toFixed(2)}. You receive ${win.toFixed(2)} back from ${bet.toFixed(2)}.`,
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

      // === события UI ===
      dropBtn.addEventListener('click', () => {
        if (autoMode) return; // во время авто не даём ручной клик
        dropOnce(false);
      });

      autoBtn.addEventListener('click', () => {
        if (!autoMode) {
          startAuto();
        } else {
          stopAuto();
        }
      });

      riskSelect.addEventListener('change', () => {
        applyRisk();
      });

      setResult('Press "Drop ball" to start.', 'neutral');
    })();
