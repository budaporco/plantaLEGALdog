let ws;
let playerId = null;
let currentTargetId = null; // Who's farm are we looking at?
let playerCoins = 0;
let cropsData = {};
let animalsData = {}; 
let selectedCrop = null;
let playersData = []; // Cache all players
let currentRaceState = null; // Cache race state
let currentQuickRaceState = null; // Cache quick race state
let breedingSelection = null; // Breeding state

const elements = {
    loginScreen: document.getElementById('login-screen'),
    gameScreen: document.getElementById('game-screen'),
    nicknameInput: document.getElementById('nickname-input'),
    loginBtn: document.getElementById('login-btn'),
    autoLoginCheckbox: document.getElementById('auto-login-check'),
    logoutBtn: document.getElementById('logout-btn'),
    farmGrid: document.getElementById('farm-grid'),
    playerName: document.getElementById('player-name'),
    playerCoins: document.getElementById('player-coins'),
    shopList: document.getElementById('shop-list'),
    chatBox: document.getElementById('chat-box'),
    chatInput: document.getElementById('chat-input'),
    playerList: document.getElementById('player-list'),
    animalSection: document.createElement('div'), 
    workerSection: document.createElement('div'),
    farmTitle: document.createElement('h2'),
    rightSidebar: document.createElement('div') // New Right Sidebar
};

// Insert Right Sidebar
elements.rightSidebar.className = 'right-sidebar';
elements.gameScreen.appendChild(elements.rightSidebar);

