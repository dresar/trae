const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs-extra');
const path = require('path');
const qrcode = require('qrcode-terminal');
const chalk = require('chalk');
const moment = require('moment');
require('dotenv').config();

// Memory optimization for VPS
process.env.NODE_OPTIONS = '--max-old-space-size=512 --optimize-for-size --max-semi-space-size=64';

// Enhanced memory management
const memoryThreshold = 400 * 1024 * 1024; // 400MB threshold
let lastGCTime = Date.now();

// Force garbage collection if available
if (global.gc) {
    setInterval(() => {
        const memUsage = process.memoryUsage();
        const now = Date.now();
        
        // Force GC if memory usage is high or it's been too long
        if (memUsage.heapUsed > memoryThreshold || (now - lastGCTime) > 60000) {
            global.gc();
            lastGCTime = now;
            console.log(`🗑️ GC executed - Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
        }
    }, 15000); // Check every 15 seconds
    
    // Memory monitoring
    setInterval(() => {
        const memUsage = process.memoryUsage();
        if (memUsage.heapUsed > memoryThreshold) {
            console.warn(`⚠️ High memory usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
        }
    }, 30000);
}

// Import modules
const { loadDatabase, saveDatabase } = require('./utils/database');
const { isAdmin, formatCurrency, formatDate, normalizeSenderToPhone } = require('./utils/helpers');
const errorLogger = require('./utils/errorLogger');
const { handleAICommand } = require('./commands/ai');
const { handleUtilsCommand } = require('./commands/utils');
const { handleScheduleCommand } = require('./commands/schedule');
const { handleMediaCommand } = require('./commands/media');
const { handleFinanceCommand } = require('./commands/finance');
const { handleFileCommand } = require('./commands/files');
const { handleGroupCommand } = require('./commands/group');
const { handleAPIKeyCommand } = require('./commands/apikey');
const { handleUserAPIKeyCommand } = require('./commands/userApiKey');
const DriveCommand = require('./commands/drive');
// Tambah: sambutan command
const { handleSambutanCommand } = require('./commands/sambutan');
const GroupManager = require('./utils/groupManager');
const GroupAdminCommands = require('./commands/groupAdmin');
const GroupModerationCommands = require('./commands/groupModeration');
const GroupUtilitiesCommands = require('./commands/groupUtilities');
const GroupEntertainmentCommands = require('./commands/groupEntertainment');
const GroupAnalyticsCommands = require('./commands/groupAnalytics');

// Global variables
let sock;
let qr;
let isConnected = false;
let reconnectCount = 0;
const maxReconnectAttempts = 10; // Increased from 5 to 10
const prefix = process.env.BOT_PREFIX || '.';
const { getAdminNumbers } = require('./utils/helpers');
let adminNumbers = getAdminNumbers();

// Performance monitoring
let performanceStats = {
    messagesProcessed: 0,
    commandsExecuted: 0,
    errorsOccurred: 0,
    startTime: Date.now(),
    lastResetTime: Date.now()
};

// Command execution tracking
let commandStats = {};
let lastStatsLog = Date.now();
const STATS_LOG_INTERVAL = 300000; // 5 minutes

// Enhanced connection monitoring
let connectionHealthCheck;
let lastHeartbeat = Date.now();
let reconnectTimeout;
let isReconnecting = false;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 60000; // 60 seconds

// Helper function to get disconnect reason description (versi asik & humoris)
function getDisconnectReason(statusCode) {
    const reasons = {
        [DisconnectReason.badSession]: '🤪 Sesi lagi bad mood nih, kayak mantan!',
        [DisconnectReason.connectionClosed]: '🚪 Koneksi tutup pintu, ga mau ngobrol lagi',
        [DisconnectReason.connectionLost]: '🔍 Koneksi main petak umpet, hilang entah kemana',
        [DisconnectReason.connectionReplaced]: '💔 Digantiin sama yang lain, sakit hati banget!',
        [DisconnectReason.loggedOut]: '👋 Logout dulu ya, mau istirahat sebentar',
        [DisconnectReason.multideviceMismatch]: '📱 Device-nya pada berantem, ga mau akur',
        [DisconnectReason.forbidden]: '🚫 Dilarang masuk! Kayak masuk warnet tanpa bayar',
        [DisconnectReason.restartRequired]: '🔄 Butuh restart nih, kayak hidup yang perlu refresh',
        [DisconnectReason.timedOut]: '⏰ Kelamaan nunggu, udah timeout kayak nunggu gebetan bales chat',
        [DisconnectReason.unavailableService]: '🛠️ Lagi maintenance, sabar ya bestie!'
    };
    return reasons[statusCode] || `🤷‍♂️ Entahlah, error aneh bin ajaib (${statusCode})`;
}

// Enhanced connection monitoring functions
function startHeartbeatMonitoring() {
    console.log(chalk.blue('💓 Starting heartbeat monitoring...'));
    
    // Clear existing interval if any
    if (connectionHealthCheck) {
        clearInterval(connectionHealthCheck);
    }
    
    connectionHealthCheck = setInterval(() => {
        const now = Date.now();
        const timeSinceLastHeartbeat = now - lastHeartbeat;
        
        if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT && isConnected && !isReconnecting) {
            console.log(chalk.yellow(`💔 Heartbeat timeout detected (${Math.round(timeSinceLastHeartbeat/1000)}s)`));
            console.log(chalk.yellow('🔄 Initiating health check reconnection...'));
            
            // Trigger reconnection
            isConnected = false;
            initiateReconnection('Heartbeat timeout');
        } else if (isConnected) {
            console.log(chalk.green(`💓 Heartbeat OK (${Math.round(timeSinceLastHeartbeat/1000)}s ago)`));
        }
    }, HEARTBEAT_INTERVAL);
}

function stopHeartbeatMonitoring() {
    if (connectionHealthCheck) {
        clearInterval(connectionHealthCheck);
        connectionHealthCheck = null;
        console.log(chalk.yellow('💔 Heartbeat monitoring stopped'));
    }
}

function updateHeartbeat() {
    lastHeartbeat = Date.now();
}

