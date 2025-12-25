const fs = require('fs');
const path = require('path');
const firebaseAdmin = require('firebase-admin');

const DATA_FILE = path.join(__dirname, 'data.json');

// Check multiple locations for the service account key
const POSSIBLE_PATHS = [
    path.join(__dirname, 'serviceAccountKey.json'), // Local / Same folder
    path.join(__dirname, '../serviceAccountKey.json'), // Parent folder
    '/etc/secrets/serviceAccountKey.json', // Common Render secret path
    'serviceAccountKey.json' // Root fallback
];

let serviceAccountPath = null;
for (const p of POSSIBLE_PATHS) {
    if (fs.existsSync(p)) {
        serviceAccountPath = p;
        break;
    }
}

let db = null;

// Initialize Firebase if credentials exist
    if (serviceAccountPath) {
        try {
            const serviceAccount = require(serviceAccountPath);
            // URL fixa para garantir conexão correta (Project ID: plantalegaldog)
            const dbUrl = "https://plantalegaldog-default-rtdb.firebaseio.com";
            
            console.log(`🔌 Conectando ao Firebase em: ${dbUrl}`);
            
            firebaseAdmin.initializeApp({
                credential: firebaseAdmin.credential.cert(serviceAccount),
                databaseURL: dbUrl
            });
            db = firebaseAdmin.database();
            console.log(`🔥 Firebase Inicializado!`);
        } catch (e) {
            console.error('❌ Falha ao inicializar Firebase:', e);
            db = null;
        }
    } else {
    console.log('⚠️ No serviceAccountKey.json found in expected paths. Using local JSON storage.');
}

const RARITY_TIERS = {
    'common': { name: 'Comum', chance: 0.50, multiplier: 1.0, color: 'gray' },
    'uncommon': { name: 'Incomum', chance: 0.30, multiplier: 1.2, color: 'green' },
    'rare': { name: 'Raro', chance: 0.15, multiplier: 1.5, color: 'blue' },
    'epic': { name: 'Épico', chance: 0.04, multiplier: 2.0, color: 'purple' },
    'legendary': { name: 'Lendário', chance: 0.01, multiplier: 3.5, color: 'gold' }
};

class GameState {
    constructor() {
        this.players = {}; // map id -> player
        this.gridSize = 64; // 8x8 grid per farm
        
        this.crops = {
            'alface': { name: 'Alface', cost: 10, sell: 20, time: 10 },
            'tomate': { name: 'Tomate', cost: 30, sell: 70, time: 30 },
            'cenoura': { name: 'Cenoura', cost: 40, sell: 90, time: 45 }, 
            'abobora': { name: 'Abóbora', cost: 50, sell: 150, time: 60 },
            'milho': { name: 'Milho', cost: 80, sell: 200, time: 90 }, 
            'morango': { name: 'Morango', cost: 120, sell: 350, time: 120 } 
        };

        this.animals = {
            'vaca': { name: 'Vaca', cost: 500, produce: 50, interval: 30, type: 'produce' },
            'potro': { name: 'Potro', cost: 5000, type: 'race', stats: { speed: 10, stamina: 10, exp: 0 } }
        };

        this.raceState = {
            status: 'waiting', // waiting, running, finished
            entrants: [], // [{playerId, animalIndex, horseName}]
            timer: null,
            results: []
        };
    }

