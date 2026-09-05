const apiKeyManager = require('../utils/apiKeyManager');

/**
 * Handle API Key management commands
 * @param {Object} sock - WhatsApp socket
 * @param {Object} message - Message object
 * @param {string} command - Command string
 * @param {string} args - Command arguments
 * @param {string} senderNumber - Sender's number
 * @param {string} groupId - Group ID
 */
async function handleAPIKeyCommand(sock, message, command, args, senderNumber, groupId) {
    const isAdmin = await checkAdminStatus(senderNumber, groupId);
    
    if (!isAdmin) {
        await sock.sendMessage(message.key.remoteJid, {
            text: '❌ *Akses Ditolak*\n\nHanya admin yang dapat mengelola API keys.'
        });
        return;
    }

    switch (command) {
        case 'apikey':
        case 'apikeyinfo':
            await handleAPIKeyInfo(sock, message);
            break;
        case 'setapikey':
            await handleSetAPIKey(sock, message, args);
            break;
        case 'listapikey':
        case 'listapi':
            await handleListAPIKeys(sock, message, args);
            break;
        case 'rotateapi':
        case 'rotateapikey':
            await handleRotateAPIKey(sock, message, args);
            break;
        case 'apistats':
        case 'apikeystats':
            await handleAPIKeyStats(sock, message);
            break;
        default:
            await handleAPIKeyHelp(sock, message);
    }
}

/**
 * Show API Key information
 */
async function handleAPIKeyInfo(sock, message) {
    try {
        const stats = apiKeyManager.getAPIKeyStats();
        
        let response = '🔑 *Informasi API Keys*\n\n';
        
        Object.entries(stats).forEach(([provider, stat]) => {
            const providerName = {
                'gemini': 'Gemini',
                'groq': 'Groq',
                'ipapi': 'IP API',
                'ipinfo': 'IP Info',
                'ipgeolocation': 'IP Geolocation',
                'abuseipdb': 'AbuseIPDB',
                'whoisapi': 'Whois API'
            }[provider];
            
            response += `📊 *${providerName}*\n`;
            response += `   • API Key Aktif: #${stat.active}\n`;
            response += `   • Terkonfigurasi: ${stat.configured}/${stat.total}\n`;
            response += `   • Tersedia: ${stat.available}\n\n`;
        });
        
        response += '💡 *Perintah Tersedia:*\n';
        response += '• `!setapikey <provider> <nomor>` - Ubah API key\n';
        response += '• `!listapikey <provider>` - Lihat semua API key\n';
        response += '• `!rotateapi <provider>` - Rotate ke key berikutnya\n';
        response += '• `!apistats` - Lihat statistik lengkap\n\n';
        response += '*Provider AI:* gemini, groq\n';
        response += '*Provider IP:* ipapi, ipinfo, ipgeolocation, abuseipdb\n';
        response += '*Provider Whois:* whoisapi';
        
        await sock.sendMessage(message.key.remoteJid, { text: response });
    } catch (error) {
        console.error('Error in handleAPIKeyInfo:', error);
        await sock.sendMessage(message.key.remoteJid, {
            text: '❌ Terjadi kesalahan saat mengambil informasi API key.'
        });
    }
}

/**
 * Set active API key
 */
