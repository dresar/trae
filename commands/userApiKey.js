const apiKeyManager = require('../utils/apiKeyManager');

/**
 * Handle user API key selection commands
 * @param {Object} sock - WhatsApp socket
 * @param {Object} message - Message object
 * @param {string} senderNumber - Sender's phone number
 * @param {string} command - Command string
 * @param {string} args - Command arguments
 */
async function handleUserAPIKeyCommand(sock, message, senderNumber, command, args) {
    try {
        switch (command) {
            case 'pilihapi':
            case 'selectapi':
                return await handleSelectAPI(sock, message, senderNumber, args);
            
            case 'infoapi':
            case 'myapi':
                return await handleMyAPIInfo(sock, message, senderNumber);
            
            case 'resetapi':
                return await handleResetAPI(sock, message, senderNumber, args);
            
            case 'listapi':
            case 'availableapi':
                return await handleListAvailableAPI(sock, message, senderNumber);
            
            default:
                return await showAPIHelp(sock, message, senderNumber);
        }
    } catch (error) {
        console.error('Error in handleUserAPIKeyCommand:', error);
        await sock.sendMessage(message.key.remoteJid, {
            text: '❌ Terjadi kesalahan saat memproses perintah API key. Silakan coba lagi.'
        });
    }
}

/**
 * Handle API key selection
 */
async function handleSelectAPI(sock, message, senderNumber, args) {
    if (!args) {
        const helpText = `🔑 *PILIH API KEY*

` +
            `Gunakan format:
` +
            `*!pilihapi gemini 2* - Pilih Gemini API key nomor 2
` +
            `*!pilihapi groq 3* - Pilih Groq API key nomor 3

` +
            `Provider yang tersedia:
` +
            `• gemini (1-5)
` +
            `• groq (1-5)

` +
            `Ketik *!listapi* untuk melihat API key yang tersedia`;
        
        return await sock.sendMessage(message.key.remoteJid, { text: helpText });
    }

    const parts = args.trim().split(' ');
    if (parts.length !== 2) {
        return await sock.sendMessage(message.key.remoteJid, {
            text: '❌ Format salah! Gunakan: *!pilihapi [provider] [nomor]*\nContoh: *!pilihapi gemini 2*'
        });
    }

    const provider = parts[0].toLowerCase();
    const keyNumber = parseInt(parts[1]);

    if (!['gemini', 'groq'].includes(provider)) {
        return await sock.sendMessage(message.key.remoteJid, {
            text: '❌ Provider tidak valid! Gunakan: *gemini* atau *groq*'
        });
    }

    if (isNaN(keyNumber) || keyNumber < 1 || keyNumber > 5) {
        return await sock.sendMessage(message.key.remoteJid, {
            text: '❌ Nomor API key harus antara 1-5!'
        });
    }

    const availableKeys = apiKeyManager.getAvailableKeys(provider);
    if (!availableKeys.includes(keyNumber)) {
        return await sock.sendMessage(message.key.remoteJid, {
            text: `❌ API key ${provider.toUpperCase()} nomor ${keyNumber} tidak tersedia!\n\n` +
                  `API key yang tersedia: ${availableKeys.join(', ')}`
        });
    }

    const success = apiKeyManager.setUserAPIKey(senderNumber, provider, keyNumber);
    
    if (success) {
        const providerName = provider === 'gemini' ? 'Gemini' : 'Groq';
        await sock.sendMessage(message.key.remoteJid, {
            text: `✅ *API KEY BERHASIL DIATUR*\n\n` +
                  `🔑 Provider: ${providerName}\n` +
                  `📊 API Key: #${keyNumber}\n` +
                  `👤 User: ${senderNumber}\n\n` +
                  `Pengaturan telah disimpan otomatis!`
        });
    } else {
        await sock.sendMessage(message.key.remoteJid, {
            text: '❌ Gagal mengatur API key. Silakan coba lagi.'
        });
    }
}

/**
 * Show user's current API key settings
 */
async function handleMyAPIInfo(sock, message, senderNumber) {
    const userSettings = apiKeyManager.getUserAPIKeySettings(senderNumber);
    const geminiKeys = apiKeyManager.getAvailableKeys('gemini');
    const groqKeys = apiKeyManager.getAvailableKeys('groq');
    
    const infoText = `🔑 *PENGATURAN API KEY ANDA*\n\n` +
        `👤 User: ${senderNumber}\n\n` +
        `🤖 **GEMINI AI**\n` +
        `├ API Key Aktif: #${userSettings.gemini_key}\n` +
        `└ Tersedia: ${geminiKeys.join(', ')}\n\n` +
        `⚡ **GROQ AI**\n` +
        `├ API Key Aktif: #${userSettings.groq_key}\n` +
        `└ Tersedia: ${groqKeys.join(', ')}\n\n` +
        `💡 *Tips:*\n` +
        `• Gunakan *!pilihapi* untuk mengubah\n` +
        `• Gunakan *!resetapi* untuk kembali ke default\n` +
        `• Pengaturan disimpan otomatis per user`;
    
    await sock.sendMessage(message.key.remoteJid, { text: infoText });
}

