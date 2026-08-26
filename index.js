const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const autoEat = require('mineflayer-auto-eat').plugin;
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');

// --- НАЛАШТУВАННЯ ---
const BOT_USERNAME = "yehoruabot";
const SERVER_IP = "HumCraft.aternos.me";
const SERVER_PORT = 61118;
const SERVER_VERSION = "1.21.4";

// Встав сюди свій дійсний токен Discord бота
const DISCORD_BOT_TOKEN = process.env.DISCORD_TOKEN;

// --- ВЕБ-СЕРВЕР ДЛЯ RENDER ---
const app = express();
const PORT = process.env.PORT || 10000;

let botState = {
  connected: false,
  username: BOT_USERNAME,
  host: SERVER_IP,
  port: SERVER_PORT,
  logs: [],
  discordVoiceConnected: false
};

function addLog(message) {
  const time = new Date().toLocaleTimeString();
  const logMessage = `[${time}] ${message}`;
  console.log(logMessage);
  botState.logs.unshift(logMessage);
  if (botState.logs.length > 100) botState.logs.pop();
}

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>YehorUA - Bot Panel</title>
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
          <h1>🛡️ Панель управління: ${BOT_USERNAME}</h1>
          <div class="card">
            <h3>Статус</h3>
            <p>Minecraft Бот: <span class="status ${botState.connected ? 'online' : 'offline'}">${botState.connected ? 'ONLINE' : 'OFFLINE'}</span></p>
            <p>Discord Voice: <span class="status ${botState.discordVoiceConnected ? 'online' : 'offline'}">${botState.discordVoiceConnected ? 'У ГОЛОСОВОМУ КАНАЛІ' : 'НЕ ПІДКЛЮЧЕНО'}</span></p>
          </div>
          <div class="card">
            <h3>📜 Логи</h3>
            <pre>${botState.logs.join('\n')}</pre>
            <br>
            <button class="btn" onclick="location.reload()">Оновити</button>
          </div>
        </div>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  addLog(`[Server] Веб-панель запущена на порті ${PORT}`);
});

// --- ІНІЦІАЛІЗАЦІЯ DISCORD БОТА ---
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

discordClient.on('ready', () => {
  addLog(`[Discord] Бот ${discordClient.user.tag} успішно увійшов у систему!`);
});

// Обробка команд у Discord чаті
discordClient.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content === '!status') {
    message.reply(`🤖 Бот у Minecraft: **${botState.connected ? 'ONLINE 🟢' : 'OFFLINE 🔴'}**\n🛡️ Режим PvP: **Активний**`);
  }

  // Команда для підключення бота до твого голосового каналу в Discord: !join
  if (message.content === '!join') {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      return message.reply('❌ Зайди спочатку в голосовий канал Discord!');
    }

    try {
      joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });

      botState.discordVoiceConnected = true;
      message.reply(`🔊 Успішно зайшов у голосовий канал **${voiceChannel.name}**!`);
      addLog(`[Discord Voice] Підключено до каналу ${voiceChannel.name}`);
    } catch (error) {
      addLog(`[Discord Voice Error] ${error.message}`);
      message.reply('❌ Помилка підключення до голосу.');
    }
  }
});

discordClient.login(DISCORD_BOT_TOKEN);


// --- ІНІЦІАЛІЗАЦІЯ MINECRAFT БОТА ---
let bot = null;

function createBot() {
  addLog(`[Bot] Підключення ${BOT_USERNAME} до ${SERVER_IP}...`);

  try {
    bot = mineflayer.createBot({
      host: SERVER_IP,
      port: SERVER_PORT,
      username: BOT_USERNAME,
      version: SERVER_VERSION
    });
  } catch (err) {
    addLog(`[Bot] Помилка: ${err.message}`);
    scheduleReconnect();
    return;
  }

  bot.loadPlugin(pathfinder);


  bot.once("spawn", () => {
    botState.connected = true;
    addLog(`[Bot] Успішно зайшов на сервер!`);

    setTimeout(() => {
      bot.chat("/login yehor1212");
    }, 1500);

    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    defaultMove.canDig = false;
    bot.pathfinder.setMovements(defaultMove);
  });

  bot.on("kicked", (reason) => {
    botState.connected = false;
    addLog(`[Bot] Кікнуто: ${reason}`);
  });

  bot.on("end", (reason) => {
    botState.connected = false;
    addLog(`[Bot] Відключено (${reason}). Перепідключення...`);
    scheduleReconnect();
  });

  bot.on("error", (err) => {
    addLog(`[Bot Error] ${err.message}`);
  });
}

function scheduleReconnect() {
  setTimeout(createBot, 5000);
}

createBot();
