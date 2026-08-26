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

// Функція для генерації відповіді через ШІ (OpenRouter)
async function getAIResponse(promptText) {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "openai/gpt-3.5-turbo",
                "messages": [
                    { "role": "system", "content": "Ти розумний бот-виживальщик на сервері Minecraft на ім'я yehoruabot. Відповідай коротко, цікаво та в стилі гравця українською мовою." },
                    { "role": "user", "content": promptText }
                ]
            })
        });

        const data = await response.json();
        return data.choices && data.choices[0] ? data.choices[0].message.content : "Я задумався...";
    } catch (error) {
        console.error("Помилка ШІ:", error);
        return "Щось мій штучний інтелект трохи затупив...";
    }
}

function connectBot() {
    if (mcBot) return;

    console.log("Запускаю бота yehoruabot на сервері...");
    
    mcBot = mineflayer.createBot({
        host: process.env.MC_HOST || 'твій_сервер.aternos.me',
        port: parseInt(process.env.MC_PORT) || 25565,
        username: process.env.MC_USERNAME || 'yehoruabot'
    });

    // Підключаємо плагіни для виживання, шляхів і бою
    mcBot.loadPlugin(pathfinder);
    mcBot.loadPlugin(autoEat);
    mcBot.loadPlugin(pvp);

    // Слухач чату для відповідей через ШІ
    mcBot.on('chat', async (username, message) => {
        if (username === mcBot.username) return;

        if (message.includes('yehoruabot') || message.includes('бот')) {
            console.log(`Гравець ${username} запитує ШІ: ${message}`);
            let aiReply = await getAIResponse(message);
            mcBot.chat(aiReply);
        }
    });

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

    // 1. Автоматичний бій: якщо поруч ворог у радіусі 8 блоків — бот атакує
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

    // 2. Самостійне пересування світом (щоб не кікало за AFK)
    setInterval(() => {
        if (!mcBot || !mcBot.entity || mcBot.pvp.target) return;

        const x = mcBot.entity.position.x + (Math.random() * 30 - 15);
        const z = mcBot.entity.position.z + (Math.random() * 30 - 15);
        const y = mcBot.entity.position.y;

        const targetGoal = new goals.GoalXZ(x, z);
        mcBot.pathfinder.setGoal(targetGoal);

    }, 20000);
}

// Вебсторінка для управління
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

            let interval = setInterval(async () => {
                let currentStatus = await myServer.status();
                if (currentStatus === 'online') {
                    clearInterval(interval);
                    console.log("Сервер онлайн! Запускаю yehoruabot...");
                    setTimeout(connectBot, 5000);
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