function initiateReconnection(reason = 'Unknown') {
    if (isReconnecting) {
        console.log(chalk.yellow('🔄 Reconnection already in progress, skipping...'));
        return;
    }
    
    if (reconnectCount >= maxReconnectAttempts) {
        console.log(chalk.red(`❌ Maximum reconnect attempts (${maxReconnectAttempts}) reached`));
        console.log(chalk.red('🛑 Stopping reconnection attempts. Manual restart required.'));
        stopHeartbeatMonitoring();
        return;
    }
    
    isReconnecting = true;
    reconnectCount++;
    
    console.log(chalk.yellow(`🔄 Initiating reconnection (${reconnectCount}/${maxReconnectAttempts})...`));
    console.log(chalk.yellow(`📝 Reason: ${reason}`));
    
    // Clean up current connection
    if (sock && sock.ws) {
        try {
            sock.ws.removeAllListeners();
            sock.ws.close();
        } catch (e) {
            console.log(chalk.yellow('⚠️ Error cleaning up connection'));
        }
    }
    
    // Progressive delay with exponential backoff
    const baseDelay = Math.min(3000 * Math.pow(2, reconnectCount - 1), 60000); // Max 60s
    const jitter = Math.random() * 2000; // 0-2s jitter
    const delay = baseDelay + jitter;
    
    console.log(chalk.yellow(`⏱️ Waiting ${Math.round(delay/1000)}s before reconnection...`));
    
    reconnectTimeout = setTimeout(async () => {
        try {
            console.log(chalk.blue(`🔄 Attempting reconnection ${reconnectCount}/${maxReconnectAttempts}...`));
            await connectToWhatsApp();
        } catch (error) {
            console.log(chalk.red('❌ Reconnection attempt failed:'), error.message);
            errorLogger.logError(error, 'Auto-Reconnection Failed');
            isReconnecting = false;
            
            // Try again if we haven't reached max attempts
            if (reconnectCount < maxReconnectAttempts) {
                setTimeout(() => initiateReconnection('Previous attempt failed'), 5000);
            }
        }
    }, delay);
}

function resetReconnectionState() {
    isReconnecting = false;
    reconnectCount = 0;
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
    console.log(chalk.green('✅ Reconnection state reset'));
}

// Performance monitoring functions
function logPerformanceStats() {
    const now = Date.now();
    const uptime = Math.floor((now - performanceStats.startTime) / 1000);
    const sessionTime = Math.floor((now - performanceStats.lastResetTime) / 1000);
    
    console.log(chalk.magenta('📊 === PERFORMANCE STATS ==='));
    console.log(chalk.magenta(`⏱️  Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`));
    console.log(chalk.magenta(`📨 Messages Processed: ${performanceStats.messagesProcessed}`));
    console.log(chalk.magenta(`⚡ Commands Executed: ${performanceStats.commandsExecuted}`));
    console.log(chalk.magenta(`❌ Errors Occurred: ${performanceStats.errorsOccurred}`));
    console.log(chalk.magenta(`📈 Avg Messages/min: ${Math.round((performanceStats.messagesProcessed / sessionTime) * 60)}`));
    
    // Log top 5 most used commands
    const topCommands = Object.entries(commandStats)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);
    
    if (topCommands.length > 0) {
        console.log(chalk.magenta('🏆 Top Commands:'));
        topCommands.forEach(([cmd, count], index) => {
            console.log(chalk.magenta(`   ${index + 1}. ${cmd}: ${count} times`));
        });
    }
    
    console.log(chalk.magenta('========================'));
}

function logDatabaseOperation(operation, database, success = true, error = null) {
    const timestamp = moment().format('HH:mm:ss');
    if (success) {
        console.log(chalk.blue(`💾 [${timestamp}] DB ${operation}: ${database} - Success`));
    } else {
        console.log(chalk.red(`💾 [${timestamp}] DB ${operation}: ${database} - Failed: ${error?.message || 'Unknown error'}`));
        errorLogger.logError(error || new Error(`Database ${operation} failed`), `Database ${operation}`, {
            database,
            operation,
            timestamp
        });
    }
}

function trackCommandExecution(command, success = true, executionTime = 0) {
    performanceStats.commandsExecuted++;
    
    if (!commandStats[command]) {
        commandStats[command] = 0;
    }
    commandStats[command]++;
    
    const timestamp = moment().format('HH:mm:ss');
    if (success) {
        console.log(chalk.green(`⚡ [${timestamp}] Command '${command}' executed successfully (${executionTime}ms)`));
    } else {
        console.log(chalk.red(`⚡ [${timestamp}] Command '${command}' failed (${executionTime}ms)`));
        performanceStats.errorsOccurred++;
    }
    
    // Log stats periodically
    const now = Date.now();
    if (now - lastStatsLog > STATS_LOG_INTERVAL) {
        logPerformanceStats();
        lastStatsLog = now;
    }
}

// Initialize Drive Command
const driveCommand = new DriveCommand();

// Initialize Group Features
const groupManager = new GroupManager();
const groupAdminCommands = new GroupAdminCommands();
const groupModerationCommands = new GroupModerationCommands();
const groupUtilitiesCommands = new GroupUtilitiesCommands();
const groupEntertainmentCommands = new GroupEntertainmentCommands();
const groupAnalyticsCommands = new GroupAnalyticsCommands();

// Database
let financeDB = {};
let usersDB = {};
let groupsDB = {};
let filesDB = {};