// Notification Bell
const bell = document.createElement('div');
bell.id = 'notification-bell';
bell.className = 'notification-bell hidden';
bell.innerHTML = '🔔';
bell.onclick = () => {
    bell.classList.remove('active');
    bell.classList.add('hidden');
    // Scroll to auction panel
    elements.auctionList.scrollIntoView({ behavior: 'smooth' });
};
document.body.appendChild(bell);

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
        <div style="display:flex; gap:5px;">
            <button id="home-btn" style="flex:1;">🏠 Minha Fazenda</button>
            <button id="settings-btn" style="width:40px; padding:0;">⚙️</button>
        </div>
        <div style="display:flex; gap:5px; margin-top:5px;">
            <button id="talents-btn" class="secondary" style="flex:1;">🌳 Talentos</button>
            <button id="help-btn" class="secondary" style="width:40px; padding:0;">?</button>
        </div>
    `;
    sidebar.insertBefore(navPanel, sidebar.firstChild);
    
    navPanel.querySelector('#home-btn').onclick = () => {
        switchView(playerId);
    };

    // Talent Modal Logic
    const talentsBtn = navPanel.querySelector('#talents-btn');
    
    const talentModal = document.createElement('div');
    talentModal.className = 'modal hidden';
    talentModal.id = 'talent-modal';
    talentModal.innerHTML = `
        <div class="modal-content" style="max-width:500px;">
            <span class="close-modal" id="close-talents">&times;</span>
            <h2 style="margin-top:0;">🌳 Árvore de Talentos</h2>
            <p style="color:#aaa; font-size:0.9rem; margin-bottom:15px;">Melhore sua fazenda com vantagens permanentes!</p>
            <div id="talent-list" style="display:grid; gap:10px;"></div>
        </div>
    `;
    document.body.appendChild(talentModal);

    const closeTalents = talentModal.querySelector('#close-talents');
    const talentList = talentModal.querySelector('#talent-list');

    talentsBtn.onclick = () => {
        renderTalents();
        talentModal.classList.remove('hidden');
    };

    closeTalents.onclick = () => {
        talentModal.classList.add('hidden');
    };

    talentModal.onclick = (e) => {
        if (e.target === talentModal) talentModal.classList.add('hidden');
    };

    window.renderTalents = function() {
        if (!talentList || talentModal.classList.contains('hidden')) return;
        
        const player = playersData.find(p => p.id === playerId);
        if (!player) return;

        talentList.innerHTML = '';
        const userTalents = player.talents || {};

        Object.keys(TALENTS_CONFIG).forEach(id => {
            const config = TALENTS_CONFIG[id];
            const currentLevel = userTalents[id] || 0;
            const isMaxed = currentLevel >= config.maxLevel;
            const cost = Math.floor(config.baseCost * Math.pow(config.costMult, currentLevel));
            
            const div = document.createElement('div');
            div.className = 'panel';
            div.style.background = '#222';
            div.style.border = '1px solid #444';
            div.style.display = 'flex';
            div.style.gap = '10px';
            div.style.alignItems = 'center';
            div.style.padding = '10px';

            div.innerHTML = `
                <div style="font-size:2rem; background:#333; width:50px; height:50px; display:flex; justify-content:center; align-items:center; border-radius:8px;">${config.icon}</div>
                <div style="flex:1;">
                    <h4 style="margin:0; color:#fff;">${config.name} <span style="color:gold; font-size:0.8rem;">Lv. ${currentLevel}/${config.maxLevel}</span></h4>
                    <small style="color:#aaa;">${config.desc}</small>
                </div>
                <div style="text-align:right;">
                    ${isMaxed ? 
                        `<button disabled style="background:#555; color:#aaa; cursor:default;">MAX</button>` :
                        `<button class="buy-talent-btn" data-id="${id}" style="background:${player.coins >= cost ? '#4caf50' : '#f44336'}; min-width:80px;">
                            ${formatNumber(cost)}💰<br><small>Evoluir</small>
                        </button>`
                    }
                </div>
            `;
            
            if (!isMaxed) {
                const btn = div.querySelector('.buy-talent-btn');
                btn.onclick = () => {
                    if (player.coins >= cost) {
                        ws.send(JSON.stringify({ type: 'BUY_TALENT', talentId: id }));
                        // Optimistic update or wait for server? Wait for server is safer.
                    } else {
                        alert(`Você precisa de ${formatNumber(cost)} moedas!`);
                    }
                };
            }

            talentList.appendChild(div);
        });
    };

    // Settings Modal Logic
    const settingsBtn = navPanel.querySelector('#settings-btn');
    
    // Create Settings Modal dynamically
    const settingsModal = document.createElement('div');
    settingsModal.className = 'modal hidden';
    settingsModal.id = 'settings-modal';
    settingsModal.innerHTML = `
        <div class="modal-content" style="max-width:300px;">
            <span class="close-modal" id="close-settings">&times;</span>
            <h2 style="margin-top:0;">⚙️ Configurações</h2>
            
            <div style="margin-top:20px;">
                <label for="volume-slider" style="display:block; margin-bottom:10px;">🔊 Volume Principal</label>
                <input type="range" id="volume-slider" min="0" max="100" value="50" style="width:100%;">
                <p id="volume-val" style="text-align:center; color:#ccc;">50%</p>
            </div>

            <div style="margin-top:20px; border-top:1px solid #444; padding-top:20px;">
                <button id="logout-btn" style="width:100%; background:#f44336;">🚪 Sair / Deslogar</button>
            </div>
            
            <div style="margin-top:20px; text-align:center;">
                <small>PlantaLegalDog v1.1</small>
            </div>
        </div>
    `;
    document.body.appendChild(settingsModal);

    const closeSettings = settingsModal.querySelector('#close-settings');
    const volSlider = settingsModal.querySelector('#volume-slider');
    const volVal = settingsModal.querySelector('#volume-val');
    const logoutBtn = settingsModal.querySelector('#logout-btn');

    settingsBtn.onclick = () => {
        settingsModal.classList.remove('hidden');
    };

    closeSettings.onclick = () => {
        settingsModal.classList.add('hidden');
    };
    
    settingsModal.onclick = (e) => {
        if (e.target === settingsModal) settingsModal.classList.add('hidden');
    };

    volSlider.oninput = (e) => {
        const val = e.target.value;
        volVal.textContent = val + '%';
        masterGainNode.gain.value = val / 100;
        
        // Resume context if needed when interacting
        if (audioCtx.state === 'suspended') audioCtx.resume();
    };

    logoutBtn.onclick = () => {
        if(confirm('Tem certeza que deseja sair?')) {
            localStorage.removeItem('autoLoginName');
            location.reload();
        }
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
    const auctionPanel = document.createElement('div');
    auctionPanel.className = 'panel';
    auctionPanel.style.border = '2px solid #9c27b0';
    auctionPanel.innerHTML = `
        <h3>🏛️ Leilões</h3>
        <div id="auction-list" style="max-height:150px; overflow-y:auto; font-size:0.8rem;">
            <p style="text-align:center; color:#888;">Nenhum leilão ativo.</p>
        </div>
    `;
    sidebar.insertBefore(auctionPanel, sidebar.children[2]);
    elements.auctionList = auctionPanel.querySelector('#auction-list');

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
        <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" id="worker-header">
            <h3 style="margin:0; border:none;">👷 Funcionários</h3>
            <span id="worker-toggle">▼</span>
        </div>
        <p>Total: <span id="worker-count">0</span></p>
        <button id="hire-btn" style="width:100%; font-size:0.8rem; margin-bottom:10px;">Contratar (500💰)</button>
        <div id="worker-list" style="margin-top:10px;"></div>
        <small>Colhem automaticamente!</small>
    `;
    sidebar.insertBefore(workerPanel, sidebar.children[2]);
    elements.workerCount = workerPanel.querySelector('#worker-count');
    elements.hireBtn = workerPanel.querySelector('#hire-btn');
    elements.workerList = workerPanel.querySelector('#worker-list');
    elements.workerToggle = workerPanel.querySelector('#worker-toggle');
    elements.workerHeader = workerPanel.querySelector('#worker-header');

    // Toggle Logic
    let isWorkerOpen = true;
    elements.workerHeader.onclick = () => {
        isWorkerOpen = !isWorkerOpen;
        elements.workerList.style.display = isWorkerOpen ? 'block' : 'none';
        elements.workerToggle.textContent = isWorkerOpen ? '▼' : '▶';
    };

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
        
        <!-- Cow Section -->
        <div class="animal-section-header" id="cow-header">
            <span>🐄 Vacas</span> <span id="cow-toggle">▼</span>
        </div>
        <div id="cow-list" class="animal-list-grid"></div>

        <!-- Horse Section -->
        <div class="animal-section-header" id="horse-header" style="margin-top:10px;">
            <span>🐎 Cavalos</span> <span id="horse-toggle">▼</span>
        </div>
        <div id="horse-list" class="animal-list-stack"></div>
    `;
    sidebar.insertBefore(animalPanel, sidebar.children[3]);
    
    elements.cowList = animalPanel.querySelector('#cow-list');
    elements.horseList = animalPanel.querySelector('#horse-list');
    elements.cowHeader = animalPanel.querySelector('#cow-header');
    elements.horseHeader = animalPanel.querySelector('#horse-header');
    elements.cowToggle = animalPanel.querySelector('#cow-toggle');
    elements.horseToggle = animalPanel.querySelector('#horse-toggle');
    elements.buyCowBtn = animalPanel.querySelector('#buy-cow-btn');
    elements.buyHorseBtn = animalPanel.querySelector('#buy-horse-btn');

    // Toggle Logic for Animals
    let isCowOpen = true;
    let isHorseOpen = true;

    elements.cowHeader.onclick = () => {
        isCowOpen = !isCowOpen;
        elements.cowList.style.display = isCowOpen ? 'grid' : 'none';
        elements.cowToggle.textContent = isCowOpen ? '▼' : '▶';
    };

    elements.horseHeader.onclick = () => {
        isHorseOpen = !isHorseOpen;
        elements.horseList.style.display = isHorseOpen ? 'block' : 'none';
        elements.horseToggle.textContent = isHorseOpen ? '▼' : '▶';
    };

    elements.buyCowBtn.onclick = () => {
        ws.send(JSON.stringify({ type: 'BUY_ANIMAL', animalType: 'vaca' }));
    };
    elements.buyHorseBtn.onclick = () => {
        ws.send(JSON.stringify({ type: 'BUY_ANIMAL', animalType: 'potro' }));
    };
}

// --- Audio System (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const masterGainNode = audioCtx.createGain();
masterGainNode.connect(audioCtx.destination);
masterGainNode.gain.value = 0.5; // Default 50%

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(masterGainNode); // Connect to Master instead of Destination
    
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

// Check for Auto-Login
const savedName = localStorage.getItem('autoLoginName');
if (savedName) {
    elements.nicknameInput.value = savedName;
    if (elements.autoLoginCheckbox) elements.autoLoginCheckbox.checked = true;
    // Auto connect
    setTimeout(() => connect(savedName), 500);
}

elements.loginBtn.addEventListener('click', () => {
    const nickname = elements.nicknameInput.value.trim();
    if (nickname) {
        if (elements.autoLoginCheckbox && elements.autoLoginCheckbox.checked) {
            localStorage.setItem('autoLoginName', nickname);
        } else {
            localStorage.removeItem('autoLoginName');
        }
        connect(nickname);
    }
});

if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('autoLoginName');
        location.reload();
    });
}

function connect(nickname) {
    // Check if we are running locally or in production
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    let wsUrl;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    if (isLocal) {
        wsUrl = `${protocol}//${window.location.host}`;
    } else {
        // Dynamic production URL (Same Origin)
        wsUrl = `${protocol}//${window.location.host}`;
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
            currentRaceState = data.state.raceState;
            currentQuickRaceState = data.state.quickRaceState;
            
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
            if (me) {
                updateSelf(me);
                // Refresh talents if open
                if (window.renderTalents) window.renderTalents();
            }
            
            renderPlayerList(playersData);
            renderAuctions(data.state.auctions);
            break;

        case 'RARE_AUCTION_NOTIFY':
            const bell = document.getElementById('notification-bell');
            if (bell) {
                bell.classList.remove('hidden');
                bell.classList.add('active');
                playSound('coin'); // Sound alert
            }
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

function renderAuctions(auctions) {
    if (!elements.auctionList) return;
    elements.auctionList.innerHTML = '';

    if (!auctions || auctions.length === 0) {
        elements.auctionList.innerHTML = '<p style="text-align:center; color:#888;">Nenhum leilão ativo.</p>';
        return;
    }

    auctions.forEach(auction => {
        const div = document.createElement('div');
        div.style.background = 'rgba(0,0,0,0.3)';
        div.style.padding = '5px';
        div.style.marginBottom = '5px';
        div.style.borderRadius = '5px';
        div.style.borderLeft = `3px solid ${auction.rarity === 'legendary' ? 'gold' : (auction.rarity === 'epic' ? 'purple' : 'gray')}`;
        
        const timeLeft = Math.max(0, Math.floor((auction.endTime - Date.now()) / 1000));
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <strong>${auction.item.name || 'Item'}</strong>
                <small>${mins}:${secs < 10 ? '0'+secs : secs}</small>
            </div>
            <div style="font-size:0.8rem; color:#aaa;">Vendedor: ${auction.sellerName}</div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                <span style="color:gold;">${auction.price}💰</span>
                ${auction.sellerId !== playerId ? `<button style="font-size:0.7rem; padding:2px 5px;" onclick="placeBid('${auction.id}')">LANCE</button>` : '<small>Seu Item</small>'}
            </div>
            ${auction.bidderName ? `<small style="color:#4caf50;">Lance: ${auction.bidderName}</small>` : ''}
        `;
        elements.auctionList.appendChild(div);
    });
}

window.placeBid = function(auctionId) {
    ws.send(JSON.stringify({ type: 'PLACE_BID', auctionId }));
};

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

const TALENTS_CONFIG = {
    'growth_speed': { name: 'Fertilizante Mágico', desc: 'Plantas crescem 1% mais rápido por nível.', baseCost: 1000, costMult: 1.5, maxLevel: 50, icon: '🧪' },
    'sell_bonus': { name: 'Lábia de Comerciante', desc: 'Venda colheitas por 1% a mais por nível.', baseCost: 2000, costMult: 2.0, maxLevel: 20, icon: '💰' },
    'worker_cost': { name: 'Sindicato Eficiente', desc: 'Reduz custo de upgrade de operários em 1% por nível.', baseCost: 5000, costMult: 1.2, maxLevel: 50, icon: '🏗️' }
};

// --- Rendering ---

function renderShop(player = null) {
    elements.shopList.innerHTML = '';
    
    // 1. Crops
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

    // 2. Prestige Items (Deed)
    if (player) {
        const deedCount = player.deedCount || 0;
        const deedPrice = 1000000 * Math.pow(3, deedCount);
        
        const div = document.createElement('div');
        div.className = 'shop-item special';
        div.style.border = '2px solid gold';
        div.style.marginTop = '10px';
        div.style.background = 'linear-gradient(45deg, #333, #4a3b00)';
        
        div.innerHTML = `
            <span style="color:gold">📜 Escritura</span>
            <small style="color:#ffeb3b">${formatNumber(deedPrice)}💰</small>
            <div style="font-size:0.7rem; color:#aaa">Nível: ${deedCount}</div>
        `;
        div.onclick = () => {
            if(confirm(`Comprar Escritura de Fazenda por ${formatNumber(deedPrice)} moedas?`)) {
                ws.send(JSON.stringify({ type: 'BUY_DEED' }));
            }
        };
        elements.shopList.appendChild(div);
    }
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num;
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

const RARITY_VALUE = { 'legendary': 5, 'epic': 4, 'rare': 3, 'uncommon': 2, 'common': 1 };

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

    // Update Prestige Display
    if (!elements.prestigeDisplay) {
        const prestigeContainer = document.createElement('span');
        prestigeContainer.style.marginLeft = '15px';
        prestigeContainer.style.color = '#e040fb'; // Purple for prestige
        prestigeContainer.style.fontWeight = 'bold';
        prestigeContainer.innerHTML = '✨ <span id="prestige-val">0</span>';
        
        // Insert after coins (assuming parent is a header or stats bar)
        if (elements.playerCoins.parentElement) {
            elements.playerCoins.parentElement.appendChild(prestigeContainer);
        }
        elements.prestigeDisplay = prestigeContainer.querySelector('#prestige-val');
    }
    
    if (elements.prestigeDisplay) {
        elements.prestigeDisplay.textContent = player.prestige || 0;
    }

    // Update Merchant Seals Display
    if (!elements.sealDisplay) {
        const sealContainer = document.createElement('span');
        sealContainer.style.marginLeft = '15px';
        sealContainer.style.color = '#03a9f4'; // Blue for seals
        sealContainer.style.fontWeight = 'bold';
        sealContainer.innerHTML = '🛡️ <span id="seal-val">0</span>';
        
        if (elements.playerCoins.parentElement) {
            elements.playerCoins.parentElement.appendChild(sealContainer);
        }
        elements.sealDisplay = sealContainer.querySelector('#seal-val');
    }
    if (elements.sealDisplay) {
        elements.sealDisplay.textContent = player.merchantSeals || 0;
    }

    // Refresh Shop Prices (Dynamic Deed Cost)
    renderShop(player);

    // Update Workers
    if(elements.workerList && player.workers) {
        // Atualiza o contador de texto
        if (elements.workerCount) {
            elements.workerCount.textContent = Array.isArray(player.workers) ? player.workers.length : 0;
        }

        elements.workerList.innerHTML = '';
        if (Array.isArray(player.workers)) {
            // Sort by Rarity Descending
            const sortedWorkers = [...player.workers].sort((a, b) => {
                return (RARITY_VALUE[b.rarity] || 1) - (RARITY_VALUE[a.rarity] || 1);
            });

            sortedWorkers.forEach(w => {
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
                    
                    ${currentTargetId === playerId ? `
                    <button class="action-btn secondary" style="width:100%; margin-top:5px; background:#5d4037;" onclick="sellItem('worker', ${player.workers.indexOf(w)})">🔨 Leiloar</button>
                    ` : ''}
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

    // Update Animals (Main Panel + Right Sidebar)
    if(player.animals) {
        if (elements.animalPen) elements.animalPen.innerHTML = '';
        if (elements.rightSidebar) elements.rightSidebar.innerHTML = '';
        if (elements.cowList) elements.cowList.innerHTML = '';
        if (elements.horseList) elements.horseList.innerHTML = '';

        player.animals.forEach((animal, index) => {
            const info = animalsData[animal.type];
            const isReady = (Date.now() - animal.lastProduce) >= (info.interval * 1000);
            
            // 1. Right Sidebar Shortcuts (Only Cows)
            if (animal.type === 'vaca') {
                const shortcut = document.createElement('div');
                shortcut.className = `cow-shortcut ${isReady ? 'ready' : ''}`;
                shortcut.innerHTML = '🐮';
                shortcut.title = isReady ? 'Coletar Leite!' : 'Produzindo...';
                
                if (isReady) {
                    shortcut.onclick = () => {
                        playSound('harvest');
                        ws.send(JSON.stringify({ type: 'COLLECT_ANIMAL', animalIndex: index }));
                    };
                }
                if (elements.rightSidebar) elements.rightSidebar.appendChild(shortcut);
            }

            // 2. Main Panel Rendering (Split View)
            if (elements.cowList && elements.horseList) {
                const isHorse = animal.type === 'potro';
                const targetContainer = isHorse ? elements.horseList : elements.cowList;
                
                const div = document.createElement('div');
                
                // Apply Rarity Class
                if (animal.rarity) {
                    div.classList.add(`rarity-${animal.rarity}`);
                } else {
                    div.classList.add('rarity-common');
                }

                // Horse Specific UI
                    if (isHorse) {
                        div.className = `animal-card rarity-${animal.rarity || 'common'}`;
                        
                        const hungerPct = Math.max(0, 100 - animal.hunger);
                        
                        // Age Calculation (1 Day = 1 Year)
                        const ONE_YEAR_MS = 24 * 60 * 60 * 1000;
                        const ageYears = Math.floor((Date.now() - (animal.birthTime || Date.now())) / ONE_YEAR_MS);
                        const isAdult = ageYears >= 3;

                        // Check if already in race (Normal or Quick)
                        let isRegistered = false;
                        let isQuickRegistered = false;

                        if (currentRaceState && currentRaceState.entrants) {
                             isRegistered = currentRaceState.entrants.some(e => e.playerId === playerId && e.animalIndex === index);
                        }
                        if (currentQuickRaceState && currentQuickRaceState.entrants) {
                             isQuickRegistered = currentQuickRaceState.entrants.some(e => e.playerId === playerId && e.animalIndex === index);
                        }

                        div.innerHTML = `
                            <div style="display:flex; justify-content:space-between;">
                                <h4 style="margin:0">🐎 ${animal.name || 'Potro'}</h4>
                                <small style="color:${isAdult ? '#4caf50' : '#aaa'}">${ageYears} Anos</small>
                            </div>
                            <div class="stat-row">
                                <span>⚡ ${animal.stats.speed.toFixed(1)}</span>
                                <span>❤️ ${animal.stats.stamina}</span>
                            </div>
                            <div class="stat-row"><span>EXP: ${animal.stats.exp}</span></div>
                            
                            <div class="progress-bar" title="Fome">
                                <div class="progress-fill" style="width:${hungerPct}%; background:${hungerPct < 30 ? '#f44336' : '#8bc34a'};"></div>
                            </div>
                            
                            ${animal.energy !== undefined ? `
                            <div class="progress-bar" title="Energia (Stamina)" style="margin-top:2px;">
                                <div class="progress-fill" style="width:${Math.min(100, (animal.energy / (animal.stats.stamina * 10)) * 100)}%; background:#2196f3;"></div>
                            </div>
                            ` : ''}

                            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:4px; margin-top:8px;">
                                <button class="action-btn secondary" style="font-size:0.8rem; padding:4px;" data-action="feed">🍎 Comer</button>
                                
                                ${isRegistered ? 
                                    `<button class="action-btn" style="font-size:0.8rem; padding:4px; background:#4caf50; cursor:default;" disabled>Inscrito ✅</button>` :
                                    `<button class="action-btn" style="font-size:0.8rem; padding:4px;" data-action="race" ${isQuickRegistered ? 'disabled' : ''}>🏁 Correr</button>`
                                }

                                ${isQuickRegistered ? 
                                    `<button class="action-btn" style="font-size:0.8rem; padding:4px; background:#ff9800; cursor:default;" disabled>Rápida ⚡</button>` :
                                    `<button class="action-btn" style="font-size:0.8rem; padding:4px; background:#ff9800;" data-action="quick-race" ${isRegistered ? 'disabled' : ''}>⚡ Rápida</button>`
                                }
                            </div>
                            
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; margin-top:4px;">
                                ${isAdult && currentTargetId === playerId ? `
                                <button class="action-btn" style="font-size:0.8rem; padding:4px; background:#e91e63;" data-action="breed">❤️ Cruzar</button>
                                ` : ''}
                                ${currentTargetId === playerId ? `
                                <button class="action-btn secondary" style="font-size:0.8rem; padding:4px; background:#5d4037;" onclick="sellItem('animal', ${index})">🔨 Leiloar</button>
                                ` : ''}
                            </div>
                        `;

                        div.querySelector('button[data-action="feed"]').onclick = (e) => {
                            e.stopPropagation();
                            ws.send(JSON.stringify({ type: 'FEED_ANIMAL', animalIndex: index }));
                        };
                        
                        const breedBtn = div.querySelector('button[data-action="breed"]');
                        if (breedBtn) {
                            breedBtn.onclick = (e) => {
                                e.stopPropagation();
                                if (breedingSelection === null) {
                                    breedingSelection = index;
                                    breedBtn.textContent = "Selecionado 💘";
                                    breedBtn.disabled = true;
                                    alert('Selecione o segundo cavalo adulto para cruzar!');
                                } else if (breedingSelection === index) {
                                    breedingSelection = null;
                                    updateSelf(playersData.find(p => p.id === playerId));
                                } else {
                                    if (confirm('Cruzar estes dois cavalos por 2000 moedas?')) {
                                        ws.send(JSON.stringify({ type: 'BREED_HORSES', parent1: breedingSelection, parent2: index }));
                                    }
                                    breedingSelection = null;
                                    updateSelf(playersData.find(p => p.id === playerId));
                                }
                            };
                        }

                        const raceBtn = div.querySelector('button[data-action="race"]');
                        if (raceBtn && !raceBtn.disabled) {
                            raceBtn.onclick = (e) => {
                                e.stopPropagation();
                                ws.send(JSON.stringify({ type: 'JOIN_RACE', animalIndex: index }));
                            };
                        }

                        const quickRaceBtn = div.querySelector('button[data-action="quick-race"]');
                        if (quickRaceBtn && !quickRaceBtn.disabled) {
                            quickRaceBtn.onclick = (e) => {
                                e.stopPropagation();
                                ws.send(JSON.stringify({ type: 'JOIN_QUICK_RACE', animalIndex: index }));
                            };
                        }
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

                    if (currentTargetId === playerId) {
                         const sellBtn = document.createElement('div');
                         sellBtn.innerHTML = '🔨';
                         sellBtn.className = 'sell-icon';
                         sellBtn.onclick = (e) => {
                             e.stopPropagation();
                             sellItem('animal', index);
                         };
                         div.appendChild(sellBtn);
                    } else {
                        // Upgrade Button for Visitors
                        const upgradeBtn = document.createElement('div');
                        upgradeBtn.innerHTML = '⬆️';
                        upgradeBtn.className = 'upgrade-icon';
                        upgradeBtn.onclick = (e) => {
                             e.stopPropagation();
                             upgradeCow(currentTargetId, index);
                        };
                        div.appendChild(upgradeBtn);
                    }
                }

                targetContainer.appendChild(div);
            } else if (elements.animalPen) {
                 // Fallback to single pen if split view not initialized
                const div = document.createElement('div');
                div.className = `animal ${isReady ? 'ready' : ''}`;
                div.innerHTML = animal.type === 'vaca' ? '🐮' : '🐎';
                elements.animalPen.appendChild(div);
            }
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

window.sellItem = function(type, index) {
    if(confirm('Deseja leiloar este item? (Preço base definido pela raridade)')) {
        ws.send(JSON.stringify({ type: 'CREATE_AUCTION', itemType: type, itemIndex: index }));
    }
};

window.upgradeCow = function(targetId, index) {
    if(confirm('Gastar Selos de Comerciante para melhorar a raridade desta vaca?')) {
        ws.send(JSON.stringify({ type: 'UPGRADE_COW_RARITY', targetId: targetId, cowIndex: index }));
    }
};

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