    async init() {
        // Tenta carregar do Firebase primeiro
        if (db) {
            console.log('Lendo dados do Firebase...');
            let retries = 3;
            while (retries > 0) {
                try {
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Tempo limite de conexão excedido')), 10000)
                    );

                    const snapshot = await Promise.race([
                        db.ref('game_data').once('value'),
                        timeoutPromise
                    ]);

                    const data = snapshot.val();
                    if (data && data.players) {
                        this.players = data.players;
                        
                        // Validate and fix data structure
                        Object.values(this.players).forEach(p => {
                            if (!p.plots || p.plots.length !== this.gridSize) {
                                p.plots = this.createFarm();
                            }
                            if (!p.animals) p.animals = [];
                            if (!p.workers) p.workers = []; 
                        });

                        console.log('✅ Jogo carregado do Firebase com sucesso!');
                        return;
                    } else {
                        console.log('ℹ️ Firebase vazio (Novo Jogo) ou inválido.');
                        break; 
                    }
                } catch (e) {
                    console.error(`❌ Erro ao carregar do Firebase (Tentativa ${4-retries}/3):`, e.message);
                    retries--;
                    if (retries === 0) console.error("⚠️ FALHA CRÍTICA: Não foi possível carregar do Firebase.");
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        }

        // Fallback to local file
        if (!db) this.loadLocal();
    }

    rollRarity() {
        const rand = Math.random();
        let cumulative = 0;
        for (const [key, tier] of Object.entries(RARITY_TIERS)) {
            cumulative += tier.chance;
            if (rand < cumulative) {
                return key;
            }
        }
        return 'common'; // Fallback
    }

    createWorker() {
        const rarity = this.rollRarity();
        const multiplier = RARITY_TIERS[rarity].multiplier;
        
        return {
            id: 'w_' + Math.random().toString(36).substr(2, 9),
            name: 'Ajudante',
            level: 1,
            exp: 0,
            rarity: rarity,
            stats: {
                stamina: Math.floor(5 * multiplier),     // Actions before rest
                speed: parseFloat((1 * multiplier).toFixed(1)),       // Speed multiplier (1 = normal)
                planting: rarity === 'legendary' ? 1 : 0     // Only legendary starts with planting skill
            },
            state: {
                energy: Math.floor(5 * multiplier),
                cooldown: 0,
                status: 'idle'  // idle, working, resting
            }
        };
    }

    createFarm() {
        const plots = [];
        for (let i = 0; i < this.gridSize; i++) {
            plots.push({
                id: i,
                state: 'empty', // empty, planted, ready, withered
                cropId: null,
                plantTime: null,
                readyTime: null,
                stolen: false
            });
        }
        return plots;
    }

    loadLocal() {
        if (fs.existsSync(DATA_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
                this.players = data.players || {};
                
                // Ensure every player has a farm
                Object.values(this.players).forEach(p => {
                    if (!p.plots || p.plots.length !== this.gridSize) {
                        p.plots = this.createFarm();
                    }
                });

                console.log('Game loaded from file.');
            } catch (e) {
                console.error('Error loading game:', e);
            }
        }
    }

    saveGame() {
        const data = {
            players: this.players
        };
        
        // Save to local file (Backup)
        try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Error saving game:', e);
        }

        // Save to Firebase (Primary Persistence)
        if (db) {
            db.ref('game_data').set(data).catch(e => {
                console.error('Firebase save failed:', e.message);
            });
        }
    }

    addPlayer(nickname) {
        // Check if player exists by nickname to avoid duplicates on restart
        const existing = Object.values(this.players).find(p => p.nickname === nickname);
        if (existing) {
            return existing.id;
        }

        const id = Math.random().toString(36).substr(2, 9);
        this.players[id] = {
            id,
            nickname,
            coins: 100, // Dinheiro inicial ajustado
            workers: [], // Array de funcionários
            animals: [], // Owned animals
            plots: this.createFarm() // Individual Farm
        };
        this.saveGame();
        return id;
    }

    hireWorker(playerId) {
        const player = this.players[playerId];
        if (!player) return { success: false };
        if (player.coins < 500) return { success: false, reason: "Custa 500 moedas!" };

        player.coins -= 500;
        if (!Array.isArray(player.workers)) player.workers = [];
        player.workers.push(this.createWorker());
        
        this.saveGame();
        return { success: true };
    }

    upgradeWorker(playerId, workerId, statType) {
        const player = this.players[playerId];
        if (!player) return { success: false };
        
        const worker = player.workers.find(w => w.id === workerId);
        if (!worker) return { success: false, reason: "Funcionário não encontrado" };

        if (worker.level >= 10) return { success: false, reason: "Nível Máximo (10) atingido!" };

        const cost = worker.level * 200; // Cost scales with level
        if (player.coins < cost) return { success: false, reason: `Custa ${cost} moedas!` };

        // EXP Check
        const expCost = worker.level * 50;
        if (worker.exp < expCost) return { success: false, reason: `Precisa de ${expCost} EXP!` };

        player.coins -= cost;
        worker.exp -= expCost;
        worker.level++;

        // Stat increase based on Rarity Multiplier
        const multiplier = RARITY_TIERS[worker.rarity || 'common'].multiplier;

        if (statType === 'stamina') {
            worker.stats.stamina += Math.ceil(2 * multiplier);
            worker.state.energy = worker.stats.stamina; // Refill on upgrade
        } else if (statType === 'speed') {
            worker.stats.speed += parseFloat((0.2 * multiplier).toFixed(1));
        } else if (statType === 'planting') {
            worker.stats.planting += 1;
        }

        this.saveGame();
        return { success: true };
    }

