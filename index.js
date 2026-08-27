const express = require('express');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

const app = express();
const PORT = process.env.PORT || 3000;

let mcBot = null;
let botLogs = [];
let trackedPlayers = [];
let botPosition = { x: 0, y: 64, z: 0 }; // Зберігаємо поточну позицію бота

function addLog(text) {
    const time = new Date().toLocaleTimeString();
    const logEntry = `[${time}] ${text}`;
    console.log(logEntry);
    botLogs.unshift(logEntry);
    if (botLogs.length > 50) botLogs.pop();
}

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
        addLog("Помилка ШІ: " + error.message);
        return "Щось мій штучний інтелект трохи затупив...";
    }
}

function connectBot() {
    if (mcBot) return;

    addLog("Запускаю yehoruabot на сервері...");
    
    mcBot = mineflayer.createBot({
        host: 'humcraft.aternos.me', // Заміни на свою адресу Aternos
        port: 61118,
        username: 'yehoruabot'
        version: '1.21.4'
    });

    mcBot.loadPlugin(pathfinder);

    mcBot.on('chat', async (username, message) => {
        if (username === mcBot.username) return;

        if (message.includes('yehoruabot') || message.includes('бот')) {
            addLog(`Гравець ${username} написав боту: ${message}`);
            let aiReply = await getAIResponse(message);
            mcBot.chat(aiReply);
        }
    });

    mcBot.on('spawn', () => {
        addLog("yehoruabot успішно зайшов у світ і починає виживання!");
        const defaultMove = new Movements(mcBot);
        mcBot.pathfinder.setMovements(defaultMove);
        startBotAI();
    });

    mcBot.on('end', (reason) => {
        addLog(`Бот відключився: ${reason}. Перепідключення через 15 секунд...`);
        mcBot = null;
        trackedPlayers = [];
        setTimeout(connectBot, 15000);
    });

    mcBot.on('error', (err) => {
        addLog("Помилка бота: " + err.message);
        mcBot = null;
    });
}

function startBotAI() {
    if (!mcBot) return;

    mcBot.on('physicTick', () => {
        if (!mcBot || !mcBot.entity) return;

        botPosition = {
            x: Math.round(mcBot.entity.position.x),
            y: Math.round(mcBot.entity.position.y),
            z: Math.round(mcBot.entity.position.z)
        };

        const playersList = [];
        for (const id of Object.keys(mcBot.entities)) {
            const entity = mcBot.entities[id];
            if (entity && entity.type === 'player' && entity.username !== mcBot.username) {
                playersList.push({
                    username: entity.username,
                    x: Math.round(entity.position.x),
                    y: Math.round(entity.position.y),
                    z: Math.round(entity.position.z)
                });
            }
        }
        trackedPlayers = playersList;

        const filter = (entity) => entity.type === 'mob';
        const target = mcBot.nearestEntity(filter);

        if (target && mcBot.entity.position.distanceTo(target.position) < 4) {
            mcBot.lookAt(target.position.offset(0, target.height, 0));
            mcBot.attack(target);
        }
    });

    setInterval(() => {
        if (!mcBot || !mcBot.entity) return;

        const x = mcBot.entity.position.x + (Math.random() * 50 - 25);
        const z = mcBot.entity.position.z + (Math.random() * 50 - 25);

        const targetGoal = new goals.GoalXZ(x, z);
        mcBot.pathfinder.setGoal(targetGoal);
    }, 25000);
}

app.get('/status', (req, res) => {
    res.json({
        online: !!mcBot && !!mcBot.entity,
        position: botPosition,
        players: trackedPlayers,
        logs: botLogs
    });
});

app.get('/restart', (req, res) => {
    if (mcBot) {
        mcBot.quit();
        mcBot = null;
    }
    setTimeout(connectBot, 2000);
    res.send("Бот перезапускається...");
});

