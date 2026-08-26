const express = require('express');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const autoEat = require('mineflayer-auto-eat');

const app = express();
const PORT = process.env.PORT || 3000;

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
                    { "role": "user", "content": promptTest }
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

    console.log("Запускаю yehoruabot на сервері...");
    
    mcBot = mineflayer.createBot({
        host: process.env.MC_HOST || 'твій_сервер.aternos.me',
        port: parseInt(process.env.MC_PORT) || 25565,
        username: process.env.MC_USERNAME || 'yehoruabot'
    });

    // Підключаємо робочі плагіни (без проблемного pvp)
    mcBot.loadPlugin(pathfinder);
    mcBot.loadPlugin(autoEat);

    // Слухаємо чат майнкрафту для спілкування з ШІ
    mcBot.on('chat', async (username, message) => {
        if (username === mcBot.username) return;

        if (message.includes('yehoruabot') || message.includes('бот')) {
            console.log(`Гравець ${username} написав боту: ${message}`);
            let aiReply = await getAIResponse(message);
            mcBot.chat(aiReply);
        }
    });

    mcBot.on('spawn', () => {
        console.log("yehoruabot успішно зайшов у світ і починає виживання!");
        
        const defaultMove = new Movements(mcBot);
        mcBot.pathfinder.setMovements(defaultMove);

        startBotAI();
    });

    mcBot.on('end', (reason) => {
        console.log(`Бот відключився: ${reason}. Перепідключення через 30 секунд...`);
        mcBot = null;
        setTimeout(connectBot, 30000);
    });

    mcBot.on('error', (err) => {
        console.log("Помилка бота:", err.message);
        mcBot = null;
    });
}

// Логіка активності бота (блукання та захист)
function startBotAI() {
    if (!mcBot) return;

    // Простий автозахист: якщо поряд моб, бот дивиться на нього і б'є
    mcBot.on('physicTick', () => {
        if (!mcBot || !mcBot.entity) return;

        const filter = (entity) => entity.type === 'mob' || (entity.type === 'player' && entity.username !== mcBot.username);
        const target = mcBot.nearestEntity(filter);

        if (target && mcBot.entity.position.distanceTo(target.position) < 4) {
            mcBot.lookAt(target.position.offset(0, target.height, 0));
            mcBot.attack(target);
        }
    });

    // Самостійне пересування світом (анти-AFK)
    setInterval(() => {
        if (!mcBot || !mcBot.entity) return;

        const x = mcBot.entity.position.x + (Math.random() * 30 - 15);
        const z = mcBot.entity.position.z + (Math.random() * 30 - 15);

        const targetGoal = new goals.GoalXZ(x, z);
        mcBot.pathfinder.setGoal(targetGoal);

    }, 20000);
}

// Вебсторінка для Render
app.get('/', (req, res) => {
    res.send('yehoruabot працює і готовий до виживання!');
});

app.listen(PORT, () => {
    console.log(`Вебсервер запущено на порту ${PORT}`);
    connectBot();
});