async function handleSetAPIKey(sock, message, args) {
    try {
        const parts = args.trim().split(' ');
        if (parts.length !== 2) {
            await sock.sendMessage(message.key.remoteJid, {
                text: '❌ *Format Salah*\n\nGunakan: `!setapikey <provider> <nomor>`\n\nContoh:\n• `!setapikey gemini 2` (AI)\n• `!setapikey ipapi 1` (IP)\n• `!setapikey whoisapi 1` (Whois)\n\n*Provider AI:* gemini, groq (1-5)\n*Provider IP:* ipapi, ipinfo, ipgeolocation, abuseipdb (1)\n*Provider Whois:* whoisapi (1)'
            });
            return;
        }
        
        const [provider, keyNumberStr] = parts;
        const keyNumber = parseInt(keyNumberStr);
        
        const validProviders = ['gemini', 'groq', 'ipapi', 'ipinfo', 'ipgeolocation', 'abuseipdb', 'whoisapi'];
        if (!validProviders.includes(provider)) {
            await sock.sendMessage(message.key.remoteJid, {
                text: '❌ *Provider Tidak Valid*\n\nProvider yang tersedia:\n*AI:* gemini, groq\n*IP:* ipapi, ipinfo, ipgeolocation, abuseipdb\n*Whois:* whoisapi'
            });
            return;
        }
        
        // Check key number validity based on provider type
        const maxKeys = ['gemini', 'groq'].includes(provider) ? 5 : 1;
        if (isNaN(keyNumber) || keyNumber < 1 || keyNumber > maxKeys) {
            const keyRange = maxKeys === 1 ? '1' : '1-5';
            await sock.sendMessage(message.key.remoteJid, {
                text: `❌ *Nomor API Key Tidak Valid*\n\nNomor harus ${keyRange} untuk provider ${provider}`
            });
            return;
        }
        
        // Validasi apakah API key tersedia
        if (!apiKeyManager.validateAPIKey(provider, keyNumber)) {
            await sock.sendMessage(message.key.remoteJid, {
                text: `❌ *API Key Tidak Tersedia*\n\nAPI key #${keyNumber} untuk ${provider} belum dikonfigurasi atau tidak valid.`
            });
            return;
        }
        
        const success = apiKeyManager.setCurrentAPIKey(provider, keyNumber);
        
        if (success) {
            const providerName = {
                'gemini': 'Gemini',
                'groq': 'Groq',
                'ipapi': 'IP API',
                'ipinfo': 'IP Info',
                'ipgeolocation': 'IP Geolocation',
                'abuseipdb': 'AbuseIPDB',
                'whoisapi': 'Whois API'
            }[provider];
            
            await sock.sendMessage(message.key.remoteJid, {
                text: `✅ *API Key Berhasil Diubah*\n\n🔑 Provider: ${providerName}\n📊 API Key Aktif: #${keyNumber}`
            });
        } else {
            await sock.sendMessage(message.key.remoteJid, {
                text: '❌ Gagal mengubah API key. Silakan coba lagi.'
            });
        }
    } catch (error) {
        console.error('Error in handleSetAPIKey:', error);
        await sock.sendMessage(message.key.remoteJid, {
            text: '❌ Terjadi kesalahan saat mengubah API key.'
        });
    }
}

/**
 * List all API keys for a provider
 */
async function handleListAPIKeys(sock, message, args) {
    try {
        const provider = args.trim().toLowerCase();
        
        const validProviders = ['gemini', 'groq', 'ipapi', 'ipinfo', 'ipgeolocation', 'abuseipdb', 'whoisapi'];
        if (!provider || !validProviders.includes(provider)) {
            await sock.sendMessage(message.key.remoteJid, {
                text: '❌ *Provider Tidak Valid*\n\nGunakan: `!listapikey <provider>`\n\nProvider yang tersedia:\n*AI:* gemini, groq\n*IP:* ipapi, ipinfo, ipgeolocation, abuseipdb\n*Whois:* whoisapi'
            });
            return;
        }
        
        const keys = apiKeyManager.getAllAPIKeys(provider);
        const providerName = {
            'gemini': 'Gemini',
            'groq': 'Groq',
            'ipapi': 'IP API',
            'ipinfo': 'IP Info',
            'ipgeolocation': 'IP Geolocation',
            'abuseipdb': 'AbuseIPDB',
            'whoisapi': 'Whois API'
        }[provider];
        
        let response = `🔑 *Daftar API Keys - ${providerName}*\n\n`;
        
        keys.forEach(key => {
            const keyPreview = key.isConfigured ? 
                `${key.value.substring(0, 8)}...${key.value.substring(key.value.length - 4)}` : 
                'Belum dikonfigurasi';
            
            response += `${key.status} *Key #${key.number}*\n`;
            response += `   Preview: \`${keyPreview}\`\n\n`;
        });
        
        const maxKeys = ['gemini', 'groq'].includes(provider) ? 5 : 1;
        const keyRange = maxKeys === 1 ? '1' : '<nomor>';
        response += `💡 Gunakan \`!setapikey ${provider} ${keyRange}\` untuk mengubah API key aktif.`;
        
        await sock.sendMessage(message.key.remoteJid, { text: response });
    } catch (error) {
        console.error('Error in handleListAPIKeys:', error);
        await sock.sendMessage(message.key.remoteJid, {
            text: '❌ Terjadi kesalahan saat mengambil daftar API key.'
        });
    }
}

/**
 * Rotate to next available API key
 */
