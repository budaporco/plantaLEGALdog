let ws;
let playerId = null;
let currentTargetId = null; // Who's farm are we looking at?
let playerCoins = 0;
let cropsData = {};
let animalsData = {}; 
let selectedCrop = null;
let playersData = []; // Cache all players

const elements = {
    loginScreen: document.getElementById('login-screen'),
    gameScreen: document.getElementById('game-screen'),
    nicknameInput: document.getElementById('nickname-input'),
    loginBtn: document.getElementById('login-btn'),
    farmGrid: document.getElementById('farm-grid'),
    playerName: document.getElementById('player-name'),
    playerCoins: document.getElementById('player-coins'),
    shopList: document.getElementById('shop-list'),
    chatBox: document.getElementById('chat-box'),
    chatInput: document.getElementById('chat-input'),
    playerList: document.getElementById('player-list'),
    animalSection: document.createElement('div'), 
    workerSection: document.createElement('div'),
    farmTitle: document.createElement('h2') // New
};

// Insert Farm Title above grid
elements.farmGrid.parentElement.insertBefore(elements.farmTitle, elements.farmGrid);
elements.farmTitle.style.textAlign = 'center';
elements.farmTitle.style.color = '#fff';
elements.farmTitle.style.textShadow = '1px 1px 2px #000';
elements.farmTitle.style.marginBottom = '10px';

// Insert new sections into sidebar
const sidebar = document.querySelector('.sidebar');
if(sidebar) {
    // Return Home Button
    const navPanel = document.createElement('div');
    navPanel.className = 'panel';
    navPanel.innerHTML = `
        <button id="home-btn" style="width:100%; margin-bottom:5px;">🏠 Minha Fazenda</button>
        <button id="help-btn" class="secondary" style="width:100%">📖 Ajuda / Guia</button>
    `;
    sidebar.insertBefore(navPanel, sidebar.firstChild);
    
    navPanel.querySelector('#home-btn').onclick = () => {
        switchView(playerId);
    };

    // Help Modal Logic
    const helpBtn = navPanel.querySelector('#help-btn');
    const helpModal = document.getElementById('help-modal');
    const closeModal = document.querySelector('.close-modal');

    if(helpBtn && helpModal) {
        helpBtn.onclick = () => {
            helpModal.classList.remove('hidden');
        };
        closeModal.onclick = () => {
            helpModal.classList.add('hidden');
        };
        window.onclick = (event) => {
            if (event.target == helpModal) {
                helpModal.classList.add('hidden');
            }
        };
    }

    // Worker Panel
    // Race Status Panel
    const racePanel = document.createElement('div');
    racePanel.className = 'panel';
    racePanel.style.border = '2px solid gold';
    racePanel.innerHTML = `
        <h3>🏁 Jockey Club</h3>
        <p id="race-status">Status: Fechado</p>
        <p>Inscritos: <span id="race-entrants">0</span></p>
        <small id="race-timer" style="color:yellow; font-weight:bold;"></small>
    `;
    sidebar.insertBefore(racePanel, sidebar.children[1]); // Logo abaixo dos botões de navegação
    elements.raceStatus = racePanel.querySelector('#race-status');
    elements.raceEntrants = racePanel.querySelector('#race-entrants');
    elements.raceTimer = racePanel.querySelector('#race-timer');

    const workerPanel = document.createElement('div');
    workerPanel.className = 'panel';
    workerPanel.innerHTML = `
        <h3>👷 Funcionários</h3>
        <p>Ajudantes: <span id="worker-count">0</span></p>
        <button id="hire-btn" style="width:100%; font-size:0.8rem">Contratar (500💰)</button>
        <small>Colhem automaticamente!</small>
    `;
    sidebar.insertBefore(workerPanel, sidebar.children[2]);
    elements.workerCount = workerPanel.querySelector('#worker-count');
    elements.hireBtn = workerPanel.querySelector('#hire-btn');

    elements.hireBtn.onclick = () => {
        ws.send(JSON.stringify({ type: 'HIRE_WORKER' }));
    };

    // Animal Panel
    const animalPanel = document.createElement('div');
    animalPanel.className = 'panel';
    animalPanel.innerHTML = `
        <h3>🐮 Curral</h3>
        <div style="display:grid; gap:5px; margin-bottom:10px;">
            <button id="buy-cow-btn" style="width:100%; font-size:0.8rem">Comprar Vaca (500💰)</button>
            <button id="buy-horse-btn" style="width:100%; font-size:0.8rem; background:#ff9800;">Comprar Potro (5000💰)</button>
        </div>
        <div id="animal-pen" class="animal-pen"></div>
    `;
    sidebar.insertBefore(animalPanel, sidebar.children[3]);
    elements.animalPen = animalPanel.querySelector('#animal-pen');
    elements.buyCowBtn = animalPanel.querySelector('#buy-cow-btn');
    elements.buyHorseBtn = animalPanel.querySelector('#buy-horse-btn');

    elements.buyCowBtn.onclick = () => {
        ws.send(JSON.stringify({ type: 'BUY_ANIMAL', animalType: 'vaca' }));
    };
    elements.buyHorseBtn.onclick = () => {
        ws.send(JSON.stringify({ type: 'BUY_ANIMAL', animalType: 'potro' }));
    };
}

