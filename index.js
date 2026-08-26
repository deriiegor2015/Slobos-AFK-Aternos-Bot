const express = require('express');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const autoEat = require('mineflayer-auto-eat');
const pvp = require('mineflayer-pvp').plugin;

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

    console.log("Запускаю yehoruabot на сервері...");
    
    mcBot = mineflayer.createBot({
        host: process.env.MC_HOST || 'твій_сервер.aternos.me', // IP твого сервера
        port: parseInt(process.env.MC_PORT) || 25565,        // Порт сервера
        username: process.env.MC_USERNAME || 'yehoruabot'      // Нікнейм бота
    });

    // Підключаємо плагіни для шляхів, їжі та бою
    mcBot.loadPlugin(pathfinder);
    mcBot.loadPlugin(autoEat);
    mcBot.loadPlugin(pvp);

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

        // Запускаємо логіку активності (бою і блукання)
        startBotAI();
    });

    mcBot.on('end', (reason) => {
        console.log(`Бот відключився: ${reason}. Перепідключення через 30 секунд...`);
        mcBot = null;
        setTimeout(connectBot, 30000); // Автоматичний перезапуск при вильоті
    });

    mcBot.on('error', (err) => {
        console.log("Помилка бота:", err.message);
        mcBot = null;
    });
}

// Штучний інтелект бота (пошук їжі, рух і бій)
function startBotAI() {
    if (!mcBot) return;

    // 1. Автоматичний бій: якщо поруч ворог (моб чи гравець) у радіусі 8 блоків — атакує
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

    // 2. Самостійне пересування світом (анти-AFK)
    setInterval(() => {
        if (!mcBot || !mcBot.entity || mcBot.pvp.target) return;

        const x = mcBot.entity.position.x + (Math.random() * 30 - 15);
        const z = mcBot.entity.position.z + (Math.random() * 30 - 15);

        const targetGoal = new goals.GoalXZ(x, z);
        mcBot.pathfinder.setGoal(targetGoal);

    }, 20000); // Оновлює шлях кожні 20 секунд
}

// Вебсторінка для Render
app.get('/', (req, res) => {
    res.send('yehoruabot працює і готовий до виживання!');
});

app.listen(PORT, () => {
    console.log(`Вебсервер запущено на порту ${PORT}`);
    // Запускаємо бота автоматично при старті
    connectBot();
});