async function handleRotateAPIKey(sock, message, args) {
    try {
        const provider = args.trim().toLowerCase();
        
        const validProviders = ['gemini', 'groq'];
        if (!provider || !validProviders.includes(provider)) {
            await sock.sendMessage(message.key.remoteJid, {
                text: '❌ *Provider Tidak Valid*\n\nRotasi API key hanya tersedia untuk provider dengan multiple keys:\n*AI:* gemini, groq\n\n💡 Provider IP dan Whois hanya memiliki 1 API key.'
            });
            return;
        }
        
        const currentKey = apiKeyManager.getCurrentKeyNumber(provider);
        const newKey = apiKeyManager.rotateToNextKey(provider);
        
        if (newKey) {
            const providerName = {
                'gemini': 'Gemini',
                'groq': 'Groq'
            }[provider];
            
            await sock.sendMessage(message.key.remoteJid, {
                text: `🔄 *API Key Berhasil Dirotasi*\n\n🔑 Provider: ${providerName}\n📊 Dari Key #${currentKey} → Key #${newKey}`
            });
        } else {
            await sock.sendMessage(message.key.remoteJid, {
                text: `❌ *Tidak Ada API Key Lain*\n\nTidak ada API key lain yang tersedia untuk ${provider}.`
            });
        }
    } catch (error) {
        console.error('Error in handleRotateAPIKey:', error);
        await sock.sendMessage(message.key.remoteJid, {
            text: '❌ Terjadi kesalahan saat merotasi API key.'
        });
    }
}

/**
 * Show detailed API key statistics
 */
async function handleAPIKeyStats(sock, message) {
    try {
        const stats = apiKeyManager.getAPIKeyStats();
        
        let response = '📊 *Statistik API Keys Lengkap*\n\n';
        
        Object.entries(stats).forEach(([provider, stat]) => {
            const providerName = {
                'gemini': 'Gemini',
                'groq': 'Groq'
            }[provider];
            
            const keys = apiKeyManager.getAllAPIKeys(provider);
            
            response += `🔑 *${providerName}*\n`;
            response += `   📈 Total Keys: ${stat.total}\n`;
            response += `   ✅ Terkonfigurasi: ${stat.configured}\n`;
            response += `   🟢 Aktif: Key #${stat.active}\n`;
            response += `   ⚪ Tersedia: ${stat.available}\n`;
            response += `   🔴 Belum Setup: ${5 - stat.configured}\n`;
            
            // Detail per key
            response += '   📋 Detail:\n';
            keys.forEach(key => {
                const icon = key.isActive ? '🟢' : (key.isConfigured ? '⚪' : '🔴');
                response += `      ${icon} Key #${key.number}\n`;
            });
            response += '\n';
        });
        
        // Summary
        const totalConfigured = Object.values(stats).reduce((sum, stat) => sum + stat.configured, 0);
        const totalKeys = Object.values(stats).length * 5;
        
        response += `📈 *Ringkasan Keseluruhan*\n`;
        response += `   • Total API Keys: ${totalKeys}\n`;
        response += `   • Terkonfigurasi: ${totalConfigured}/${totalKeys}\n`;
        response += `   • Persentase Setup: ${Math.round((totalConfigured/totalKeys) * 100)}%`;
        
        await sock.sendMessage(message.key.remoteJid, { text: response });
    } catch (error) {
        console.error('Error in handleAPIKeyStats:', error);
        await sock.sendMessage(message.key.remoteJid, {
            text: '❌ Terjadi kesalahan saat mengambil statistik API key.'
        });
    }
}

/**
 * Show API key help
 */
async function handleAPIKeyHelp(sock, message) {
    const response = `🔑 *Bantuan API Key Management*\n\n` +
        `📋 *Perintah Tersedia:*\n\n` +
        `🔍 *Info & Status:*\n` +
        `• \`!apikey\` - Info API key aktif\n` +
        `• \`!apistats\` - Statistik lengkap\n` +
        `• \`!listapikey <provider>\` - Daftar semua key\n\n` +
        `⚙️ *Pengaturan:*\n` +
        `• \`!setapikey <provider> <nomor>\` - Ubah key aktif\n` +
        `• \`!rotateapi <provider>\` - Rotate ke key berikutnya\n\n` +
        `🏷️ *Provider yang Tersedia:*\n` +
        `• \`gemini\` - Google Gemini\n` +
        `• \`groq\` - Groq AI\n\n` +
        `📝 *Contoh Penggunaan:*\n` +
        `• \`!setapikey gemini 2\`\n` +
        `• \`!listapikey groq\`\n` +
        `• \`!rotateapi gemini\`\n\n` +
        `⚠️ *Catatan:*\n` +
        `• Hanya admin yang dapat mengelola API keys\n` +
        `• API key #1 adalah default\n` +
        `• Pastikan API key sudah dikonfigurasi di file .env`;
    
    await sock.sendMessage(message.key.remoteJid, { text: response });
}

/**
 * Check if user is admin
 * @param {string} senderNumber 
 * @param {string} groupId 
 * @returns {boolean}
 */
async function checkAdminStatus(senderNumber, groupId) {
    // Implementasi sederhana - bisa diperluas sesuai kebutuhan
    const { getAdminNumbers } = require('../utils/helpers');
    const adminNumbers = getAdminNumbers();
    return adminNumbers.includes(senderNumber);
}

module.exports = {
    handleAPIKeyCommand
};