// --- Audio System (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'coin') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(2000, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'plant') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'harvest') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    }
}


// --- Initialization ---

elements.loginBtn.addEventListener('click', () => {
    const nickname = elements.nicknameInput.value.trim();
    if (nickname) {
        connect(nickname);
    }
});

function connect(nickname) {
    // Check if we are running locally or in production
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // IF PRODUCTION: Replace this URL with your Render Backend URL later
    const PROD_URL = 'wss://plantalegaldog.onrender.com'; 
    
    let wsUrl;
    if (isLocal) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}`;
    } else {
        // When hosted on Firebase, connect to Render Backend
        wsUrl = PROD_URL;
    }

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('Connected to server');
        ws.send(JSON.stringify({ type: 'LOGIN', nickname }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };

    ws.onclose = () => {
        alert('Desconectado do servidor.');
        location.reload();
    };
}

function handleMessage(data) {
    switch (data.type) {
        case 'LOGIN_SUCCESS':
            playerId = data.playerId;
            currentTargetId = playerId;
            cropsData = data.state.crops;
            animalsData = data.state.animalsConfig;
            playersData = data.state.players;
            
            renderShop();
            switchView(playerId); // Initial render
            updateSelf(data.state.players.find(p => p.id === playerId));
            
            elements.loginScreen.classList.add('hidden');
            elements.gameScreen.classList.remove('hidden');
            break;

        case 'UPDATE_GAME':
            playersData = data.state.players;
            
            // Update Race UI
            const rState = data.state.raceState;
            if (elements.raceStatus) {
                if (rState.status === 'waiting') {
                    elements.raceStatus.textContent = "Status: Aguardando...";
                    elements.raceTimer.textContent = "Precisa de 1 corredor";
                } else if (rState.status === 'starting') {
                    elements.raceStatus.textContent = "Status: 🟢 ABERTO";
                    const minutes = Math.floor(rState.timer / 60);
                    const seconds = rState.timer % 60;
                    elements.raceTimer.textContent = `Largada em: ${minutes}:${seconds < 10 ? '0'+seconds : seconds}`;
                } else {
                    elements.raceStatus.textContent = "Status: Correndo!";
                    elements.raceTimer.textContent = "";
                }
                elements.raceEntrants.textContent = rState.entrantsCount;
            }

            // Update current view if it's open
            if (currentTargetId) {
                switchView(currentTargetId);
            }
            // Always update self stats (coins, etc)
            const me = playersData.find(p => p.id === playerId);
            if (me) updateSelf(me);
            
            renderPlayerList(playersData);
            break;

        case 'UPDATE_SELF':
            updateSelf(data.player);
            break;

        case 'CHAT':
            addChatMessage(data.from, data.text);
            break;

        case 'ERROR':
            alert(data.message);
            break;
    }
}

function switchView(targetId) {
    currentTargetId = targetId;
    const targetPlayer = playersData.find(p => p.id === targetId);
    
    if (!targetPlayer) return;

    if (targetId === playerId) {
        elements.farmTitle.textContent = "🏡 Minha Fazenda";
        elements.farmGrid.style.borderColor = '#fff';
    } else {
        elements.farmTitle.textContent = `🏴‍☠️ Fazenda de ${targetPlayer.nickname}`;
        elements.farmGrid.style.borderColor = '#ff9800'; // Orange warning border
    }

    renderGrid(targetPlayer.plots);
}

const cropIcons = {
    'alface': '🥬',
    'tomate': '🍅',
    'cenoura': '🥕',
    'abobora': '🎃',
    'milho': '🌽',
    'morango': '🍓'
};

// --- Rendering ---

function renderShop() {
    elements.shopList.innerHTML = '';
    Object.keys(cropsData).forEach(key => {
        const crop = cropsData[key];
        const div = document.createElement('div');
        div.className = 'shop-item';
        div.innerHTML = `
            <span>${crop.name}</span>
            <small>${crop.cost}💰</small>
        `;
        div.onclick = () => selectCrop(key, div);
        elements.shopList.appendChild(div);
    });
}

function selectCrop(id, element) {
    selectedCrop = id;
    document.querySelectorAll('.shop-item').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
}

function renderGrid(plots) {
    elements.farmGrid.innerHTML = '';
    if (!plots || !Array.isArray(plots)) return; // Guard against undefined plots

    plots.forEach((plot, index) => {
        const div = document.createElement('div');
        div.className = 'plot';
        
        // Visual State
        let content = '';
        if (plot.state === 'empty') {
            div.style.backgroundColor = 'var(--soil-color)';
        } else if (plot.state === 'planted') {
            div.className += ' planted';
            content = '<div style="font-size:1.5rem">🌱</div>';
            
            // Progress Bar Logic
            const totalTime = plot.readyTime - plot.plantTime;
            const timeLeft = Math.max(0, plot.readyTime - Date.now());
            const percent = Math.min(100, ((totalTime - timeLeft) / totalTime) * 100);
            
            content += `
                <div style="position:absolute; bottom:5px; left:5px; right:5px; height:4px; background:rgba(0,0,0,0.5); border-radius:2px;">
                    <div style="width:${percent}%; height:100%; background:#4caf50; border-radius:2px; transition:width 1s linear;"></div>
                </div>
            `;
        } else if (plot.state === 'ready') {
            div.className += ' ready';
            const crop = cropsData[plot.cropId];
            content = cropIcons[plot.cropId] || '❓';
        }

        if (plot.stolen) {
            div.innerHTML += '<span class="stolen-mark">⚠️</span>';
        }

        // Owner Tag (Simplified for single farm view)
        // No need for owner tag on every plot since whole grid is one owner
        
        div.innerHTML += content;

        div.onclick = () => handlePlotClick(index, plot);
        elements.farmGrid.appendChild(div);
    });
}

function updateSelf(player) {
    elements.playerName.textContent = player.nickname;
    
    // Animate coin change
    if(player.coins !== playerCoins) {
        if(player.coins > playerCoins) playSound('coin');
        elements.playerCoins.style.color = '#FFD700';
        setTimeout(() => elements.playerCoins.style.color = '', 500);
    }
    
    elements.playerCoins.textContent = player.coins;
    playerCoins = player.coins;

    // Update Workers
    if(elements.workerList && player.workers) {
        // Atualiza o contador de texto
        if (elements.workerCount) {
            elements.workerCount.textContent = Array.isArray(player.workers) ? player.workers.length : 0;
        }

        elements.workerList.innerHTML = '';
        if (Array.isArray(player.workers)) {
            player.workers.forEach(w => {
                const div = document.createElement('div');
                div.className = `worker-card rarity-${w.rarity || 'common'}`;

                const statusIcon = w.state.status === 'resting' ? '💤' : (w.state.status === 'idle' ? '🛑' : '🔨');
                const staminaPercent = (w.state.energy / w.stats.stamina) * 100;
                
                // Calculate EXP Percent (Level * 50 required)
                const reqExp = w.level * 50;
                const expPercent = Math.min(100, (w.exp / reqExp) * 100);

                const avatars = {
                    'common': '🧑‍🌾',
                    'uncommon': '👷',
                    'rare': '🚜',
                    'epic': '🤖',
                    'legendary': '👽'
                };
                const avatar = avatars[w.rarity || 'common'];

                div.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:5px;">
                        <div style="font-size:2rem;">${avatar}</div>
                        <div style="flex:1">
                            <h4 style="margin:0">${w.name} (Lvl ${w.level}) <span>${statusIcon}</span></h4>
                            <small>Raridade: <b style="text-transform:capitalize; color:var(--highlight)">${w.rarity || 'comum'}</b></small>
                        </div>
                    </div>

                    <div class="progress-bar" title="Energia">
                        <div class="progress-fill" style="width:${staminaPercent}%; background:${w.state.status === 'resting' ? '#ff9800' : '#4caf50'};"></div>
                    </div>
                    
                    <div style="margin-top:4px;">
                        <small style="font-size:0.7rem">EXP: ${w.exp} / ${reqExp}</small>
                        <div class="progress-bar" style="height:4px; background:#444;">
                            <div class="progress-fill" style="width:${expPercent}%; background:#2196f3;"></div>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:4px; margin-top:8px;">
                        <button class="up-btn secondary" data-stat="stamina" style="font-size:0.7rem; padding:4px;" title="Stamina: ${w.stats.stamina} (Custa: ${w.level*200}💰)">⚡ ${w.stats.stamina}</button>
                        <button class="up-btn secondary" data-stat="speed" style="font-size:0.7rem; padding:4px;" title="Speed: ${w.stats.speed.toFixed(1)} (Custa: ${w.level*200}💰)">🏃 ${w.stats.speed.toFixed(1)}</button>
                        <button class="up-btn secondary" data-stat="planting" style="font-size:0.7rem; padding:4px;" title="Planting: ${w.stats.planting} (Custa: ${w.level*200}💰)">🌱 ${w.stats.planting}</button>
                    </div>
                `;

                // Bind Upgrade Buttons
                div.querySelectorAll('.up-btn').forEach(btn => {
                    btn.onclick = () => {
                        ws.send(JSON.stringify({
                            type: 'UPGRADE_WORKER',
                            workerId: w.id,
                            statType: btn.dataset.stat
                        }));
                    };
                });

                elements.workerList.appendChild(div);
            });
        }
    }

    // Update Animals
    if(elements.animalPen && player.animals) {
        elements.animalPen.innerHTML = '';
        player.animals.forEach((animal, index) => {
            const div = document.createElement('div');
            const info = animalsData[animal.type];
            const isReady = (Date.now() - animal.lastProduce) >= (info.interval * 1000);
            
            // Apply Rarity Class
            if (animal.rarity) {
                div.classList.add(`rarity-${animal.rarity}`);
            } else {
                div.classList.add('rarity-common');
            }

            // Horse Specific UI
            if (animal.type === 'potro') {
                div.className = `animal-card rarity-${animal.rarity || 'common'}`;
                
                const hungerPct = Math.max(0, 100 - animal.hunger);
                
                // Check if already in race (We need raceState from global or passed down, 
                // but currently we only have player.animals. 
                // Let's assume the server rejects duplicates, but visually we can't tell easily without full state.
                // However, we can make the buttons bigger at least.)

                div.innerHTML = `
                    <h4>🐎 ${animal.name || 'Potro'}</h4>
                    <div class="stat-row">
                        <span>⚡ ${animal.stats.speed.toFixed(1)}</span>
                        <span>❤️ ${animal.stats.stamina}</span>
                    </div>
                    <div class="stat-row"><span>EXP: ${animal.stats.exp}</span></div>
                    
                    <div class="progress-bar" title="Fome">
                        <div class="progress-fill" style="width:${hungerPct}%; background:${hungerPct < 30 ? '#f44336' : '#8bc34a'};"></div>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:8px;">
                        <button class="action-btn secondary" style="font-size:0.9rem; padding:8px;" data-action="feed">🍎 Alimentar</button>
                        <button class="action-btn" style="font-size:0.9rem; padding:8px;" data-action="race">🏁 Correr</button>
                    </div>
                `;

                div.querySelector('button[data-action="feed"]').onclick = (e) => {
                    e.stopPropagation();
                    ws.send(JSON.stringify({ type: 'FEED_ANIMAL', animalIndex: index }));
                };
                div.querySelector('button[data-action="race"]').onclick = (e) => {
                    e.stopPropagation();
                    ws.send(JSON.stringify({ type: 'JOIN_RACE', animalIndex: index }));
                    // Visual feedback (optimistic)
                    e.target.textContent = "Inscrito ⏳";
                    e.target.disabled = true;
                    e.target.style.background = "#4caf50";
                };
            } else {
                // Cows / Simple Animals
                div.className = `animal ${isReady ? 'ready' : ''} rarity-${animal.rarity || 'common'}`;
                div.innerHTML = '🐮';
                div.title = isReady ? 'Ordenhar!' : 'Descansando...';
                
                if(isReady) {
                    div.onclick = () => {
                        playSound('harvest');
                        ws.send(JSON.stringify({ type: 'COLLECT_ANIMAL', animalIndex: index }));
                    };
                }
            }

            elements.animalPen.appendChild(div);
        });
    }
}

