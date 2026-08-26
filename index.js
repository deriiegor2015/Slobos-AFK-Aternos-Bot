const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const autoEat = require('mineflayer-auto-eat').plugin;
const express = require('express');
const fs = require('fs');
const path = require('path');

// Завантаження налаштувань із settings.json
const settingsPath = path.join(__dirname, 'settings.json');
let settings = {
  server: {
    ip: "HumCraft.aternos.me",
    port: 61118,
    version: "1.21.4"
  },
  "bot-account": {
    "username": "YehorBot",
    "type": "offline"
  }
};

if (fs.existsSync(settingsPath)) {
  try {
    const data = fs.readFileSync(settingsPath, 'utf8');
    settings = JSON.parse(data);
  } catch (err) {
    console.error("Помилка читання settings.json:", err);
  }
}

// Налаштування Express-сервера для Render
const app = express();
const PORT = process.env.PORT || 10000;

let botState = {
  connected: false,
  username: settings["bot-account"].username,
  host: settings.server.ip,
  port: settings.server.port,
  reconnectAttempts: 0,
  logs: []
};

function addLog(message) {
  const time = new Date().toLocaleTimeString();
  const logMessage = `[${time}] ${message}`;
  console.log(logMessage);
  botState.logs.unshift(logMessage);
  if (botState.logs.length > 100) {
    botState.logs.pop();
  }
}

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Slobos Bot Status</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; background: #1e1e1e; color: #fff; padding: 20px; }
          .status { padding: 10px; border-radius: 5px; display: inline-block; font-weight: bold; }
          .online { background: #28a745; }
          .offline { background: #dc3545; }
          pre { background: #2d2d2d; padding: 15px; border-radius: 5px; height: 300px; overflow-y: scroll; }
        </style>
      </head>
      <body>
        <h1>Статус Блукаючого Бота</h1>
        <p>Статус: <span class="status ${botState.connected ? 'online' : 'offline'}">${botState.connected ? 'ONLINE' : 'OFFLINE'}</span></p>
        <p>Сервер: <b>${botState.host}:${botState.port}</b></p>
        <p>Бот: <b>${botState.username}</b></p>
        <h3>Логи підключення та дій:</h3>
        <pre>${botState.logs.join('\n')}</pre>
        <script>setTimeout(() => location.reload(), 10000);</script>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`[Server] Запущено на порті ${PORT}`);
});

let bot = null;
let spawnHandled = false;

function createBot() {
  spawnHandled = false;
  addLog(`[Bot] Підключення до ${settings.server.ip}:${settings.server.port}...`);

  try {
    bot = mineflayer.createBot({
      host: settings.server.ip,
      port: settings.server.port,
      username: settings["bot-account"].username,
      version: settings.server.version || false
    });
  } catch (err) {
    addLog(`[Bot] Помилка ініціалізації: ${err.message}`);
    botState.connected = false;
    scheduleReconnect();
    return;
  }

  // Завантажуємо перевірені плагіни
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(autoEat);

  bot.once("spawn", () => {
    if (spawnHandled) return;
    spawnHandled = true;

    botState.connected = true;
    botState.reconnectAttempts = 0;
    addLog("[Bot] Успішно зайшов на сервер і з'явився у світі!");

    // Автоматичний вхід через AuthMe (заміни ТвійПароль на свій)
    setTimeout(() => {
      bot.chat("/login chaloyehor1");
      addLog("[Bot] Відправлено команду /login");
    }, 1500);

    // Налаштування навігації для ходіння
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    defaultMove.canDig = false; // Вимикаємо копання, щоб бот спокійно ходив, а не ламав блоки
    bot.pathfinder.setMovements(defaultMove);

    // Налаштування авто-їди
    if (bot.autoEat) {
      bot.autoEat.options = {
        priority: 'foodPoints',
        startHTML: 14,
        bannedFood: []
      };
      addLog("[Bot] Авто-їжа активована.");
    }

    addLog("[Bot] Бот готовий до прогулянок світом!");

    // Цикл: бот самостійно прогулюється навколо спавну
    const wanderInterval = setInterval(() => {
      if (!bot || !bot.entity || !bot.pathfinder) {
        clearInterval(wanderInterval);
        return;
      }

      if (!bot.pathfinder.isMoving()) {
        const randomX = bot.entity.position.x + (Math.floor(Math.random() * 20) - 10);
        const randomZ = bot.entity.position.z + (Math.floor(Math.random() * 20) - 10);
        const goal = new goals.GoalXZ(randomX, randomZ);
        
        bot.pathfinder.setGoal(goal);
        addLog(`[Bot] Йду на координати: X: ${Math.round(randomX)}, Z: ${Math.round(randomZ)}`);
      }
    }, 12000); // Кожні 12 секунд обирає нову точку для прогулянки
  });

  bot.on("autoeat_started", () => {
    addLog("[Bot] Бот почав їсти їжу...");
  });

  bot.on("kicked", (reason) => {
    botState.connected = false;
    addLog(`[Bot] Кікнуто з сервера: ${reason}`);
  });

  bot.on("end", (reason) => {
    botState.connected = false;
    addLog(`[Bot] Відключено: ${reason}`);
    scheduleReconnect();
  });

  bot.on("error", (err) => {
    addLog(`[Bot] Помилка: ${err.message}`);
  });
}

function scheduleReconnect() {
  botState.reconnectAttempts++;
  const delay = Math.min(10000 * botState.reconnectAttempts, 60000);
  addLog(`[Bot] Перепідключення через ${delay / 1000} сек...`);
  setTimeout(createBot, delay);
}

createBot();
