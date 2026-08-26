"use strict";

const { addLog, getLogs } = require("./logger");
const mineflayer = require("mineflayer");
const { Movements, pathfinder, goals } = require("mineflayer-pathfinder");
const collectBlock = require("mineflayer-collectblock");
const autoEat = require("mineflayer-auto-eat");
const pvpModule = require("mineflayer-pvp");

// Безпечне витягування функцій плагінів
const pfPlugin = pathfinder.plugin || pathfinder;
const cbPlugin = collectBlock.plugin || collectBlock;
const aePlugin = autoEat.plugin || autoEat;
const pvpPlugin = pvpModule.plugin || pvpModule;

const { GoalBlock } = goals;
const config = require("./settings.json");
const express = require("express");

// ============================================================
// EXPRESS SERVER - Вебпанель та моніторинг
// ============================================================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;

let botState = {
  connected: false,
  lastActivity: Date.now(),
  reconnectAttempts: 0,
  startTime: Date.now(),
  errors: [],
  wasThrottled: false,
};

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="uk">
      <head>
        <title>${config.name} Dashboard</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Inter, sans-serif; background: #0d1117; color: #e6edf3; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
          main { width: 100%; max-width: 400px; padding: 20px; background: #161b22; border-radius: 12px; border: 1px solid #30363d; }
          h1 { font-size: 22px; margin-bottom: 5px; color: #f0f6fc; }
          p { color: #8b949e; font-size: 14px; }
          .status { padding: 12px; border-radius: 8px; margin: 15px 0; font-weight: bold; text-align: center; }
          .online { background: #0d2218; color: #3fb950; border: 1px solid #238636; }
          .offline { background: #200d0d; color: #f85149; border: 1px solid #da3633; }
          .btn { display: block; width: 100%; padding: 12px; margin-top: 10px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; text-align: center; text-decoration: none; }
          .btn-start { background: #238636; color: white; }
          .btn-stop { background: #da3633; color: white; }
        </style>
      </head>
      <body>
        <main>
          <h1>🤖 Minecraft Bot</h1>
          <p>Повна імітація гравця (Woodcutter + PvP + AI)</p>
          <div id="status-box" class="status offline">Перевірка підключення...</div>
          <p><strong>Сервер:</strong> ${config.server.ip}</p>
          <p id="coords-text"><strong>Координати:</strong> Завантаження...</p>
          <button class="btn btn-start" onclick="fetch('/start',{method:'POST'}).then(()=>location.reload())">Запустити</button>
          <button class="btn btn-stop" onclick="fetch('/stop',{method:'POST'}).then(()=>location.reload())">Зупинити</button>
          <a href="/logs" class="btn" style="background: #21262d; color: #c9d1d9; margin-top: 15px; display:block;">Переглянути логи</a>
        </main>
        <script>
          setInterval(async () => {
            try {
              const res = await fetch('/health');
              const data = await res.json();
              const box = document.getElementById('status-box');
              if (data.status === 'connected') {
                box.className = 'status online';
                box.textContent = 'Статус: У грі (Онлайн)';
                if (data.coords) {
                  document.getElementById('coords-text').innerHTML = '<strong>Координати:</strong> X: ' + Math.floor(data.coords.x) + ', Y: ' + Math.floor(data.coords.y) + ', Z: ' + Math.floor(data.coords.z);
                }
              } else {
                box.className = 'status offline';
                box.textContent = 'Статус: Відключено';
              }
            } catch(e) {}
          }, 3000);
        </script>
      </body>
    </html>
  `);
});

app.get("/health", (req, res) => {
  res.json({
    status: botState.connected ? "connected" : "disconnected",
    uptime: Math.floor((Date.now() - botState.startTime) / 1000),
    coords: bot && bot.entity ? bot.entity.position : null,
  });
});

app.get("/ping", (req, res) => res.send("pong"));

app.get("/logs", (req, res) => {
  const logs = getLogs();
  res.send(`
    <html>
      <body style="background:#0d1117; color:#e6edf3; font-family:monospace; padding:20px;">
        <h2>Логи бота</h2>
        <a href="/" style="color: #58a6ff;">← На головну</a>
        <pre>${logs.join("\n")}</pre>
      </body>
    </html>
  `);
});

let botRunning = true;

app.post("/start", (req, res) => {
  if (botRunning) return res.json({ success: false });
  botRunning = true;
  createBot();
  res.json({ success: true });
});

app.post("/stop", (req, res) => {
  if (!botRunning) return res.json({ success: false });
  botRunning = false;
  if (bot) { bot.end(); bot = null; }
  clearAllIntervals();
  res.json({ success: true });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  addLog(`[Server] Запущено на порті ${PORT}`);
});

// ============================================================
// ЛОГІКА БОТА ТА ПОВЕДІНКА ГРАВЦЯ
// ============================================================
let bot = null;
let activeIntervals = [];
let reconnectTimeoutId = null;

function clearAllIntervals() {
  activeIntervals.forEach((id) => clearInterval(id));
  activeIntervals = [];
}

function addInterval(callback, delay) {
  const id = setInterval(callback, delay);
  activeIntervals.push(id);
  return id;
}

function createBot() {
  if (bot) {
    clearAllIntervals();
    try { bot.removeAllListeners(); bot.end(); } catch (e) {}
    bot = null;
  }

  addLog(`[Bot] Підключення до ${config.server.ip}:${config.server.port}...`);

  try {
    bot = mineflayer.createBot({
      username: config["bot-account"].username,
      password: config["bot-account"].password || undefined,
      auth: config["bot-account"].type,
      host: config.server.ip,
      port: config.server.port,
      version: config.server.version || false,
      hideErrors: false,
    });

    // Підключаємо всі плагіни безпечно
    bot.loadPlugin(pfPlugin);
    bot.loadPlugin(cbPlugin);
    bot.loadPlugin(aePlugin);
    bot.loadPlugin(pvpPlugin);

        bot.once("spawn", () => {
      if (spawnHandled) return;
      spawnHandled = true;

      botState.connected = true;
      botState.reconnectAttempts = 0;
      addLog("[Bot] Успішно зайшов на сервер і з'явився у світі!");

      // Автоматичний вхід через AuthMe (через 1.5 секунди після спавну)
      setTimeout(() => {
        bot.chat("/login chaloyehor1");
        addLog("[Bot] Відправлено команду /login");
      }, 1500);

      // Простий Анти-AFK рух (тепер без важкого pathfinder)
      setInterval(() => {
        if (bot.entity) {
          // Рандомний поворот голови або легкий стрибок, щоб не кікнуло за АФК
          const yaw = Math.random() * Math.PI * 2;
          const pitch = (Math.random() * Math.PI) - (Math.PI / 2);
          bot.look(yaw, pitch, true);
        }
      }, 10000); // Кожні 10 секунд бот озирається
    });

    bot.on('autoeat_started', (item) => {
      addLog(`[Food] Зголоднів, їм ${item.name}! 🍎`);
    });

    bot.on("kicked", (reason) => {
      addLog(`[Bot] Кікнуто з сервера: ${JSON.stringify(reason)}`);
      botState.connected = false;
      clearAllIntervals();
    });

    bot.on("end", (reason) => {
      addLog(`[Bot] Відключено: ${reason || "Причина невідома"}`);
      botState.connected = false;
      clearAllIntervals();
      if (botRunning) {
        reconnectTimeoutId = setTimeout(() => createBot(), 10000);
      }
    });

    bot.on("error", (err) => {
      addLog(`[Bot] Помилка: ${err.message}`);
    });

  } catch (err) {
    addLog(`[Bot] Помилка ініціалізації: ${err.message}`);
    if (botRunning) {
      reconnectTimeoutId = setTimeout(() => createBot(), 10000);
    }
  }
}

// ============================================================
// ПОВЕДІНКА ЖИВОГО ГРАВЦЯ (Рух, Рубка дерев, PvP)
// ============================================================
function initializePlayerBehavior(bot, mcData) {
  addLog("[PlayerAI] Активовано повну поведінку гравця (AI + PvP + Woodcutter).");

  addInterval(() => {
    if (!bot || !botState.connected) return;

    const filter = (entity) => 
      entity.type === 'mob' && 
      ['zombie', 'skeleton', 'spider', 'creeper'].includes(entity.name) && 
      entity.position.distanceTo(bot.entity.position) < 16;
    
    const target = bot.nearestEntity(filter);

    if (target) {
      if (!bot.pvp.target) {
        addLog(`[PvP] Помітив ворога (${target.name}), вступаю в бій! ⚔️`);
        bot.pvp.attack(target);
      }
    } else {
      if (bot.pvp.target) {
        bot.pvp.stop();
      }
    }
  }, 3000);

  addInterval(async () => {
    if (!bot || !botState.connected || bot.pathfinder.isMoving() || bot.pvp.target) return;

    try {
      const blockType = mcData.blocksByName.oak_log;
      if (!blockType) return;

      const block = bot.findBlock({
        matching: blockType.id,
        maxDistance: 24
      });

      if (!block) return;

      addLog("[PlayerAI] Помітив дерево поблизу, йду добувати древесину 🪓");
      await bot.collectBlock.collect(block);
      addLog("[PlayerAI] Успішно зрубав блок!");
    } catch (err) {}
  }, 120000);

  addInterval(() => {
    if (!bot || !botState.connected || bot.pathfinder.isMoving() || bot.pvp.target) return;
    
    const yaw = Math.random() * Math.PI * 2;
    const pitch = (Math.random() * 0.5) - 0.25;
    bot.look(yaw, pitch, true);
    
    if (Math.random() > 0.6) {
      const currentPos = bot.entity.position;
      const randomX = currentPos.x + (Math.random() * 6 - 3);
      const randomZ = currentPos.z + (Math.random() * 6 - 3);
      bot.pathfinder.setGoal(new GoalBlock(Math.floor(randomX), currentPos.y, Math.floor(randomZ)));
    }
  }, 30000);
}

// Запуск при старті
createBot();