/**
 * Reset user's API key settings
 */
async function handleResetAPI(sock, message, senderNumber, args) {
    let provider = 'all';
    
    if (args) {
        const inputProvider = args.trim().toLowerCase();
        if (['gemini', 'groq'].includes(inputProvider)) {
            provider = inputProvider;
        } else if (inputProvider !== 'all') {
            return await sock.sendMessage(message.key.remoteJid, {
                text: '❌ Provider tidak valid! Gunakan: *gemini*, *groq*, atau *all*'
            });
        }
    }
    
    const success = apiKeyManager.resetUserAPIKey(senderNumber, provider);
    
    if (success) {
        let resetText;
        if (provider === 'all') {
            resetText = `✅ *SEMUA API KEY DIRESET*\n\n` +
                       `👤 User: ${senderNumber}\n` +
                       `🔄 Kembali ke pengaturan default\n\n` +
                       `Sekarang menggunakan API key global default.`;
        } else {
            const providerName = provider === 'gemini' ? 'Gemini' : 'Groq';
            resetText = `✅ *API KEY ${providerName.toUpperCase()} DIRESET*\n\n` +
                       `👤 User: ${senderNumber}\n` +
                       `🔄 ${providerName} kembali ke default\n\n` +
                       `Sekarang menggunakan API key global default.`;
        }
        
        await sock.sendMessage(message.key.remoteJid, { text: resetText });
    } else {
        await sock.sendMessage(message.key.remoteJid, {
            text: '❌ Gagal mereset API key. Silakan coba lagi.'
        });
    }
}

/**
 * List available API keys
 */
async function handleListAvailableAPI(sock, message, senderNumber) {
    const geminiKeys = apiKeyManager.getAvailableKeys('gemini');
    const groqKeys = apiKeyManager.getAvailableKeys('groq');
    
    const listText = `📋 *DAFTAR API KEY TERSEDIA*\n\n` +
        `🤖 **GEMINI AI**\n` +
        `├ Total: ${geminiKeys.length} API key\n` +
        `└ Nomor: ${geminiKeys.length > 0 ? geminiKeys.join(', ') : 'Tidak ada'}\n\n` +
        `⚡ **GROQ AI**\n` +
        `├ Total: ${groqKeys.length} API key\n` +
        `└ Nomor: ${groqKeys.length > 0 ? groqKeys.join(', ') : 'Tidak ada'}\n\n` +
        `💡 *Cara Penggunaan:*\n` +
        `• *!pilihapi gemini 2* - Pilih Gemini #2\n` +
        `• *!pilihapi groq 3* - Pilih Groq #3\n` +
        `• *!infoapi* - Lihat pengaturan Anda\n` +
        `• *!resetapi* - Reset ke default`;
    
    await sock.sendMessage(message.key.remoteJid, { text: listText });
}

/**
 * Show API help
 */
async function showAPIHelp(sock, message, senderNumber) {
    const helpText = `🔑 *BANTUAN API KEY MANAGEMENT*\n\n` +
        `**PERINTAH TERSEDIA:**\n\n` +
        `🎯 *!pilihapi [provider] [nomor]*\n` +
        `   Pilih API key untuk digunakan\n` +
        `   Contoh: !pilihapi gemini 2\n\n` +
        `📊 *!infoapi* atau *!myapi*\n` +
        `   Lihat pengaturan API key Anda\n\n` +
        `📋 *!listapi* atau *!availableapi*\n` +
        `   Lihat daftar API key yang tersedia\n\n` +
        `🔄 *!resetapi [provider]*\n` +
        `   Reset API key ke default\n` +
        `   Contoh: !resetapi gemini (atau !resetapi all)\n\n` +
        `**PROVIDER YANG DIDUKUNG:**\n` +
        `• gemini (Google Gemini AI)\n` +
        `• groq (Groq AI)\n\n` +
        `💡 *Catatan:*\n` +
        `• Pengaturan disimpan otomatis per user\n` +
        `• Setiap user bisa punya pengaturan berbeda\n` +
        `• API key nomor 1 adalah default global`;
    
    await sock.sendMessage(message.key.remoteJid, { text: helpText });
}

module.exports = {
    handleUserAPIKeyCommand
};