function renderPlayerList(players) {
    elements.playerList.innerHTML = '';
    players.forEach(p => {
        if (p.id === playerId) return; // Don't list self? Or list self differently?

        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.marginBottom = '5px';
        
        li.innerHTML = `
            <span>${p.nickname}</span>
            <button class="visit-btn" style="padding:2px 5px; font-size:10px">👁️</button>
        `;
        
        li.querySelector('.visit-btn').onclick = () => switchView(p.id);
        
        elements.playerList.appendChild(li);
    });
}

function addChatMessage(from, text) {
    const p = document.createElement('div');
    p.innerHTML = `<b>${from}:</b> ${text}`;
    elements.chatBox.appendChild(p);
    elements.chatBox.scrollTop = elements.chatBox.scrollHeight;
}

// --- Interactions ---

function handlePlotClick(index, plot) {
    if (currentTargetId === playerId) {
        // My Farm: Plant or Harvest
        if (plot.state === 'empty') {
            if (selectedCrop) {
                playSound('plant');
                ws.send(JSON.stringify({
                    type: 'PLANT',
                    index: index,
                    cropId: selectedCrop
                }));
            } else {
                alert('Selecione uma semente na loja primeiro! (Clique em um item da lista à esquerda)');
            }
        } else if (plot.state === 'ready') {
            playSound('harvest');
            ws.send(JSON.stringify({ type: 'HARVEST', index: index }));
        } else if (plot.state === 'planted') {
            alert('Aguarde a planta crescer!');
        }
    } else {
        // Other's Farm: Steal!
        if (plot.state === 'ready') {
            ws.send(JSON.stringify({ 
                type: 'STEAL', 
                targetId: currentTargetId,
                index: index 
            }));
        } else {
            // Maybe show message "Can't steal yet"
        }
    }
}

// Chat Input
elements.chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const msg = elements.chatInput.value.trim();
        if (msg) {
            ws.send(JSON.stringify({ type: 'CHAT', message: msg }));
            elements.chatInput.value = '';
        }
    }
});