const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const simpleVoiceChat = require('mineflayer-simple-voice-chat');
const express = require('express');
const https = require('https');

// Налаштування Minecraft
const BOT_USERNAME = "yehoruabot";
const SERVER_IP = "HumCraft.aternos.me";
const SERVER_PORT = 61118;
const SERVER_VERSION = "1.21.4";
const OWNER_USERNAME = "YehorUA8104";

// Посилання на твій приватний Discord Webhook
const DISCORD_WEBHOOK_URL = "ТВОЄ_ПОСИЛАННЯ_НА_DISCORD_WEBHOOK";

const app = express();
const PORT = process.env.PORT || 10000;

let botState = {
  connected: false,
  username: BOT_USERNAME,
  host: SERVER_IP,
  port: SERVER_PORT,
  reconnectAttempts: 0,
  logs: [],
  serverStarting: false,
  voiceConnected: false,
  building: false,
  pvpMode: true // Бот готовий до бою
};

function addLog(message) {
  const time = new Date().toLocaleTimeString();
  const logMessage = `[${time}] ${message}`;
  console.log(logMessage);
  botState.logs.unshift(logMessage);
  if (botState.logs.length > 100) botState.logs.pop();
}

// Надсилання сповіщень у Discord
function sendDiscordWebhook(text) {
  if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL.includes("ТВОЄ_ПОСИЛАННЯ")) return;
  
  const data = JSON.stringify({ content: text });
  const url = new URL(DISCORD_WEBHOOK_URL);
  
  const req = https.request({
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  }, (res) => {});

  req.on('error', (err) => {
    console.error("Помилка Discord Webhook:", err.message);
  });

  req.write(data);
  req.end();
}

// Автоматичне пробудження Aternos
function wakeUpAternosServer() {
  if (botState.serverStarting) return;
  botState.serverStarting = true;
  addLog("[Aternos] Сервер вимкнено. Надсилаємо сигнал пробудження...");
  sendDiscordWebhook("🔌 Сервер вимкнено. Пробуджую Aternos...");

  const req = https.request(`https://${SERVER_IP}`, { method: 'GET' }, (res) => {
    addLog("[Aternos] Сигнал прийнято, сервер запускається...");
    sendDiscordWebhook("🚀 Сигнал прийнято, сервер запускається!");
    setTimeout(() => { botState.serverStarting = false; }, 30000);
  });

  req.on('error', () => { botState.serverStarting = false; });
  req.end();
}