// Вебпанель зі справжньою інтерактивною картою світу Minecraft (Leaflet.js)
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="uk">
        <head>
            <meta charset="UTF-8">
            <title>yehoruabot - Інтерактивна мапа світу</title>
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
            <style>
                body { font-family: Arial, sans-serif; background: #0b0f19; color: #e0e0e0; margin: 0; padding: 10px; text-align: center; }
                .container { max-width: 900px; margin: 0 auto; }
                .card { background: #161b22; padding: 15px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.6); border: 1px solid #30363d; margin-bottom: 15px; }
                .btn { background: #238636; color: white; padding: 8px 16px; font-size: 14px; border-radius: 6px; border: none; cursor: pointer; font-weight: bold; }
                .btn:hover { background: #2ea043; }
                .status-badge { display: inline-block; padding: 4px 10px; border-radius: 15px; font-weight: bold; font-size: 13px; margin-bottom: 8px; }
                .online { background: #238636; color: white; }
                .offline { background: #da3633; color: white; }
                
                /* Контейнер для мапи з можливістю зумування та перетягування */
                #minecraft-map { width: 100%; height: 400px; border-radius: 8px; border: 2px solid #30363d; margin-top: 10px; background: #111; z-index: 1; }

                .logs { background: #010409; color: #3fb950; padding: 10px; border-radius: 6px; text-align: left; height: 120px; overflow-y: auto; font-family: monospace; font-size: 11px; border: 1px solid #30363d; }
                .info-text { font-size: 14px; color: #8b949e; margin: 4px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🗺️ Інтерактивна мапа світу Minecraft</h2>
                
                <div class="card">
                    <div id="status-badge" class="status-badge offline">Статус: Офлайн</div>
                    <div><button class="btn" onclick="restartBot()">Перезапустити бота</button></div>
                    
                    <p class="info-text" id="bot-coords">Координати бота: Завантаження...</p>
                    <p class="info-text" id="players-list">Гравці поруч: Немає</p>

                    <div id="minecraft-map"></div>
                </div>

                <div class="card">
                    <h3>Живий Лог подій</h3>
                    <div class="logs" id="logs-box">Завантаження логів...</div>
                </div>
            </div>

            <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
            <script>
                // Створюємо мапу в системі координат Minecraft
                const map = L.map('minecraft-map', {
                    crs: L.CRS.Simple,
                    minZoom: -3,
                    maxZoom: 4,
                    zoom: 1
                });

                // Уявні межі нашого світу для зручного гортання
                const bounds = [[-5000, -5000], [5000, 5000]];
                map.fitBounds(bounds);

                let botMarker = null;
                let playerMarkers = {};

                async function updateMap() {
                    try {
                        let res = await fetch('/status');
                        let data = await res.json();
                        
                        let badge = document.getElementById('status-badge');
                        if (data.online) {
                            badge.className = 'status-badge online';
                            badge.innerText = 'Статус: Бот досліджує світ';
                        } else {
                            badge.className = 'status-badge offline';
                            badge.innerText = 'Статус: Офлайн';
                        }

                        if (data.position) {
                            document.getElementById('bot-coords').innerText = \`Координати бота: X: \${data.position.x}, Y: \${data.position.y}, Z: \${data.position.z}\`;
                            
                            // Перетворюємо координати Minecraft (X, Z) в координати мапи
                            let botLatLng = [data.position.z, data.position.x];

                            if (!botMarker) {
                                botMarker = L.circleMarker(botLatLng, {
                                    color: '#58a6ff',
                                    radius: 8,
                                    fillColor: '#58a6ff',
                                    fillOpacity: 0.9
                                }).addTo(map).bindPopup("<b>yehoruabot (Бот)</b>");
                                map.setView(botLatLng, 1);
                            } else {
                                botMarker.setLatLng(botLatLng);
                            }

                            // Оновлюємо мітки інших гравців на мапі
                            let activePlayers = [];
                            if (data.players && data.players.length > 0) {
                                let names = [];
                                data.players.forEach(p => {
                                    names.push(\`\${p.username} (X:\${p.x}, Z:\${p.z})\`);
                                    let pLatLng = [p.z, p.x];
                                    activePlayers.push(p.username);

                                    if (!playerMarkers[p.username]) {
                                        playerMarkers[p.username] = L.circleMarker(pLatLng, {
                                            color: '#f85149',
                                            radius: 7,
                                            fillColor: '#f85149',
                                            fillOpacity: 0.9
                                        }).addTo(map).bindPopup(\`<b>\${p.username}</b>\`);
                                    } else {
                                        playerMarkers[p.username].setLatLng(pLatLng);
                                    }
                                });
                                document.getElementById('players-list').innerText = "Гравці поруч: " + names.join(', ');
                            } else {
                                document.getElementById('players-list').innerText = 'Гравці поруч: Поруч нікого немає';
                            }

                            // Видаляємо маркер гравців, які вийшли з поля зору
                            Object.keys(playerMarkers).forEach(name => {
                                if (!activePlayers.includes(name)) {
                                    map.removeLayer(playerMarkers[name]);
                                    delete playerMarkers[name];
                                }
                            });

                        } else {
                            document.getElementById('bot-coords').innerText = 'Координати бота: Не в світі';
                        }

                        let logsBox = document.getElementById('logs-box');
                        logsBox.innerHTML = data.logs.join('<br>');
                        logsBox.scrollTop = logsBox.scrollHeight;
                    } catch (e) {
                        console.error(e);
                    }
                }

                async function restartBot() {
                    await fetch('/restart');
                    alert('Запит на перезапуск надіслано!');
                    setTimeout(updateMap, 3000);
                }

                setInterval(updateMap, 2000);
                updateMap();
            </script>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    addLog(`Вебсервер запущено на порту ${PORT}`);
    connectBot();
});