// Mobile responsive menu function
async function sendMobileMenu(sock, from) {
    console.log(chalk.green(`🎯 sendMobileMenu called for: ${from}`));
    
    const menuText = `
╭─────────────────────────╮
│    🤖 *BOT KKN MENU*    │
╰─────────────────────────╯

💰 *KEUANGAN*
├ .masuk
├ .keluar
├ .saldo
├ .laporan
├ .kategori
├ .backup
└ .restore

👥 *GRUP ADMIN*
├ .ban - Ban member dari grup
├ .unban - Unban member
├ .mute - Mute member
├ .unmute - Unmute member
├ .warn - Beri peringatan
├ .addmod - Tambah moderator
├ .removemod - Hapus moderator
├ .logs - Lihat log grup
└ .groupinfo - Info grup

🛡️ *GRUP MODERASI*
├ .antispam - Atur anti-spam
├ .wordfilter - Filter kata
├ .linkcontrol - Kontrol link
└ .autodelete - Auto hapus pesan

🔧 *GRUP UTILITAS*
├ .welcome - Atur pesan selamat datang
├ .goodbye - Atur pesan perpisahan
├ .rules - Atur aturan grup
├ .poll - Buat polling
├ .reminder - Buat pengingat
└ .sambutan - Sambut & kenalkan bot (mention semua)

🎮 *GRUP HIBURAN*
├ .trivia - Kuis trivia
├ .wordguess - Tebak kata
├ .joke - Lelucon random
├ .quote - Quote inspiratif
├ .addjoke - Tambah lelucon
├ .addquote - Tambah quote
├ .games - Mulai permainan
├ .stopgame - Hentikan permainan
└ .leaderboard - Papan skor

📊 *GRUP ANALITIK*
├ .stats - Statistik grup
├ .userstats - Statistik user
├ .exportstats - Export statistik
└ .resetstats - Reset statistik

👥 *GRUP LAMA*
├ .tagall
├ .hidetag
├ .add
├ .kick
├ .promote
├ .demote
└ .group

🤖 *AI CHATBOT*
├ .ai
├ .chat
├ .ask
├ .generate
├ .create
├ .analyze
├ .analisis
├ .translate
├ .terjemah
├ .summarize
├ .ringkas
├ .explain
└ .jelaskan

🔑 *API MANAGEMENT*
├ .apikey
├ .setapikey
├ .listapikey
├ .rotateapi
└ .apistats

👤 *USER API*
├ .pilihapi
├ .infoapi
├ .availableapi
└ .resetapi

🌤️ *CUACA*
├ .cuaca
└ .weather

📁 *DRIVE KKN*
├ .drive
├ .upload
├ .download
├ .kknfiles
├ .drivelist
├ .drivesearch
├ .driveinfo
├ .driverename
├ .drivedelete
├ .drivestorage
└ .files

🎨 *MEDIA*
├ .sticker
├ .toimg
├ .removebg
├ .ocr
├ .qr
├ .readqr
├ .ytdl
├ .tiktok
└ .igdl

🔧 *UTILITIES*
├ .ping
├ .uptime
├ .info
├ .stats
├ .news
├ .currency
├ .calculator
├ .password
├ .timezone
├ .shorturl
├ .whois
├ .base64
├ .hash
├ .color
└ .ip

📅 *JADWAL*
├ .schedule
├ .reminder
├ .listschedule
├ .deleteschedule
├ .agenda
├ .meeting
├ .deadline
└ .event

╭─────────────────────────╮
│   ⚡ *BOT KKN v1.0*     │
│   📱 Ketik .menu        │
╰─────────────────────────╯
`;

    try {
        console.log(chalk.blue(`📤 Attempting to send menu to: ${from}`));
        
        // Try to send with local image first
        const imagePath = path.join(__dirname, 'uploads', 'kkn', 'images', 'd83d7ded1654d103d02618277ffdcf41.jpg');
        console.log(chalk.blue(`🖼️ Checking image path: ${imagePath}`));
        
        if (fs.existsSync(imagePath)) {
            console.log(chalk.green(`✅ Image found, sending with image`));
            // Read and compress image for faster loading
            const imageBuffer = await fs.readFile(imagePath);
            await sock.sendMessage(from, {
                image: imageBuffer,
                caption: menuText,
                jpegQuality: 60,
                contextInfo: {
                    externalAdReply: {
                        title: '🤖 BOT_KKNPULO_SAROK2025',
                        body: 'Menu Lengkap Bot KKN Pulo Sarok 2025',
                        mediaType: 1,
                        renderLargerThumbnail: false
                    }
                }
            });
            console.log(chalk.green(`✅ Menu with image sent successfully`));
        } else {
            console.log(chalk.yellow(`⚠️ Image not found, sending text with context`));
            // Fallback to simple text only
            await sock.sendMessage(from, {
                text: menuText,
                contextInfo: {
                    externalAdReply: {
                        title: '🤖 BOT_KKNPULO_SAROK2025',
                        body: 'Menu Lengkap Bot KKN Pulo Sarok 2025',
                        mediaType: 1,
                        renderLargerThumbnail: false
                    }
                }
            });
            console.log(chalk.green(`✅ Menu with context sent successfully`));
        }
    } catch (error) {
        console.error(chalk.red('🚨 Error sending menu:'), error);
        console.log(chalk.yellow(`🔄 Attempting final fallback - simple text`));
        
        // Final fallback to simple text
        try {
            await sock.sendMessage(from, { text: menuText });
            console.log(chalk.green(`✅ Simple menu text sent successfully`));
        } catch (fallbackError) {
            console.error(chalk.red('🚨 Final fallback also failed:'), fallbackError);
            errorLogger.logError(fallbackError, 'Menu Send Fallback Error');
        }
    }
}