    buyAnimal(playerId, type) {
        const player = this.players[playerId];
        if (!player) return { success: false };
        
        const animalInfo = this.animals[type];
        if (!animalInfo) return { success: false };
        if (player.coins < animalInfo.cost) return { success: false, reason: "Moedas insuficientes!" };

        player.coins -= animalInfo.cost;
        if (!player.animals) player.animals = [];
        
        const rarity = this.rollRarity();
        const multiplier = RARITY_TIERS[rarity].multiplier;

        const newAnimal = {
            type: type,
            id: Date.now() + Math.random(),
            lastProduce: Date.now(),
            hunger: 0, // 0 = full, 100 = starving
            rarity: rarity
        };

        if (type === 'potro') {
            newAnimal.stats = { 
                speed: parseFloat((animalInfo.stats.speed * multiplier).toFixed(1)),
                stamina: Math.floor(animalInfo.stats.stamina * multiplier),
                exp: 0
            }; 
            newAnimal.name = 'Potro ' + RARITY_TIERS[rarity].name;
        }

        player.animals.push(newAnimal);
        
        this.saveGame();
        return { success: true };
    }

    feedAnimal(playerId, animalIndex) {
        const player = this.players[playerId];
        if (!player || !player.animals[animalIndex]) return { success: false };

        const animal = player.animals[animalIndex];
        const cost = 20; // Feed cost
        
        if (player.coins < cost) return { success: false, reason: "Sem dinheiro para ração!" };
        if (animal.hunger === 0) return { success: false, reason: "Não está com fome!" };

        player.coins -= cost;
        animal.hunger = Math.max(0, animal.hunger - 50); // Restore 50 hunger
        
        // EXP gain for horses
        if (animal.type === 'potro') {
            animal.stats.exp += 10;
            // Level up stats slightly based on EXP?
            if (animal.stats.exp % 100 === 0) {
                animal.stats.speed += 1;
                animal.stats.stamina += 1;
            }
        }

        this.saveGame();
        return { success: true };
    }

    joinRace(playerId, animalIndex) {
        const player = this.players[playerId];
        if (!player) return { success: false };
        
        const animal = player.animals[animalIndex];
        if (!animal || animal.type !== 'potro') return { success: false, reason: "Apenas cavalos podem correr!" };
        if (animal.hunger > 50) return { success: false, reason: "O cavalo está com fome!" };

        // Check if already in race
        if (this.raceState.entrants.find(e => e.playerId === playerId)) {
            return { success: false, reason: "Já está inscrito!" };
        }

        const entryFee = 100;
        if (player.coins < entryFee) return { success: false, reason: "Taxa de entrada: 100 moedas!" };

        player.coins -= entryFee;
        
        this.raceState.entrants.push({
            playerId,
            animalIndex,
            horseName: animal.name || 'Cavalo',
            stats: animal.stats
        });

        // Iniciar timer de 15 minutos (900s) apenas quando o PRIMEIRO jogador entrar
        if (this.raceState.entrants.length === 1 && this.raceState.status === 'waiting') {
            this.raceState.status = 'starting';
            this.raceState.timer = Date.now() + (15 * 60 * 1000); // 15 minutos
            console.log("🏁 Timer de corrida iniciado: 15 minutos.");
        }

        this.saveGame();
        return { success: true };
    }

