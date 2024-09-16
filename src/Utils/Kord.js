console.log('🐾 Starting...');

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, makeInMemoryStore, delay } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require('pino');
const path = require('path');
const useMongoDBAuthState = require("../Plugin/kordMongoAuth");
const { MongoClient } = require("mongodb");
const fs = require('fs');
const { setupAntidelete } = require('../Plugin/Antidelete');

// Import figlet for ASCII art
const figlet = require('figlet');

// Small Fix For Waiting for Message
const NodeCache = require('node-cache');
const msgRetryCounterCache = new NodeCache();

// Set up logging
// Enhanced logging
const logger = pino({
    level: process.env.LOG_LEVEL || 'silent',
});

// Plugins
const { kordMsg } = require('../Plugin/kordMsg');
const { initializeKordEvents } = require('../Plugin/kordEvent');
const { loadCommands } = require('../Plugin/kordLoadCmd');
const { againstEventManager } = require('../Plugin/kordEventHandle');

(async () => {
    await loadCommands(path.join(__dirname, '../Commands'));
})();

let messagesSent = 0;

async function getAuthState() {
    try {
        // Use multi-file auth state directly, pointing to the Session directory
        console.log('\x1b[33m%s\x1b[0m', 'Using multi-file auth state.');
        return await useMultiFileAuthState(path.join('./src/Session'));
    } catch (err) {
        console.error('\x1b[31m%s\x1b[0m', 'Error in getAuthState:', err);
    }
}

async function kordAi(io, app) {
    try {
        const chalk = (await import('chalk')).default;

        // Endpoint to fetch statistics
        app.get('/messagestotal', (req, res) => {
            res.json({
                messageTotal: messagesSent,
            });
        });
        const pairingOption = 'Whatsapp Pairing Code';

        // In-memory store for caching
        const store = makeInMemoryStore({ logger });

        const { state, saveCreds } = await getAuthState();

        // fetch latest version of WA Web
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(chalk.cyanBright(`using WA v${version.join('.')}, isLatest: ${isLatest}`));

        const sock = await makeWASocket({
            version: [2, 3000, 1014080102],
            printQRInTerminal: !pairingOption === 'Whatsapp Pairing Code',
            mobile: false,
            keepAliveIntervalMs: 10000,
            downloadHistory: false,
            msgRetryCounterCache,
            syncFullHistory: true,
            markOnlineOnConnect: true,
            defaultQueryTimeoutMs: undefined,
            logger,
            Browsers: ['KORD-AI', 'Chrome', '113.0.5672.126'],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            linkPreviewImageThumbnailWidth: 1980,
            generateHighQualityLinkPreview: true,
        });

        store.bind(sock.ev);
        await againstEventManager.init(sock);
        initializeKordEvents(sock, chalk);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log(qr);
            }

            if (connection === "open") {
                try {
                    console.log(chalk.cyan('Checking Connection....'));
                    console.log(chalk.cyan('Making Socket....'));
                    console.log(chalk.cyan('Calling Socket...'));
                    console.log(chalk.cyan('Connected! 🔒✅'));

                    // Display the figlet ASCII art when connected
                    figlet('Kord-AI', (err, data) => {
                        if (err) {
                            console.error('Error generating ASCII art:', err);
                            return;
                        }
                        console.log(chalk.green(data)); // Display the ASCII art in green color
                    });

                    setupAntidelete(sock);
                    kordMsg(sock);

                    return new Promise((resolve, reject) => {
                        setTimeout(async () => {
                            try {
                                console.log(chalk.yellow('Restarting socket...'));
                                await sock.end({ reason: 'Clearing store' });
                            } catch (error) {
                                console.error(chalk.red('Error restarting socket:'), error.message);
                            } finally {
                                kordAi(io, app);
                            }
                        }, 300 * 60 * 1000); // 300 minutes
                    });
                } catch (err) {
                    console.log('Error in:', err);
                }
            }
            
            // Handle other connection updates...
        });
    } catch (err) {
        console.log('Error in kordAi:', err);
    }
}

module.exports = { kordAi };
