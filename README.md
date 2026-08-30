# Slobos-AFK-Aternos-Bot

Повноцінний бот на базі Mineflayer для підтримки онлайн-статусу на серверах Aternos.

## ⚙️ Конфігурація (settings.json)

У файлі `settings.json` зміни IP-адресу та порт на дані твого сервера:

```json

{
  "name": "ProPlayer Bot",
  "bot-account": {
    "username": "yehoruabot",
    "password": "",
    "type": "offline"
  },
  "server": {
    "ip": "ТВІЙ_IP_СЕРВЕРА",
    "port": "00000",
    "version": "1.21.4",
    "try-creative": false
  },
  "position": {
    "enabled": false,
    "x": 0,
    "y": 100,
    "z": 0
  },
  "utils": {
    "auto-auth": {
      "enabled": true,
      "password": "chalol78"
    },
    "anti-afk": {
      "enabled": false
    },
    "chat-messages": {
      "enabled": true,
      "repeat": true,
      "repeat-delay": 300,
      "messages": [
        "всім привіт",
        "хіхі",
        "Канал YehorUA топ!"
      ]
    },
    "chat-log": true,
    "auto-reconnect": true,
    "auto-reconnect-delay": 5000,
    "max-reconnect-delay": 60000
  },
  "movement": {
    "enabled": true,
    "circle-walk": {
      "enabled": false,
      "radius": 5,
      "speed": 3000
    },
    "look-around": {
      "enabled": true,
      "interval": 3000
    },
    "random-jump": {
      "enabled": true,
      "interval": 6000
    }
  },
  "modules": {
    "avoidMobs": false,
    "combat": true,
    "beds": true,
    "chat": true,
    "console-commands": true,
    "pathfinder": true,
    "autoMiner": true,
    "pvp": true
  },
  "auto-woodcutter": {
    "enabled": true
  },
  "combat": {
    "attack-mobs": true,
    "attack-players": true,
    "auto-eat": true,
    "critical-hits": true
  },
  "beds": {
    "pick-up-day": true,
    "place-night": true
  },
  "discord": {
    "enabled": false,
    "webhookUrl": "YOUR_DISCORD_WEBHOOK_URL_HERE",
    "events": {
      "connect": true,
      "disconnect": true,
      "chat": false
    }
  },
  "chat": {
    "respond": true
  }
}

## 🚀 Встановлення та запуск

Зайди на Aternos у розділ Плагіни (Plugins), введи у пошуку via та скачай його.

Клонуй репозиторій:
```bash
git clone https://github.com/deriiegor2015/Slobos-AFK-Aternos-Bot.git...
```
- Перейди у папку проєкту:
```bash
cd Slobos-AFK-Aternos-Bot... ```
- Встанови залежності:
```npm
npm install... 
```
- Запусти бота:
```npm
npm start... 
```

## ⚠️ Disclaimer
Цей програмний продукт створений виключно в освітніх цілях. Автор не несе відповідальності за блокування облікових записів чи порушення правил серверів. Використовуй на власний розсуд.
