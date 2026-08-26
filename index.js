const express = require('express');
const { Aternos } = require('aternos-api');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const autoEat = require('mineflayer-auto-eat');
const pvp = require('mineflayer-pvp').plugin;

const app = express();
const PORT = process.env.PORT || 3000;

const aternos = new Aternos();
let mcBot = null;

function connectBot() {
    if (mcBot) return;

    console.log("Запускаю бота yehoruabot на сервері...");
    
    mcBot = mineflayer.createBot({
        host: process.env.MC_HOST || 'твій_сервер.aternos.me', // Заміни на свій IP або вкажи через змінні середовища Render
        port: parseInt(process.env.MC_PORT) || 25565,        // Порт сервера
        username: process.env.MC_USERNAME || 'yehoruabot'      // Твій нікнейм для бота
    });

    // Підключаємо плагіни для виживання, шляхів і бою
    mcBot.loadPlugin(pathfinder);
    mcBot.loadPlugin(autoEat);
    mcBot.loadPlugin(pvp);

    mcBot.on('spawn', () => {
        console.log("yehoruabot успішно зайшов у світ і починає виживання!");
        
        const defaultMove = new Movements(mcBot);
        mcBot.pathfinder.setMovements(defaultMove);

        // Запускаємо логіку активності та оборони
        startBotAI();
    });

    mcBot.on('end', (reason) => {
        console.log(`Бот відключився від сервера. Причина: ${reason}`);
        mcBot = null;
    });

    mcBot.on('error', (err) => {
        console.log("Помилка бота:", err.message);
        mcBot = null;
    });
}

// Штучний інтелект бота (пошук їжі, рух і бій)
function startBotAI() {
    if (!mcBot) return;

    // 1. Автоматичний бій: якщо поруч ворог (моб чи інший гравець) у радіусі 8 блоків — бот атакує
    mcBot.on('physicTick', () => {
        if (!mcBot || !mcBot.entity) return;

        const filter = (entity) => entity.type === 'mob' || (entity.type === 'player' && entity.username !== mcBot.username);
        const target = mcBot.nearestEntity(filter);

        if (target && mcBot.entity.position.distanceTo(target.position) < 8) {
            mcBot.pvp.attack(target);
        } else {
            if (mcBot.pvp.target) {
                mcBot.pvp.stop();
            }
        }
    });

    // 2. Самостійне пересування світом (щоб не кікало за AFK та досліджувати місцевість)
    setInterval(() => {
        if (!mcBot || !mcBot.entity || mcBot.pvp.target) return;

        const x = mcBot.entity.position.x + (Math.random() * 30 - 15);
        const z = mcBot.entity.position.z + (Math.random() * 30 - 15);
        const y = mcBot.entity.position.y;

        const targetGoal = new goals.GoalXZ(x, z);
        mcBot.pathfinder.setGoal(targetGoal);

    }, 20000); // Оновлює шлях кожні 20 секунд
}

// Вебсторінка для управління (щоб Render бачив активний порт і ти міг увімкнути сервер)
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="uk">
        <head>
            <meta charset="UTF-8">
            <title>yehoruabot - Aternos Control</title>
            <style>
                body { font-family: Arial, sans-serif; background: #121212; color: #e0e0e0; text-align: center; padding: 50px; }
                .btn { background: #1976d2; color: white; padding: 15px 30px; font-size: 18px; border-radius: 8px; border: none; cursor: pointer; }
                .btn:hover { background: #1565c0; }
                #status { margin-top: 20px; font-size: 16px; font-weight: bold; color: #64b5f6; }
            </style>
        </head>
        <body>
            <h1>Управління сервером Aternos та yehoruabot</h1>
            <p>Натисни кнопку, щоб бот сам увімкнув твій сервер Aternos і зайшов у гру:</p>
            <button class="btn" onclick="startServerAndJoin()">Увімкнути сервер і запустити бота</button>
            <div id="status"></div>

            <script>
                async function startServerAndJoin() {
                    document.getElementById('status').innerText = 'Надсилаю запит на запуск...';
                    try {
                        let res = await fetch('/start');
                        let text = await res.text();
                        document.getElementById('status').innerText = text;
                    } catch (e) {
                        document.getElementById('status').innerText = 'Помилка запиту.';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// Ендпоінт запуску Aternos і очікування входу
app.get('/start', async (req, res) => {
    try {
        const servers = await aternos.getServers();
        if (!servers || servers.length === 0) {
            return res.send("Не знайдено жодного сервера в акаунті Aternos.");
        }

        const myServer = servers[0];
        const status = await myServer.status();

        if (status === 'offline') {
            await myServer.start();
            res.send("Сервер Aternos запускається! yehoruabot автоматично зайде туди щойно він стане онлайн.");

            // Перевіряємо статус кожні 10 секунд
            let interval = setInterval(async () => {
                let currentStatus = await myServer.status();
                if (currentStatus === 'online') {
                    clearInterval(interval);
                    console.log("Сервер онлайн! Запускаю yehoruabot...");
                    setTimeout(connectBot, 5000); // Чекаємо 5 секунд після запуску
                }
            }, 10000);

        } else if (status === 'online') {
            connectBot();
            res.send("Сервер уже працює, yehoruabot підключається до гри!");
        } else {
            res.send(`Статус сервера: ${status}. Зачекай трохи.`);
        }
    } catch (error) {
        console.error(error);
        res.send("Помилка підключення до Aternos API.");
    }
});

app.listen(PORT, () => {
    console.log(`yehoruabot запущено та слухає порт ${PORT}`);
});