    runRace() {
        // Se não tiver ninguém, cancela/reseta
        if (this.raceState.entrants.length === 0) {
            this.raceState.status = 'waiting';
            this.raceState.timer = null;
            return null;
        }

        const results = this.raceState.entrants.map(entrant => {
            // Cálculo de Pontuação (Sorte + Atributos)
            const score = (entrant.stats.speed * 2.0) + (entrant.stats.stamina * 0.5) + (Math.random() * 20);
            return { ...entrant, score };
        });

        // Ordenar por pontuação (Vencedor primeiro)
        results.sort((a, b) => b.score - a.score);

        // Distribuição de Prêmios
        // Regra: 1º lugar leva tudo (soma das taxas) + 100 bônus da casa
        const totalEntryFees = results.length * 100;
        const prizePool = totalEntryFees + 100;

        const winner = results[0];
        let winnerName = winner.horseName;

        // Distribute Prize to Winner (if not NPC)
        if (!winner.isNPC && this.players[winner.playerId]) {
             const winnerPlayer = this.players[winner.playerId];
             winnerPlayer.coins += prizePool;
             winnerName = `${winnerPlayer.nickname} (${winner.horseName})`;
        } else if (winner.isNPC) {
            console.log(`🤖 NPC ${winner.horseName} won the race.`);
        }

        // Distribuição de EXP e Evolução
        results.forEach(r => {
            const p = this.players[r.playerId];
            if (p && p.animals[r.animalIndex]) {
                const animal = p.animals[r.animalIndex];
                
                // Inicializa contador de corridas se não existir
                if (!animal.racesRun) animal.racesRun = 0;

                // Só ganha EXP/Evolui se não atingiu o limite de 200 corridas
                if (animal.racesRun < 200) {
                    animal.racesRun += 1;
                    animal.stats.exp += 100; // XP Fixo por corrida

                    // Evolução de atributos a cada corrida (até o limite)
                    // Exemplo: Ganha 0.1 de speed e 1 de stamina por corrida até o cap
                    animal.stats.speed = parseFloat((animal.stats.speed + 0.1).toFixed(1));
                    animal.stats.stamina += 1;
                }

                animal.hunger = Math.min(100, animal.hunger + 30); // Fome aumenta
            }
        });

        this.raceState.results = results;
        this.raceState.status = 'finished';
        this.raceState.entrants = []; // Limpa inscritos
        this.raceState.timer = Date.now() + 10000; // Mostra resultados por 10s

        this.saveGame();
        return { results, winnerName, prizePool };
    }

    collectAnimal(playerId, animalIndex) {
        const player = this.players[playerId];
        if (!player || !player.animals[animalIndex]) return { success: false };
        
        const animal = player.animals[animalIndex];
        const info = this.animals[animal.type];
        
        const now = Date.now();
        if (now - animal.lastProduce < info.interval * 1000) return { success: false, reason: "Ainda não produziu!" };

        player.coins += info.produce;
        animal.lastProduce = now;
        this.saveGame();
        return { success: true };
    }

    removePlayer(id) {
        delete this.players[id];
    }

    getPlayer(id) {
        return this.players[id];
    }

    getPlayers() {
        return Object.values(this.players);
    }

    getState() {
        return {
            players: this.getPlayers(),
            crops: this.crops,
            animalsConfig: this.animals,
            raceState: {
                status: this.raceState.status,
                entrantsCount: this.raceState.entrants.length,
                timer: this.raceState.timer ? Math.max(0, Math.ceil((this.raceState.timer - Date.now())/1000)) : 0,
                lastResults: this.raceState.results
            }
        };
    }

    plant(playerId, plotIndex, cropId) {
        const player = this.players[playerId];
        if (!player) return { success: false };
        
        const plot = player.plots[plotIndex];
        const crop = this.crops[cropId];

        if (!plot || !crop) return { success: false };
        if (plot.state !== 'empty') return { success: false };
        if (player.coins < crop.cost) return { success: false };

        // Deduct coins
        player.coins -= crop.cost;

        // Update plot
        plot.state = 'planted';
        plot.cropId = cropId;
        plot.plantTime = Date.now();
        plot.readyTime = Date.now() + (crop.time * 1000);
        plot.stolen = false;

        this.saveGame();
        return { success: true };
    }