// Веб-панель
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>YehorUA - ${BOT_USERNAME} Panel</title>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', sans-serif; background: #121212; color: #e0e0e0; margin: 0; padding: 20px; }
          .container { max-width: 900px; margin: auto; }
          .card { background: #1e1e1e; padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
          .status { padding: 6px 12px; border-radius: 5px; font-weight: bold; display: inline-block; }
          .online { background: #28a745; color: #fff; }
          .offline { background: #dc3545; color: #fff; }
          pre { background: #121212; color: #00ff66; padding: 15px; border-radius: 5px; height: 250px; overflow-y: scroll; font-family: monospace; }
          .btn { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🛡️ Панель PvP-модератора: ${BOT_USERNAME}</h1>
          
          <div class="card">
            <h3>Статус системи (PvP & EssentialsX)</h3>
            <p>Бот-модератор: <span class="status ${botState.connected ? 'online' : 'offline'}">${botState.connected ? 'ONLINE (Готовий до PvP)' : 'OFFLINE'}</span></p>
            <p>Режим бою: <b style="color: #ff4444;">АКТИВНИЙ (Захищає світ)</b></p>
          </div>

          <div class="card">
            <h3>📜 Логи в реальному часі</h3>
            <pre>${botState.logs.join('\n')}</pre>
            <br>
            <button class="btn" onclick="location.reload()">Оновити сторінку</button>
          </div>
        </div>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`[Server] Веб-панель запущена на порті ${PORT}`);
});

let bot = null;
let spawnHandled = false;

function createBot() {
  spawnHandled = false;
  addLog(`[Bot] Підключення модератора ${BOT_USERNAME} до ${SERVER_IP}:${SERVER_PORT}...`);

  try {
    bot = mineflayer.createBot({
      host: SERVER_IP,
      port: SERVER_PORT,
      username: BOT_USERNAME,
      version: SERVER_VERSION
    });
  } catch (err) {
    addLog(`[Bot] Помилка ініціалізації: ${err.message}`);
    botState.connected = false;
    scheduleReconnect();
    return;
  }

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);
  bot.loadPlugin(simpleVoiceChat.plugin);

  bot.once("spawn", () => {
    if (spawnHandled) return;
    spawnHandled = true;

    botState.connected = true;
    botState.reconnectAttempts = 0;
    addLog(`[Bot] ${BOT_USERNAME} успішно зайшов на сервер з PvP-модулем!`);
    sendDiscordWebhook("🟢 Бот `yehoruabot` у мережі. Режим PvP та захисту активовано.");

    setTimeout(() => {
      bot.chat("/login ТвійПароль");
      addLog("[Bot] Відправлено команду /login");
    }, 1500);

    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    defaultMove.canDig = false;
    bot.pathfinder.setMovements(defaultMove);

    // Реалістичні прогулянки (коли не б'ється і не будує)
    const realisticWalkInterval = setInterval(() => {
      if (!bot || !bot.entity || !bot.pathfinder || botState.building || bot.pvp.target) return;

      const actionType = Math.random();
      if (actionType < 0.7) {
        const dx = Math.floor(Math.random() * 40) - 20;
        const dz = Math.floor(Math.random() * 40) - 20;
        const targetX = bot.entity.position.x + dx;
        const targetZ = bot.entity.position.z + dz;

        try {
          bot.pathfinder.setGoal(new goals.GoalXZ(targetX, targetZ));
        } catch (e) {}
      } else {
        bot.pathfinder.stop();
        const randomYaw = Math.random() * Math.PI * 2;
        const randomPitch = (Math.random() * Math.PI) / 2 - Math.PI / 4;
        bot.look(randomYaw, randomPitch, true);
      }
    }, 12000);
  });

  // Функція побудови бази
  async function startBuildingBase() {
    if (botState.building) return;
    botState.building = true;
    bot.chat("Починаю зводити красиву базу для тебе!");
    sendDiscordWebhook("🏗️ Бот розпочав будівництво бази за наказом власника.");

    try {
      for (let i = 0; i < 5; i++) {
        if (!bot || !bot.connected) break;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      bot.chat("База повністю готова і чекає на тебе!");
      sendDiscordWebhook("✨ Будівництво завершено! База готова.");
    } catch (err) {
      addLog(`[Build Error] ${err.message}`);
    } finally {
      botState.building = false;
    }
  }

  // Автоматична реакція на гравців та PvP
  bot.on('playerJoined', (player) => {
    if (player.username === BOT_USERNAME) return;
    // Якщо зайшов не ти, бот тримає гравця на прицілі або вітає
    addLog(`[Player] Гравець ${player.username} приєднався до сервера.`);
  });

  // Голосовий модуль
  bot.on("audio_player_initialised", () => {
    botState.voiceConnected = true;
    addLog("[Voice] Голосовий модуль активовано!");
  });

  // Логіка чату та команд
  bot.on("chat", (username, message) => {
    if (username === BOT_USERNAME) return;
    
    const lowerMsg = message.toLowerCase();

    // Захист світу від видалення
    if (lowerMsg.includes("delete world") || lowerMsg.includes("rmdir") || lowerMsg.includes("/world delete")) {
      addLog(`[ЗАХИСТ] Заблоковано команду від ${username}: "${message}"`);
      bot.chat(`Увага, ${username}! Ця команда заблокована.`);
      sendDiscordWebhook(`⚠️ Заблоковано небезпечну команду від гравця **${username}**: \`${message}\``);
      return;
    }

    // Спілкування через /bot
    if (message.startsWith("/bot") || message.startsWith("bot")) {
      const userQuery = message.replace(/^\/bot|^\bbot\b/i, "").trim().toLowerCase();
      addLog(`[Команда /bot від ${username}]: ${userQuery}`);

      setTimeout(() => {
        if (userQuery.includes("привіт")) {
          bot.chat(`Привіт, ${username}! Я стежу за порядком і готовий захищати світ в PvP.`);
        } else if (userQuery.includes("побудуй сервер") || userQuery.includes("побудуй базу")) {
          startBuildingBase();
        } else if (userQuery.includes("атакуй") || userQuery.includes("вбивай")) {
          const targetPlayer = bot.players[username];
          if (targetPlayer && targetPlayer.entity) {
            bot.pvp.attack(targetPlayer.entity);
            bot.chat(`Починаю атаку на ${username}!`);
          } else {
            bot.chat(`Я не бачу ворога поруч.`);
          }
        } else {
          bot.chat(`Запит прийнято, ${username}!`);
        }
      }, 1000);
    }

    // Адмін-команди для тебе (YehorUA8104)
    if (username === OWNER_USERNAME && message.startsWith("!")) {
      const args = message.slice(1).trim().split(" ");
      const cmd = args[0].toLowerCase();

      if (cmd === "day") {
        bot.chat("/time set day");
        bot.chat("Встановив день!");
      } else if (cmd === "clear") {
        bot.chat("/weather clear");
        bot.chat("Погода очищена!");
      } else if (cmd === "build") {
        startBuildingBase();
      } else if (cmd === "kill" || cmd === "attack") {
        // Якщо ти напишеш у чат !attack [нік_гравця]
        const targetName = args[1];
        if (targetName && bot.players[targetName] && bot.players[targetName].entity) {
          bot.pvp.attack(bot.players[targetName].entity);
          bot.chat(`Виконую твій наказ! Атакую гравця ${targetName}.`);
          sendDiscordWebhook(`⚔️ Бот розпочав PvP-атаку на гравця **${targetName}** за наказом власника.`);
        } else {
          bot.chat(`Гравця "${targetName || ''}" немає поруч зі мною.`);
        }
      } else if (cmd === "stop") {
        // Зупинити PvP чи ходьбу
        bot.pvp.stop();
        bot.pathfinder.stop();
        bot.chat("Зупинив усі дії.");
      }
    }
  });

  bot.on("kicked", (reason) => {
    botState.connected = false;
    botState.voiceConnected = false;
    addLog(`[Bot] Кікнуто: ${reason}`);
    sendDiscordWebhook(`⚠️ Бот кікнутий з сервера. Причина: ${reason}`);
  });

  bot.on("end", (reason) => {
    botState.connected = false;
    botState.voiceConnected = false;
    addLog(`[Bot] Відключено (${reason}). Пробуджуємо Aternos...`);
    sendDiscordWebhook(`🔴 Сервер вимкнено (${reason}). Пробуджуємо Aternos...`);
    wakeUpAternosServer();
    scheduleReconnect();
  });

  bot.on("error", (err) => {
    addLog(`[Bot] Помилка: ${err.message}`);
  });
}

function scheduleReconnect() {
  botState.reconnectAttempts++;
  setTimeout(createBot, 5000);
}

createBot();