// Initialize bot
async function startBot() {
    console.log(chalk.blue('\n=== BOT KKN ==='));
    console.log(chalk.green('🚀 Starting WhatsApp Bot KKN...'));
    
    try {
        // Load databases with logging
        try {
            financeDB = await loadDatabase('finance.json');
            logDatabaseOperation('LOAD', 'finance.json', true);
        } catch (error) {
            logDatabaseOperation('LOAD', 'finance.json', false, error);
            financeDB = { transactions: [], categories: [], settings: {} };
        }
        
        try {
            usersDB = await loadDatabase('users.json');
            logDatabaseOperation('LOAD', 'users.json', true);
        } catch (error) {
            logDatabaseOperation('LOAD', 'users.json', false, error);
            usersDB = { users: {} };
        }
        
        try {
            groupsDB = await loadDatabase('groups.json');
            logDatabaseOperation('LOAD', 'groups.json', true);
        } catch (error) {
            logDatabaseOperation('LOAD', 'groups.json', false, error);
            groupsDB = { groups: {} };
        }
        
        try {
            filesDB = await loadDatabase('files.json');
            logDatabaseOperation('LOAD', 'files.json', true);
        } catch (error) {
            logDatabaseOperation('LOAD', 'files.json', false, error);
            filesDB = { files: {} };
        }
        
        console.log(chalk.green('✅ Databases loaded successfully'));
        console.log(chalk.magenta('📊 Performance monitoring started'));
        
        // Start periodic performance logging
        setInterval(() => {
            logPerformanceStats();
        }, STATS_LOG_INTERVAL);
        
        // Initialize WhatsApp connection
        await connectToWhatsApp();
        
    } catch (error) {
        console.error(chalk.red('❌ Error starting bot:'), error);
        errorLogger.logError(error, 'Bot Startup');
        performanceStats.errorsOccurred++;
        process.exit(1);
    }
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    console.log(chalk.yellow(`Using WA v${version.join('.')}, isLatest: ${isLatest}`));
    
    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: {
            level: 'silent',
            child: () => ({
                level: 'silent',
                trace: () => {},
                debug: () => {},
                info: () => {},
                warn: () => {},
                error: () => {},
                fatal: () => {}
            }),
            trace: () => {},
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            fatal: () => {}
        },
        browser: ['Bot KKN', 'Chrome', '1.0.0'],
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        defaultQueryTimeoutMs: 30000,
        keepAliveIntervalMs: 25000,
        emitOwnEvents: false,
        fireInitQueries: false,
        shouldSyncHistoryMessage: false,
        connectTimeoutMs: 60000,
        qrTimeout: 45000,
        retryRequestDelayMs: 500,
        maxMsgRetryCount: 2,
        shouldIgnoreJid: jid => jid.includes('broadcast'),
        getMessage: async (key) => {
            return { conversation: '' };
        },
        // Enhanced connection stability
        transactionOpts: {
            maxCommitRetries: 5,
            delayBetweenTriesMs: 3000
        },
        // Better error handling
        options: {
            logger: {
                level: 'silent',
                child: () => ({
                    level: 'silent',
                    trace: () => {},
                    debug: () => {},
                    info: () => {},
                    warn: () => {},
                    error: () => {},
                    fatal: () => {}
                }),
                trace: () => {},
                debug: () => {},
                info: () => {},
                warn: () => {},
                error: () => {},
                fatal: () => {}
            }
        }
    });
    
    // Enhanced error handling for WebSocket
    sock.ws.on('CB:call', () => {});
    sock.ws.on('CB:chatstate', () => {});
    
    // Handle WebSocket errors to prevent crashes
    sock.ws.on('error', (error) => {
        console.log(chalk.red('🚨 WebSocket Error:'), error.message);
        errorLogger.logError(error, 'WebSocket Error');
        performanceStats.errorsOccurred++;
    });
    
    // Handle connection errors
    sock.ws.on('close', (code, reason) => {
        console.log(chalk.yellow(`🔌 WebSocket closed: ${code} - ${reason}`));
        if (code !== 1000) { // Not a normal closure
            errorLogger.logError(new Error(`WebSocket closed abnormally: ${code} - ${reason}`), 'WebSocket Close');
            performanceStats.errorsOccurred++;
        }
    });
    
    // Suppress all session-related logs
    const originalConsoleLog = console.log;
    console.log = (...args) => {
        const message = args.join(' ');
        // Filter out session, prekey, and buffer logs
        if (message.includes('Closing stale open session') ||
            message.includes('Closing session:') ||
            message.includes('SessionEntry') ||
            message.includes('pendingPreKey') ||
            message.includes('Buffer') ||
            message.includes('chainKey') ||
            message.includes('ephemeralKeyPair') ||
            message.includes('baseKey')) {
            // Log to file instead of console
            errorLogger.logSession(message, 'session');
            return;
        }
        // Allow other logs
        originalConsoleLog.apply(console, args);
    };
    
    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr: newQr } = update;
        
        if (newQr) {
            qr = newQr;
            console.log(chalk.yellow('📱 Scan QR Code below:'));
            qrcode.generate(newQr, { small: true });
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            // Enhanced logging for disconnect reasons
            console.log(chalk.red(`🔌 Connection closed. Status code: ${statusCode}`));
            console.log(chalk.red(`🔍 Disconnect reason: ${getDisconnectReason(statusCode)}`));
            console.log(chalk.cyan(`📊 Performance Stats - Messages: ${performanceStats.messagesProcessed}, Commands: ${performanceStats.commandsExecuted}, Errors: ${performanceStats.errorsOccurred}`));
            
            // Stop heartbeat monitoring on disconnect
            stopHeartbeatMonitoring();
            
            // Log error to file instead of console spam
            if (lastDisconnect?.error) {
                errorLogger.logError(lastDisconnect.error, 'WhatsApp Connection');
                console.log(chalk.red(`❌ Error details: ${lastDisconnect.error.message || 'Unknown error'}`));
            }
            
            if (shouldReconnect) {
                // Enhanced reconnect logic with Stream Error handling
                const shouldReconnectForStatus = (
                    statusCode === DisconnectReason.connectionClosed ||
                    statusCode === DisconnectReason.connectionLost ||
                    statusCode === DisconnectReason.restartRequired ||
                    statusCode === DisconnectReason.timedOut ||
                    (lastDisconnect?.error?.message && lastDisconnect.error.message.includes('Stream Errored'))
                );
                
                if (shouldReconnectForStatus) {
                    // Use the new enhanced reconnection system
                    const reason = `Connection closed: ${getDisconnectReason(statusCode)}`;
                    initiateReconnection(reason);
                } else {
                    console.log(chalk.red(`❌ Not reconnecting due to status code: ${statusCode}`));
                    console.log(chalk.red(`❌ Error message: ${lastDisconnect?.error?.message || 'Unknown'}`));
                }
            } else {
                console.log(chalk.red('❌ Bot logged out. Manual restart required.'));
            }
            isConnected = false;
        } else if (connection === 'connecting') {
            console.log(chalk.yellow('🔄 Connecting to WhatsApp...'));
            updateHeartbeat(); // Update heartbeat during connection
        } else if (connection === 'open') {
            console.log(chalk.green('✅ Connected to WhatsApp successfully!'));
            console.log(chalk.cyan(`📊 Connection Stats - Reconnect attempts: ${reconnectCount}, Uptime: ${Math.floor((Date.now() - performanceStats.startTime) / 1000)}s`));
            isConnected = true;
            
            // Reset reconnection state and start monitoring
            resetReconnectionState();
            updateHeartbeat();
            startHeartbeatMonitoring();
            
            // Send startup message to admins
            for (const admin of adminNumbers) {
                try {
                    await sock.sendMessage(admin + '@s.whatsapp.net', {
                        text: `🤖 *Bot KKN Online!*\n\n⏰ ${moment().format('DD/MM/YYYY HH:mm:ss')}\n🔋 Status: Ready\n📊 Database: Loaded\n💓 Heartbeat: Active\n\n_Bot siap digunakan!_`
                    });
                } catch (error) {
                    console.log(chalk.yellow(`⚠️ Could not send startup message to ${admin}`));
                }
            }
        }
    });
    
    // Save credentials
    sock.ev.on('creds.update', saveCreds);
    
    // Handle incoming messages
    const processedMessages = new Set();
    
    sock.ev.on('messages.upsert', async (m) => {
        try {
            // Update heartbeat on message activity
            updateHeartbeat();
            
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;
            
            // Track message processing
            performanceStats.messagesProcessed++;
            
            // Create unique message ID to prevent duplicate processing
            const messageId = `${msg.key.remoteJid}-${msg.key.id}-${msg.key.participant || msg.key.remoteJid}`;
            
            if (processedMessages.has(messageId)) {
                console.log(`⚠️ Duplicate message detected, skipping: ${messageId}`);
                return;
            }
            
            processedMessages.add(messageId);
            
            // Clean up old message IDs (keep only last 100)
            if (processedMessages.size > 100) {
                const oldIds = Array.from(processedMessages).slice(0, 50);
                oldIds.forEach(id => processedMessages.delete(id));
            }
            
            // Enhanced logging for debugging
            const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
            if (messageText.startsWith('.')) {
                console.log(chalk.blue(`📨 Command received: ${messageText.split(' ')[0]} from ${msg.key.remoteJid}`));
            }
            
            await handleMessage(msg);
        } catch (error) {
            console.error(chalk.red('🚨 Error handling message:'), error);
            performanceStats.errorsOccurred++;
            errorLogger.logError(error, 'Message Handler Error', {
                messageId: `${m.messages[0]?.key?.remoteJid}-${m.messages[0]?.key?.id}`,
                errorStack: error.stack
            });
            
            // Try to send error message to user if possible
            try {
                if (sock && m.messages[0]?.key?.remoteJid) {
                    await sock.sendMessage(m.messages[0].key.remoteJid, {
                        text: '❌ *Terjadi kesalahan saat memproses pesan*\n\nSilakan coba lagi dalam beberapa saat.'
                    });
                }
            } catch (sendError) {
                console.error(chalk.red('Failed to send error message to user:'), sendError.message);
            }
        }
    });
    
    // Handle group updates
    sock.ev.on('groups.update', async (updates) => {
        for (const update of updates) {
            try {
                if (update.id && !groupsDB.groups[update.id]) {
                    groupsDB.groups[update.id] = {
                        id: update.id,
                        name: update.subject || 'Unknown',
                        joinedAt: new Date().toISOString(),
                        settings: {
                            financeEnabled: true,
                            aiEnabled: true,
                            welcomeMessage: true
                        },
                        stats: {
                            messageCount: 0,
                            commandCount: 0
                        }
                    };
                    await saveDatabase('groups.json', groupsDB);
                }
                
                // Initialize group in advanced database
                groupManager.initializeGroup(update.id, update.subject || 'Unknown');
            } catch (error) {
                console.error(chalk.red('🚨 Error handling group update:'), error);
                performanceStats.errorsOccurred++;
                errorLogger.logError(error, 'Group Update Error', {
                    groupId: update.id,
                    groupName: update.subject
                });
            }
        }
    });
    
    // Handle group participants update (join/leave)
    sock.ev.on('group-participants.update', async (update) => {
        try {
            const { id: groupId, participants, action } = update;
            
            for (const participant of participants) {
                if (action === 'add') {
                    // Handle welcome message
                    await groupUtilitiesCommands.handleWelcomeMessage(sock, groupId, participant);
                } else if (action === 'remove') {
                    // Handle goodbye message
                    await groupUtilitiesCommands.handleGoodbyeMessage(sock, groupId, participant);
                }
            }
        } catch (error) {
            console.error(chalk.red('🚨 Error handling group participants update:'), error);
            performanceStats.errorsOccurred++;
            errorLogger.logError(error, 'Group Participants Update Error', {
                groupId: update.id,
                participants: update.participants,
                action: update.action
            });
        }
    });
}