    harvest(playerId, plotIndex, workerId = null) {
        const player = this.players[playerId];
        if (!player) return { success: false };
        
        const plot = player.plots[plotIndex];
        if (!plot) return { success: false };
        
        if (plot.state !== 'ready') return { success: false };

        const crop = this.crops[plot.cropId];
        let value = crop.sell;
        
        if (plot.stolen) {
            value = Math.floor(value * 0.8); // 20% loss if stolen
        }

        player.coins += value;

        // Worker EXP Logic
        if (workerId) {
            const worker = player.workers.find(w => w.id === workerId);
            if (worker && worker.level < 200) {
                worker.exp += 5; // Pouca EXP por colheita
                
                // Level Up Check (Formula: Level * 50)
                const reqExp = worker.level * 50;
                if (worker.exp >= reqExp) {
                    worker.exp -= reqExp;
                    worker.level++;
                    
                    // Auto-upgrade stats
                    worker.stats.stamina += 2;
                    worker.stats.speed = parseFloat((worker.stats.speed + 0.1).toFixed(1));
                    worker.state.energy = worker.stats.stamina; // Full heal on level up
                }
            }
        }

        // Reset plot
        plot.state = 'empty';
        plot.cropId = null;
        plot.plantTime = null;
        plot.readyTime = null;
        plot.stolen = false;

        this.saveGame();
        return { success: true };
    }

    steal(thiefId, targetId, plotIndex) {
        const thief = this.players[thiefId];
        const target = this.players[targetId];

        if (!thief || !target) return { success: false };
        if (thiefId === targetId) return { success: false, reason: "Não pode roubar a si mesmo!" };
        
        const plot = target.plots[plotIndex];
        if (!plot) return { success: false };
        
        // Can only steal if ready
        if (plot.state !== 'ready') return { success: false, reason: "Ainda não está pronto!" };
        
        // Can't steal if already stolen
        if (plot.stolen) return { success: false, reason: "Já foi roubado!" };

        const crop = this.crops[plot.cropId];
        const stealAmount = Math.floor(crop.sell * 0.2); // Steal 20%

        thief.coins += stealAmount;
        plot.stolen = true;

        this.saveGame();
        return { success: true };
    }

    tick() {
        // Check for growth updates
        let changed = false;
        const now = Date.now();

        // Race Logic
        if (this.raceState.status === 'starting' && now >= this.raceState.timer) {
            const raceResult = this.runRace();
            if (raceResult) {
                this.lastRaceResult = raceResult; // Store for server to read
            }
            changed = true;
        } else if (this.raceState.status === 'finished' && now >= this.raceState.timer) {
            this.raceState.status = 'waiting';
            this.raceState.results = [];
            changed = true;
        }

        Object.values(this.players).forEach(player => {
            // 1. Plots Growth
            player.plots.forEach(plot => {
                if (plot.state === 'planted' && now >= plot.readyTime) {
                    plot.state = 'ready';
                    changed = true;
                }
            });

            // Animal Hunger Logic
            if (player.animals) {
                player.animals.forEach(animal => {
                    // Hunger increases over time
                    if (Math.random() < 0.01) { // Slow hunger
                        if (!animal.hunger) animal.hunger = 0;
                        if (animal.hunger < 100) {
                            animal.hunger += 1;
                            changed = true;
                        }
                    }
                });
            }

            // 2. Worker Logic (Advanced)
            if (Array.isArray(player.workers)) {
                player.workers.forEach(worker => {
                    // Recuperação de Energia (Resting)
                    if (worker.state.energy < worker.stats.stamina) {
                        // Recupera 1 de energia a cada tick (lento)
                        // Se estiver zerado, recupera mais rápido? Não, linear.
                        // Mas só trabalha se tiver energia > 0
                        if (Math.random() < 0.1) { // 10% chance de recuperar 1 energia por segundo
                            worker.state.energy++;
                            changed = true;
                        }
                    }

                    // Trabalho (Harvest)
                    if (worker.state.energy > 0) {
                        // Chance baseada na SPEED. Base 1% * Speed.
                        // Ex: Speed 1.0 = 1% chance/seg. Speed 5.0 = 5% chance/seg.
                        const workChance = 0.01 * worker.stats.speed;
                        
                        if (Math.random() < workChance) {
                            const readyPlotIndex = player.plots.findIndex(p => p.state === 'ready');
                            if (readyPlotIndex !== -1) {
                                // Realiza o trabalho
                                this.harvest(player.id, readyPlotIndex, worker.id);
                                worker.state.energy--; // Gasta energia
                                changed = true;
                            }
                        }
                    }
                });
            }
        });
        
        if (changed) {
            this.saveGame();
        }

        return changed;
    }
}

module.exports = { GameState };