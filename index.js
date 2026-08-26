const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
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
        <h1>Статус Живого Бота</h1>
        <p>Статус: <span class="status ${botState.connected ? 'online' : 'offline'}">${botState.connected ? 'ONLINE' : 'OFFLINE'}</span></p>
        <p>Сервер: <b>${botState.host}:${botState.port}</b></p>
        <p>Бот: <b>${botState.username}</b></p>
        <h3>Логи дій:</h3>
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

  bot.loadPlugin(pathfinder);

  bot.once("spawn", () => {
    if (spawnHandled) return;
    spawnHandled = true;

    botState.connected = true;
    botState.reconnectAttempts = 0;
    addLog("[Bot] Успішно зайшов на сервер і виглядає як гравець!");

    // Автоматичний вхід через AuthMe (впиши свій пароль)
    setTimeout(() => {
      bot.chat("/login chaloyehorua1");
      addLog("[Bot] Авторизовано через /login");
    }, 1500);

    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    defaultMove.canDig = false;
    bot.pathfinder.setMovements(defaultMove);

    // 1. РЕЖИМ ПРОГУЛЯНОК: Бот ходить туди-сюди як людина
    const wanderInterval = setInterval(() => {
      if (!bot || !bot.entity || !bot.pathfinder) {
        clearInterval(wanderInterval);
        return;
      }

      if (!bot.pathfinder.isMoving()) {
        const randomX = bot.entity.position.x + (Math.floor(Math.random() * 16) - 8);
        const randomZ = bot.entity.position.z + (Math.floor(Math.random() * 16) - 8);
        bot.pathfinder.setGoal(new goals.GoalXZ(randomX, randomZ));
      }
    }, 10000);

    // 2. РЕЖИМ ПОВЕДІНКИ ЖИВОГО ГРАВЦЯ (Стрибки, огляд, розмови)
    const humanBehaviorInterval = setInterval(() => {
      if (!bot || !bot.entity) {
        clearInterval(humanBehaviorInterval);
        return;
      }

      const action = Math.floor(Math.random() * 4);

      if (action === 0) {
        // Інколи стрибає
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 400);
      } else if (action === 1) {
        // Крутить головою в сторони, ніби роздивляється все навколо
        const yaw = Math.random() * Math.PI * 2;
        const pitch = (Math.random() * 0.5) - 0.25;
        bot.look(yaw, pitch, true);
      } else if (action === 2) {
        // Час від часу пише щось у чат, щоб здаватися людиною
        const phrases = [
          "хтось є на базі?",
          "треба буде потім сходити в шахту",
          "класний сервер)",
          "хто зі мною будувати?",
          "пацани, а де тут найближче село?"
        ];
        const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
        bot.chat(randomPhrase);
        addLog(`[Bot у чаті]: ${randomPhrase}`);
      }
    }, 15000);
  });

  // Реагування, коли хтось пише в чат (бот може привітатися)
  bot.on("chat", (username, message) => {
    if (username === bot.username) return;
    
    // Якщо хтось сказав "привіт" або назвав ім'я бота
    if (message.toLowerCase().includes("привіт") || message.toLowerCase().includes("бот")) {
      setTimeout(() => {
        bot.chat(`Привіт, ${username}! 👋`);
      }, 1000);
    }
  });

  bot.on("kicked", (reason) => {
    botState.connected = false;
    addLog(`[Bot] Кікнуто: ${reason}`);
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
  const delay = 4000;
  addLog(`[Bot] Перепідключення через ${delay / 1000} сек...`);
  setTimeout(createBot, delay);
}

createBot();
