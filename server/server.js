const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { GameState } = require('./gameState');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, '../client');
console.log('Server starting...');
console.log('PUBLIC_DIR resolved to:', PUBLIC_DIR);

// --- 1. HTTP Server for Static Files ---
const server = http.createServer((req, res) => {
    // Handle potential query parameters by parsing the URL
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    console.log(`Request: ${req.url} -> Path: ${pathname} -> FilePath: ${filePath}`);
    
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const extname = path.extname(filePath);
    let contentType = 'text/html';
    switch (extname) {
        case '.js': contentType = 'text/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.json': contentType = 'application/json'; break;
        case '.png': contentType = 'image/png'; break;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if(error.code == 'ENOENT'){
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server Error: '+error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// --- 2. Custom WebSocket Implementation (No external libs) ---
const game = new GameState();
const clients = new Set();

server.on('upgrade', (req, socket, head) => {
    if (req.headers['upgrade'] !== 'websocket') {
        socket.end('HTTP/1.1 400 Bad Request');
        return;
    }

    // Handshake
    const acceptKey = req.headers['sec-websocket-key'];
    const hash = generateAcceptValue(acceptKey);
    const responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${hash}`
    ];

    socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');

    // Connection Object
    const connection = {
        socket,
        id: null // Player ID associated with this socket
    };
    clients.add(connection);

    socket.on('data', (buffer) => {
        const message = parseFrame(buffer);
        if (message) {
            handleMessage(connection, message);
        }
    });

    socket.on('close', () => {
        handleDisconnect(connection);
    });
    
    socket.on('error', (err) => {
        console.error("Socket error:", err);
        handleDisconnect(connection);
    });
});

function generateAcceptValue(acceptKey) {
    return crypto
        .createHash('sha1')
        .update(acceptKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', 'binary')
        .digest('base64');
}

// Simple Frame Parser (Text frames only, small payloads < 65535)
function parseFrame(buffer) {
    // Basic validation
    if (buffer.length < 2) return null;

    const firstByte = buffer[0];
    const opCode = firstByte & 0x0f;
    const fin = (firstByte & 0x80) === 0x80;

    if (opCode === 0x8) { // Close frame
        return null;
    }
    if (opCode !== 0x1) return null; // Only handle text frames

    const secondByte = buffer[1];
    const isMasked = (secondByte & 0x80) === 0x80;
    let payloadLength = secondByte & 0x7F;
    let currentOffset = 2;

    if (payloadLength === 126) {
        payloadLength = buffer.readUInt16BE(2);
        currentOffset += 2;
    } else if (payloadLength === 127) {
        // Ignore huge frames for simplicity
        return null; 
    }

    if (!isMasked) return null; // Clients must mask

    const maskKey = buffer.slice(currentOffset, currentOffset + 4);
    currentOffset += 4;

    const payload = buffer.slice(currentOffset, currentOffset + payloadLength);
    const decoded = Buffer.alloc(payloadLength);

    for (let i = 0; i < payloadLength; i++) {
        decoded[i] = payload[i] ^ maskKey[i % 4];
    }

    return decoded.toString('utf8');
}

// Frame Sender
function sendFrame(socket, data) {
    if(socket.destroyed || !socket.writable) return;
    
    const json = JSON.stringify(data);
    const payloadBuffer = Buffer.from(json, 'utf8');
    const payloadLength = payloadBuffer.length;

    let frameBuffer;
    
    if (payloadLength < 126) {
        frameBuffer = Buffer.alloc(2 + payloadLength);
        frameBuffer[0] = 0x81; // FIN + Text
        frameBuffer[1] = payloadLength; // No mask
        payloadBuffer.copy(frameBuffer, 2);
    } else if (payloadLength < 65536) {
        frameBuffer = Buffer.alloc(4 + payloadLength);
        frameBuffer[0] = 0x81;
        frameBuffer[1] = 126;
        frameBuffer.writeUInt16BE(payloadLength, 2);
        payloadBuffer.copy(frameBuffer, 4);
    } else {
        // Too big for this simple server
        return;
    }

    socket.write(frameBuffer);
}

// --- 3. Game Logic Integration ---

function broadcast(data) {
    clients.forEach(client => {
        sendFrame(client.socket, data);
    });
}

function handleMessage(client, message) {
    try {
        const data = JSON.parse(message);
        const ws = { send: (msg) => sendFrame(client.socket, JSON.parse(msg)) }; // Mock ws.send expected by logic below

        switch (data.type) {
            case 'LOGIN':
                client.id = game.addPlayer(data.nickname);
                ws.send(JSON.stringify({ 
                    type: 'LOGIN_SUCCESS', 
                    playerId: client.id, 
                    state: game.getState() 
                }));
                broadcast({ type: 'CHAT', from: 'System', text: `${data.nickname} entrou na fazenda!` });
                broadcast({ type: 'UPDATE_PLAYERS', players: game.getPlayers() });
                break;

            case 'PLANT':
                if (!client.id) return;
                const plantResult = game.plant(client.id, data.index, data.cropId);
                if (plantResult.success) {
                    broadcast({ type: 'UPDATE_GAME', state: game.getState() });
                }
                break;

            case 'HARVEST':
                if (!client.id) return;
                const harvestResult = game.harvest(client.id, data.index);
                if (harvestResult.success) {
                    broadcast({ type: 'UPDATE_GAME', state: game.getState() });
                }
                break;
            
            case 'STEAL':
                if (!client.id) return;
                const stealResult = game.steal(client.id, data.targetId, data.index);
                if (stealResult.success) {
                    broadcast({ type: 'UPDATE_GAME', state: game.getState() });
                    broadcast({ type: 'CHAT', from: 'System', text: `${game.getPlayer(client.id).nickname} roubou uma planta de ${game.getPlayer(data.targetId).nickname}!` });
                } else if (stealResult.reason) {
                     ws.send(JSON.stringify({ type: 'ERROR', message: stealResult.reason }));
                }
                break;

            case 'HIRE_WORKER':
                if (!client.id) return;
                const hireResult = game.hireWorker(client.id);
                if (hireResult.success) {
                    broadcast({ type: 'UPDATE_GAME', state: game.getState() });
                    broadcast({ type: 'CHAT', from: 'System', text: `${game.getPlayer(client.id).nickname} contratou um ajudante!` });
                } else {
                    ws.send(JSON.stringify({ type: 'ERROR', message: hireResult.reason }));
                }
                break;

            case 'BUY_ANIMAL':
                if (!client.id) return;
                const buyResult = game.buyAnimal(client.id, data.animalType);
                if (buyResult.success) {
                    broadcast({ type: 'UPDATE_GAME', state: game.getState() });
                } else {
                    ws.send(JSON.stringify({ type: 'ERROR', message: buyResult.reason }));
                }
                break;

            case 'COLLECT_ANIMAL':
                if (!client.id) return;
                const collectResult = game.collectAnimal(client.id, data.animalIndex);
                if (collectResult.success) {
                    broadcast({ type: 'UPDATE_GAME', state: game.getState() });
                } else {
                    ws.send(JSON.stringify({ type: 'ERROR', message: collectResult.reason }));
                }
                break;

            case 'FEED_ANIMAL':
                if (!client.id) return;
                const feedResult = game.feedAnimal(client.id, data.animalIndex);
                if (feedResult.success) {
                    broadcast({ type: 'UPDATE_GAME', state: game.getState() });
                    // Optional: Broadcast feeding sound/action?
                } else {
                    ws.send(JSON.stringify({ type: 'ERROR', message: feedResult.reason }));
                }
                break;

            case 'JOIN_RACE':
                if (!client.id) return;
                const raceResult = game.joinRace(client.id, data.animalIndex);
                if (raceResult.success) {
                    broadcast({ type: 'UPDATE_GAME', state: game.getState() });
                    broadcast({ type: 'CHAT', from: 'System', text: `${game.getPlayer(client.id).nickname} inscreveu um cavalo na corrida!` });
                } else {
                    ws.send(JSON.stringify({ type: 'ERROR', message: raceResult.reason }));
                }
                break;

            case 'CHAT':
                if (!client.id) return;
                broadcast({ type: 'CHAT', from: game.getPlayer(client.id).nickname, text: data.message });
                break;
        }
    } catch (e) {
        console.error('Error processing message:', e);
    }
}

function handleDisconnect(client) {
    clients.delete(client);
    if (client.id) {
        const nickname = game.getPlayer(client.id)?.nickname;
        // Don't remove player state on disconnect, just notify?
        // For persistence, we might want to keep them.
        // But for "online players list", we might want to remove them from list but keep data.
        // Let's keep it simple: Remove from active session but data is saved.
        // Actually, if we remove them, they disappear from the "Visit" list.
        // Let's NOT remove them from game state, just from connection list.
        broadcast({ type: 'UPDATE_GAME', state: game.getState() });
        if (nickname) broadcast({ type: 'CHAT', from: 'System', text: `${nickname} saiu.` });
    }
}

// Game Loop
setInterval(() => {
    const changes = game.tick();
    if (changes) {
        broadcast({ type: 'UPDATE_GAME', state: game.getState() });
    }
}, 1000);

// Inicializa o jogo e garante que o servidor suba mesmo com erro
game.init().finally(() => {
    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
});