// Handle incoming messages
async function handleMessage(msg) {
    const messageType = Object.keys(msg.message)[0];
    const messageContent = msg.message[messageType];
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    const isGroup = from.endsWith('@g.us');
    const senderNumber = normalizeSenderToPhone(sender);
    const senderIsAdmin = isAdmin(senderNumber, adminNumbers);
    
    // Enhanced structured logging
    const logContext = {
        timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
        messageId: msg.key.id,
        from: from,
        sender: senderNumber,
        isGroup: isGroup,
        isAdmin: senderIsAdmin,
        messageType: messageType
    };
    
    console.log(chalk.blue(`📨 [${logContext.timestamp}] Message received:`));
    console.log(chalk.blue(`   📍 From: ${isGroup ? 'Group' : 'Private'} (${from})`));
    console.log(chalk.blue(`   👤 Sender: ${senderNumber} ${senderIsAdmin ? '(Admin)' : ''}`));
    console.log(chalk.blue(`   📝 Type: ${logContext.messageType}`));
    console.log(chalk.blue(`   🆔 ID: ${msg.key.id}`));
    console.log(chalk.blue(`   🔑 Admin Check: ${adminNumbers.includes(senderNumber)}`));
    console.log(chalk.blue(`   👥 Admin Numbers: ${JSON.stringify(adminNumbers)}`));
    
    // Reload admin settings periodically in case JSON changes
    if (Math.random() < 0.01) { // ~1% messages refresh
        try { 
            adminNumbers = getAdminNumbers();
            console.log(chalk.blue(`🔄 Admin numbers reloaded: ${JSON.stringify(adminNumbers)}`));
        } catch (error) {
            console.log(chalk.yellow(`⚠️ Failed to reload admin numbers: ${error.message}`));
        }
    }
    
    // Minimal message details logging
    // console.log(`🔍 Message from: ${senderNumber} | Type: ${messageType}`);
    
    let body = '';
    
    // Track message analytics for groups
    if (isGroup) {
        groupAnalyticsCommands.trackMessage(from, senderNumber);
    }
    
    // Extract message text
    if (messageType === 'conversation') {
        body = messageContent;
    } else if (messageType === 'extendedTextMessage') {
        body = messageContent.text;
    } else if (messageType === 'imageMessage' && messageContent.caption) {
        body = messageContent.caption;
    } else if (messageType === 'videoMessage' && messageContent.caption) {
        body = messageContent.caption;
    }
    
    // Apply automatic moderation for groups
    if (isGroup && body) {
        const moderationResult = await groupModerationCommands.checkMessage(from, senderNumber, body, sock);
        if (moderationResult.shouldDelete) {
            // Delete the message if moderation rules are violated
            try {
                await sock.sendMessage(from, { delete: msg.key });
            } catch (error) {
                console.log('Failed to delete message:', error.message);
            }
            return;
        }
    }
    
    if (!body) {
        console.log(`❌ Message body is empty`);
        return;
    }
    
    // Enhanced command parsing
    let command = '';
    let args = [];
    
    if (body.startsWith(prefix)) {
        // Standard prefix command (e.g., .menu)
        const commandParts = body.slice(prefix.length).trim().split(/ +/);
        command = commandParts.shift().toLowerCase();
        args = commandParts;
    } else if (body.toLowerCase().startsWith('menu') || body.toLowerCase().startsWith('help')) {
        // Allow 'menu' or 'help' without prefix
        command = 'menu';
        args = [];
    } else {
        console.log(`❌ Message doesn't start with prefix '${prefix}' or recognized command. Body: '${body}'`);
        return;
    }
    
    // Ensure command is not empty
    if (!command) {
        console.log(`❌ Command is empty after parsing. Original body: '${body}'`);
        return;
    }
    
    // Enhanced command logging
    console.log(chalk.cyan(`📝 Command: '${command}' | From: ${senderNumber} | Group: ${isGroup ? 'Yes' : 'No'}`));
    console.log(chalk.cyan(`🔍 Original message: '${body}'`));
    console.log(chalk.cyan(`🔍 Parsed args: ${JSON.stringify(args)}`));
    
    // Special logging for menu command
    if (command === 'menu' || command === '.menu' || command === 'help') {
        console.log(chalk.green(`🎯 Menu command detected! Processing...`));
    }
    
    // Update user database
    if (!usersDB.users[senderNumber]) {
        usersDB.users[senderNumber] = {
            id: senderNumber,
            name: msg.pushName || 'Unknown',
            joinedAt: new Date().toISOString(),
            commandCount: 0,
            lastSeen: new Date().toISOString(),
            isAdmin: senderIsAdmin
        };
    }
    
    usersDB.users[senderNumber].commandCount++;
    usersDB.users[senderNumber].lastSeen = new Date().toISOString();
    await saveDatabase('users.json', usersDB);
    
    // Track command analytics for groups
    if (isGroup) {
        groupAnalyticsCommands.trackCommand(from, senderNumber, command);
    }
    
    // Command routing
    console.log(`🔍 Processing command: ${command}`);
    const commandStartTime = Date.now();
    let commandSuccess = true;
    
    try {
        switch (command) {
            // Finance commands (Admin only)
            case 'masuk':
            case 'keluar':
            case 'saldo':
            case 'laporan':
            case 'kategori':
            case 'backup':
            case 'restore':
                console.log(`🔍 DEBUG Finance Command:`);
                console.log(`  - Command: ${command}`);
                console.log(`  - Sender Number: ${senderNumber}`);
                console.log(`  - Admin Numbers: ${JSON.stringify(adminNumbers)}`);
                console.log(`  - Is Admin: ${isAdmin(senderNumber, adminNumbers)}`);
                
                if (!isAdmin(senderNumber, adminNumbers)) {
                    console.log(`❌ Access denied for finance command: ${command}`);
                    await sock.sendMessage(from, {
                        text: '❌ *Akses Ditolak*\n\nHanya admin yang dapat menggunakan fitur keuangan.'
                    });
                    return;
                }
                
                console.log(`✅ Admin access granted for finance command: ${command}`);
                await handleFinanceCommand(sock, msg, command, args, financeDB);
                break;
                
            // Group commands (legacy)
            case 'tagall':
            case 'hidetag':
            case 'add':
            case 'kick':
            case 'promote':
            case 'demote':
            case 'group':
                await handleGroupCommand(sock, msg, command, args, groupsDB);
                break;
                
            // Sambutan command (Admin only, group only)
            case 'sambutan':
                if (!isGroup) {
                    await sock.sendMessage(from, { text: '❌ Perintah ini hanya dapat digunakan di grup.' });
                    break;
                }
                await handleSambutanCommand(sock, msg, 'sambutan', args, groupsDB);
                break;
            
            // Group Admin commands
            case 'ban':
            case 'unban':
            case 'mute':
            case 'unmute':
            case 'warn':
            case 'addmod':
            case 'removemod':
            case 'logs':
            case 'groupinfo':
                if (!isGroup) {
                    await sock.sendMessage(from, { text: '❌ Perintah ini hanya dapat digunakan di grup.' });
                    return;
                }
                switch (command) {
                    case 'ban':
                        await groupAdminCommands.handleBan(sock, msg, args);
                        break;
                    case 'unban':
                        await groupAdminCommands.handleUnban(sock, msg, args);
                        break;
                    case 'mute':
                        await groupAdminCommands.handleMute(sock, msg, args);
                        break;
                    case 'unmute':
                        await groupAdminCommands.handleUnmute(sock, msg, args);
                        break;
                    case 'warn':
                        await groupAdminCommands.handleWarn(sock, msg, args);
                        break;
                    case 'addmod':
                        await groupAdminCommands.handleAddModerator(sock, msg, args);
                        break;
                    case 'removemod':
                        await groupAdminCommands.handleRemoveModerator(sock, msg, args);
                        break;
                    case 'logs':
                        await groupAdminCommands.handleLogs(sock, msg, args);
                        break;
                    case 'groupinfo':
                        await groupAdminCommands.handleGroupInfo(sock, msg);
                        break;
                }
                break;
                
            // Group Moderation commands
            case 'antispam':
            case 'wordfilter':
            case 'linkcontrol':
            case 'autodelete':
                if (!isGroup) {
                    await sock.sendMessage(from, { text: '❌ Perintah ini hanya dapat digunakan di grup.' });
                    return;
                }
                switch (command) {
                    case 'antispam':
                        await groupModerationCommands.handleAntiSpam(sock, msg, args);
                        break;
                    case 'wordfilter':
                        await groupModerationCommands.handleWordFilter(sock, msg, args);
                        break;
                    case 'linkcontrol':
                        await groupModerationCommands.handleLinkControl(sock, msg, args);
                        break;
                    case 'autodelete':
                        await groupModerationCommands.handleAutoDelete(sock, msg, args);
                        break;
                }
                break;
                
            // Group Utilities commands
            case 'welcome':
            case 'goodbye':
            case 'rules':
            case 'poll':
            case 'reminder':
                if (!isGroup) {
                    await sock.sendMessage(from, { text: '❌ Perintah ini hanya dapat digunakan di grup.' });
                    return;
                }
                switch (command) {
                    case 'welcome':
                        try { console.log('[DEBUG] Routing welcome command', { from, isGroup, args }); } catch {}
                        await groupUtilitiesCommands.handleWelcome(sock, msg, args);
                        break;
                    case 'goodbye':
                        await groupUtilitiesCommands.handleGoodbye(sock, msg, args);
                        break;
                    case 'rules':
                        await groupUtilitiesCommands.handleRules(sock, msg, args);
                        break;
                    case 'poll':
                        await groupUtilitiesCommands.handlePoll(sock, msg, args);
                        break;
                    case 'reminder':
                        await groupUtilitiesCommands.handleReminder(sock, msg, args);
                        break;
                }
                break;
                
            // Group Entertainment commands
            case 'trivia':
            case 'wordguess':
            case 'joke':
            case 'quote':
            case 'addjoke':
            case 'addquote':
            case 'games':
            case 'stopgame':
            case 'leaderboard':
                if (!isGroup) {
                    await sock.sendMessage(from, { text: '❌ Perintah ini hanya dapat digunakan di grup.' });
                    return;
                }
                switch (command) {
                    case 'trivia':
                        await groupEntertainmentCommands.handleTrivia(sock, msg, args);
                        break;
                    case 'wordguess':
                        await groupEntertainmentCommands.handleWordGuess(sock, msg, args);
                        break;
                    case 'joke':
                        await groupEntertainmentCommands.handleJoke(sock, msg);
                        break;
                    case 'quote':
                        await groupEntertainmentCommands.handleQuote(sock, msg);
                        break;
                    case 'addjoke':
                        await groupEntertainmentCommands.handleAddJoke(sock, msg, args);
                        break;
                    case 'addquote':
                        await groupEntertainmentCommands.handleAddQuote(sock, msg, args);
                        break;
                    case 'games':
                        await groupEntertainmentCommands.handleConfigGames(sock, msg, args);
                        break;
                    case 'stopgame':
                        await groupEntertainmentCommands.handleStopGame(sock, msg);
                        break;
                    case 'leaderboard':
                        await groupEntertainmentCommands.handleLeaderboard(sock, msg, args);
                        break;
                }
                break;
                
            // Group Analytics commands
            case 'stats':
            case 'userstats':
            case 'exportstats':
            case 'resetstats':
                if (!isGroup) {
                    await sock.sendMessage(from, { text: '❌ Perintah ini hanya dapat digunakan di grup.' });
                    return;
                }
                switch (command) {
                    case 'stats':
                        await groupAnalyticsCommands.handleStats(sock, msg, args);
                        break;
                    case 'userstats':
                        await groupAnalyticsCommands.handleUserStats(sock, msg, args);
                        break;
                    case 'exportstats':
                        await groupAnalyticsCommands.handleExportStats(sock, msg);
                        break;
                    case 'resetstats':
                        await groupAnalyticsCommands.handleResetStats(sock, msg);
                        break;
                }
                break;
                
            // AI commands
            case 'ai':
            case 'chat':
            case 'ask':
            case 'generate':
            case 'create':
            case 'analyze':
            case 'analisis':
            case 'translate':
            case 'terjemah':
            case 'summarize':
            case 'ringkas':
            case 'explain':
            case 'jelaskan':
                await handleAICommand(sock, msg, command, args);
                break;
                
            // Weather commands
            case 'cuaca':
            case 'weather':
                await handleWeatherCommand(sock, msg, command, args);
                break;
                
            // Google Drive commands
            case 'drive':
            case 'upload':
            case 'download':
            case 'kknfiles':
            case 'listkkn':
            case 'drivelist':
            case 'drivesearch':
            case 'driveinfo':
            case 'driverename':
            case 'drivedelete':
            case 'drivestorage':
                const driveHandled = await driveCommand.handleDriveCommand(sock, msg);
                if (!driveHandled) {
                    // Fallback to old file command if not handled by drive
                    await handleFileCommand(sock, msg, command, args, filesDB);
                }
                break;
                
            // File manager commands (legacy)
            case 'files':
                await handleFileCommand(sock, msg, command, args, filesDB);
                break;
                
            // Media commands
            case 'sticker':
            case 's':
            case 'toimg':
            case 'toimage':
            case 'removebg':
            case 'nobg':
            case 'ocr':
            case 'readtext':
            case 'qr':
            case 'qrcode':
            case 'readqr':
            case 'scanqr':
            case 'ytdl':
            case 'youtube':
            case 'yt':
            case 'igdl':
            case 'instagram':
            case 'ig':
            case 'tiktok':
            case 'tt':
                await handleMediaCommand(sock, msg, command, args);
                break;
                
            // Menu command (mobile responsive)
            case '.menu':
            case 'menu':
            case 'help':
                await sendMobileMenu(sock, from);
                break;
                
            // Utility commands
            case 'ping':
            case 'uptime':
            case 'info':
            case 'stats':
            case 'news':
            case 'berita':
            case 'translate':
            case 'tr':
            case 'currency':
            case 'kurs':
            case 'calculator':
            case 'calc':
            case 'password':
            case 'pass':
            case 'timezone':
            case 'time':
            case 'shorturl':
            case 'short':
            case 'whois':
            case 'domain':
            case 'base64':
            case 'hash':
            case 'color':
            case 'warna':
            case 'ip':
            case 'ipinfo':
                await handleUtilsCommand(sock, msg, command, args, { financeDB, usersDB, groupsDB, filesDB });
                break;
                
            // Schedule commands
            case 'schedule':
            case 'reminder':
            case 'jadwal':
            case 'listschedule':
            case 'listjadwal':
            case 'deleteschedule':
            case 'hapusjadwal':
            case 'agenda':
            case 'meeting':
            case 'rapat':
            case 'deadline':
            case 'event':
            case 'acara':
                await handleScheduleCommand(sock, msg, command, args);
                break;
                
            // API Key Management commands (Admin only)
            case 'apikey':
            case 'apikeyinfo':
            case 'setapikey':
            case 'listapikey':
            case 'listapi':
            case 'rotateapi':
            case 'rotateapikey':
            case 'apistats':
            case 'apikeystats':
                await handleAPIKeyCommand(sock, msg, command, args, senderNumber, from);
                break;
                
            // User API Key Selection commands (All users)
            case 'pilihapi':
            case 'selectapi':
            case 'infoapi':
            case 'myapi':
            case 'resetapi':
            case 'availableapi':
                await handleUserAPIKeyCommand(sock, msg, senderNumber, command, args);
                break;
                
            case 'logs':
            case 'errorlog':
            case 'errors':
                console.log(`🔍 DEBUG Error Log Command:`);
                console.log(`  - Command: ${command}`);
                console.log(`  - Sender Number: ${senderNumber}`);
                console.log(`  - Admin Numbers: ${JSON.stringify(adminNumbers)}`);
                console.log(`  - Is Admin: ${isAdmin(senderNumber, adminNumbers)}`);
                
                if (isAdmin(senderNumber, adminNumbers)) {
                    console.log(`✅ Admin access granted for error log command`);
                    const recentErrors = errorLogger.getRecentErrors(20);
                    await sock.sendMessage(from, {
                        text: `📋 *Recent Error Log*\n\n\`\`\`\n${recentErrors}\n\`\`\`\n\n📝 Full logs available in: /logs/error.log`
                    });
                } else {
                    console.log(`❌ Access denied for error log command`);
                    await sock.sendMessage(from, {
                        text: '❌ *Akses Ditolak*\n\nHanya admin bot yang dapat melihat error log.'
                    });
                }
                break;
                
            default:
                await sock.sendMessage(from, {
                    text: `❓ *Command tidak ditemukan*\n\nGunakan *.help* untuk melihat daftar command yang tersedia.`
                });
                commandSuccess = false;
        }
        
        // Track command execution
        const executionTime = Date.now() - commandStartTime;
        trackCommandExecution(command, commandSuccess, executionTime);
        
    } catch (error) {
        commandSuccess = false;
        const executionTime = Date.now() - commandStartTime;
        trackCommandExecution(command, commandSuccess, executionTime);
        console.error(chalk.red('🚨 Error handling message:'), error);
        console.log(chalk.red(`🔍 DEBUG Error Details:`));
        console.log(chalk.red(`  - Command: ${command || 'unknown'}`));
        console.log(chalk.red(`  - Sender: ${senderNumber || 'unknown'}`));
        console.log(chalk.red(`  - Group: ${isGroup ? 'Yes' : 'No'}`));
        console.log(chalk.red(`  - Error: ${error.message}`));
        console.log(chalk.red(`  - Stack: ${error.stack}`));
        
        errorLogger.logError(error, 'HandleMessage Error', {
            command: command || 'unknown',
            senderNumber: senderNumber || 'unknown',
            isGroup: isGroup || false,
            messageText: body || 'unknown',
            timestamp: new Date().toISOString(),
            errorStack: error.stack
        });
        
        // Enhanced error response
        try {
            await sock.sendMessage(from, {
                text: `❌ *Terjadi kesalahan saat memproses command*\n\n🔧 Command: ${command || 'unknown'}\n⏰ Waktu: ${moment().format('HH:mm:ss')}\n\n_Silakan coba lagi atau hubungi admin jika masalah berlanjut._`
            });
        } catch (sendError) {
            console.error(chalk.red('Failed to send error response:'), sendError.message);
        }
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n🔄 Shutting down bot...'));
    
    // Save all databases
    await saveDatabase('finance.json', financeDB);
    await saveDatabase('users.json', usersDB);
    await saveDatabase('groups.json', groupsDB);
    await saveDatabase('files.json', filesDB);
    
    console.log(chalk.green('✅ Bot shutdown complete'));
    process.exit(0);
});

// Start the bot
startBot();

// Export for testing
module.exports = { sock, startBot };