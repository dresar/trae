const { isAdmin } = require('../utils/helpers');
const { saveDatabase } = require('../utils/database');

/**
 * Handle group commands
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {string} command - Command name
 * @param {Array} args - Command arguments
 * @param {Object} groupsDB - Groups database
 */
async function handleGroupCommand(sock, msg, command, args, groupsDB) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    const senderNumber = sender.replace('@s.whatsapp.net', '');
    const isGroup = from.endsWith('@g.us');
    const { getAdminNumbers } = require('../utils/helpers');
    const adminNumbers = getAdminNumbers();
    
    // Enhanced logging for group commands
    console.log(`[GROUP_CMD] Command: ${command}, Group: ${from}, Sender: ${senderNumber}, IsGroup: ${isGroup}`);
    console.log(`[GROUP_CMD] Args: [${args.join(', ')}]`);
    
    if (!isGroup && !['group'].includes(command)) {
        console.log(`[GROUP_CMD] Command ${command} rejected - not in group`);
        await sock.sendMessage(from, {
            text: '❌ *Command ini hanya bisa digunakan di grup*'
        });
        return;
    }
    
    try {
        console.log(`[GROUP_CMD] Processing command: ${command}`);
        switch (command) {
            case 'tagall':
                console.log(`[GROUP_CMD] Routing to handleTagAll`);
                await handleTagAll(sock, msg, args, groupsDB, senderNumber, adminNumbers);
                break;
                
            case 'hidetag':
                await handleHideTag(sock, msg, args, groupsDB, senderNumber, adminNumbers);
                break;
                
            case 'add':
                await handleAddMember(sock, msg, args, senderNumber, adminNumbers);
                break;
                
            case 'kick':
                await handleKickMember(sock, msg, args, senderNumber, adminNumbers);
                break;
                
            case 'promote':
                await handlePromoteMember(sock, msg, args, senderNumber, adminNumbers);
                break;
                
            case 'demote':
                await handleDemoteMember(sock, msg, args, senderNumber, adminNumbers);
                break;
                
            case 'group':
                await handleGroupSettings(sock, msg, args, groupsDB, senderNumber, adminNumbers);
                break;
                
            default:
                await sock.sendMessage(from, {
                    text: '❓ *Command grup tidak ditemukan*\n\nGunakan: tagall, hidetag, add, kick, promote, demote, group'
                });
        }
    } catch (error) {
        console.error(`[GROUP_CMD] Error in group command ${command} for group ${from}:`, error);
        console.error(`[GROUP_CMD] Error stack:`, error.stack);
        try {
            await sock.sendMessage(from, {
                text: '❌ *Terjadi kesalahan*\n\nSilakan coba lagi atau hubungi admin.'
            });
        } catch (sendError) {
            console.error(`[GROUP_CMD] Failed to send error message to ${from}:`, sendError);
        }
    }
}

/**
 * Handle tag all members
 */
async function handleTagAll(sock, msg, args, groupsDB, senderNumber, adminNumbers) {
    const from = msg.key.remoteJid;
    
    // Enhanced logging for debugging
    console.log(`[TAGALL] Command called in group: ${from}`);
    console.log(`[TAGALL] Sender: ${senderNumber}`);
    console.log(`[TAGALL] Args: ${args.join(' ')}`);
    
    try {
        // Check if bot has permission to read group metadata
        let groupMetadata;
        try {
            console.log(`[TAGALL] Attempting to get group metadata for: ${from}`);
            groupMetadata = await sock.groupMetadata(from);
            console.log(`[TAGALL] Successfully got group metadata. Group: ${groupMetadata.subject}, Participants: ${groupMetadata.participants.length}`);
        } catch (metadataError) {
            console.error(`[TAGALL] Error getting group metadata for ${from}:`, metadataError);
            await sock.sendMessage(from, {
                text: '❌ *Bot tidak memiliki akses untuk membaca data grup*\n\nPastikan bot adalah admin grup atau memiliki permission yang diperlukan.'
            });
            return;
        }
        
        if (!groupMetadata || !groupMetadata.participants) {
            console.log(`[TAGALL] No group metadata or participants for ${from}`);
            await sock.sendMessage(from, {
                text: '❌ *Tidak dapat mengakses data anggota grup*\n\nBot mungkin tidak memiliki permission yang cukup.'
            });
            return;
        }
        
        const participants = groupMetadata.participants;
        console.log(`[TAGALL] Found ${participants.length} participants in group ${from}`);
        
        if (participants.length === 0) {
            console.log(`[TAGALL] No participants found in group ${from}`);
            await sock.sendMessage(from, {
                text: '❌ *Tidak ada anggota grup yang ditemukan*'
            });
            return;
        }
        
        // Check if bot is in the participants list (indicates proper access)
        const botNumber = sock.user?.id?.replace(':0', '') || '';
        const botInGroup = participants.some(p => p.id.includes(botNumber));
        console.log(`[TAGALL] Bot number: ${botNumber}, Bot in group: ${botInGroup}`);
        
        // Allow all users to use tagall command
        // No admin restriction for tagall
        console.log(`[TAGALL] Permission check passed for ${senderNumber} in group ${from}`);
        
        // Recompute sender id to ensure proper mention and display (avoid @lid showing in text)
        const senderId = msg.key.participant || msg.key.remoteJid;
        const senderDisplay = senderId.replace('@s.whatsapp.net', '').replace('@lid', '');
        
        // Create mention list with better error handling
        const mentions = participants.map(p => p.id).filter(id => id && id.includes('@'));
        console.log(`[TAGALL] Created ${mentions.length} valid mentions from ${participants.length} participants`);
        
        const mentionHandles = participants.map(p => {
            const cleanId = p.id.replace('@lid', '').replace('@s.whatsapp.net', '');
            return `@${cleanId}`;
        }).filter(handle => handle && handle !== '@');
        
        // Group mentions per 5 per line to keep message tidy
        const chunkSize = 5;
        const mentionLines = [];
        for (let i = 0; i < mentionHandles.length; i += chunkSize) {
            mentionLines.push(mentionHandles.slice(i, i + chunkSize).join(' '));
        }
        const mentionBlock = mentionLines.join('\n');
        console.log(`[TAGALL] Created mention block with ${mentionLines.length} lines`);
        
        // Custom message from args
        const customMessage = args.length > 0 ? args.join(' ') : '';
        
        // Build beautiful message
        const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
        let message = '';
        message += '┏━━━━━━━━━━━━━━━━━━━━\n';
        message += '📣 *PANGGILAN SEMUA ANGGOTA*\n';
        message += `🏷️ *Grup:* ${groupMetadata.subject}\n`;
        message += `🕒 *Waktu:* ${nowStr}\n`;
        message += '┗━━━━━━━━━━━━━━━━━━━━\n\n';
        
        if (customMessage) {
            message += `💬 *Pesan:* _${customMessage}_\n\n`;
        }
        
        message += `👥 *Anggota yang dipanggil:*\n${mentionBlock}\n\n`;
        message += `📊 *Total:* ${participants.length} anggota\n`;
        message += `👤 *Dipanggil oleh:* @${senderDisplay}`;
        
        // Multi-level fallback mechanism for sending messages
        let messageSent = false;
        
        // Level 1: Try with full mentions
        try {
            console.log(`[TAGALL] Level 1: Attempting to send tagall message to ${from} with ${mentions.length} mentions`);
            await sock.sendMessage(from, {
                text: message,
                mentions: [...mentions, senderId]
            });
            console.log(`[TAGALL] Level 1: Successfully sent tagall message to ${from}`);
            messageSent = true;
        } catch (sendError) {
            console.error(`[TAGALL] Level 1 failed for ${from}:`, sendError.message);
            
            // Level 2: Try with limited mentions (first 10 only)
            try {
                console.log(`[TAGALL] Level 2: Attempting with limited mentions (${Math.min(mentions.length, 10)})`);
                const limitedMentions = mentions.slice(0, 10);
                const limitedMessage = message.replace(mentionBlock, 
                    `${mentionHandles.slice(0, 10).join(' ')}${mentions.length > 10 ? '\n... dan ' + (mentions.length - 10) + ' anggota lainnya' : ''}`);
                
                await sock.sendMessage(from, {
                    text: limitedMessage,
                    mentions: [...limitedMentions, senderId]
                });
                console.log(`[TAGALL] Level 2: Successfully sent limited mention message to ${from}`);
                messageSent = true;
            } catch (limitedError) {
                console.error(`[TAGALL] Level 2 failed for ${from}:`, limitedError.message);
                
                // Level 3: Try without mentions but with member list
                try {
                    console.log(`[TAGALL] Level 3: Attempting without mentions`);
                    const noMentionMessage = message.replace(/@\d+/g, '[Member]');
                    await sock.sendMessage(from, {
                        text: `${noMentionMessage}\n\n⚠️ *Catatan:* Bot tidak dapat mention anggota karena keterbatasan permission.`
                    });
                    console.log(`[TAGALL] Level 3: Successfully sent no-mention message to ${from}`);
                    messageSent = true;
                } catch (noMentionError) {
                    console.error(`[TAGALL] Level 3 failed for ${from}:`, noMentionError.message);
                    
                    // Level 4: Send basic notification only
                    try {
                        console.log(`[TAGALL] Level 4: Attempting basic notification`);
                        const basicMessage = `📣 *PANGGILAN GRUP*\n\n${customMessage ? `💬 ${customMessage}\n\n` : ''}📊 Total anggota: ${participants.length}\n👤 Oleh: ${senderDisplay}\n\n⚠️ *Bot memiliki keterbatasan akses di grup ini*`;
                        await sock.sendMessage(from, {
                            text: basicMessage
                        });
                        console.log(`[TAGALL] Level 4: Successfully sent basic notification to ${from}`);
                        messageSent = true;
                    } catch (basicError) {
                        console.error(`[TAGALL] Level 4 failed for ${from}:`, basicError.message);
                        throw basicError;
                    }
                }
            }
        }
        
        if (!messageSent) {
            throw new Error('All fallback mechanisms failed');
        }
        
        // Update group stats
        if (!groupsDB.groups[from]) {
            groupsDB.groups[from] = {
                id: from,
                name: groupMetadata.subject,
                joinedAt: new Date().toISOString(),
                settings: {
                    financeEnabled: true,
                    aiEnabled: true,
                    welcomeMessage: true
                },
                stats: {
                    messageCount: 0,
                    commandCount: 0,
                    tagAllCount: 0
                }
            };
        }
        
        groupsDB.groups[from].stats.tagAllCount = (groupsDB.groups[from].stats.tagAllCount || 0) + 1;
        await saveDatabase('groups.json', groupsDB);
        
    } catch (error) {
        console.error(`[TAGALL] Critical error in tagall for group ${from}:`, error);
        console.error(`[TAGALL] Error stack:`, error.stack);
        try {
            await sock.sendMessage(from, {
                text: '❌ *Gagal melakukan tag all*\n\nPastikan bot memiliki akses untuk membaca daftar anggota grup.'
            });
        } catch (sendError) {
            console.error(`[TAGALL] Failed to send error message to ${from}:`, sendError);
        }
    }
}

/**
 * Handle hide tag (tag all without showing mentions)
 */
async function handleHideTag(sock, msg, args, groupsDB, senderNumber, adminNumbers) {
    const from = msg.key.remoteJid;
    
    try {
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(from);
        const participants = groupMetadata.participants;
        
        // Check permissions
        const groupAdmins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id.replace('@s.whatsapp.net', ''));
        const isGroupAdmin = groupAdmins.includes(senderNumber);
        const isBotAdmin = isAdmin(senderNumber, adminNumbers);
        
        if (!isGroupAdmin && !isBotAdmin) {
            await sock.sendMessage(from, {
                text: '❌ *Akses Ditolak*\n\nHanya admin grup atau admin bot yang dapat menggunakan fitur ini.'
            });
            return;
        }
        
        if (args.length === 0) {
            await sock.sendMessage(from, {
                text: '❌ *Pesan diperlukan*\n\n📝 *Cara penggunaan:*\n`!hidetag [pesan]`\n\n📋 *Contoh:*\n`!hidetag Jangan lupa rapat hari ini jam 19:00`'
            });
            return;
        }
        
        const message = args.join(' ');
        const mentions = participants.map(p => p.id);
        
        await sock.sendMessage(from, {
            text: message,
            mentions: mentions
        });
        
    } catch (error) {
        console.error('Error in hidetag:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal mengirim pesan tersembunyi*\n\nPastikan bot memiliki akses untuk membaca daftar anggota grup.'
        });
    }
}

/**
 * Handle add member
 */
async function handleAddMember(sock, msg, args, senderNumber, adminNumbers) {
    const from = msg.key.remoteJid;
    
    try {
        // Check if user is bot admin
        if (!isAdmin(senderNumber, adminNumbers)) {
            await sock.sendMessage(from, {
                text: '❌ *Akses Ditolak*\n\nHanya admin bot yang dapat menambahkan anggota.'
            });
            return;
        }
        
        if (args.length === 0) {
            await sock.sendMessage(from, {
                text: '❌ *Nomor diperlukan*\n\n📝 *Cara penggunaan:*\n`!add [nomor]`\n\n📋 *Contoh:*\n`!add 628123456789`\n`!add 628123456789 628987654321`'
            });
            return;
        }
        
        const numbers = args.map(num => {
            let cleaned = num.replace(/[^0-9]/g, '');
            if (cleaned.startsWith('0')) {
                cleaned = '62' + cleaned.substring(1);
            } else if (!cleaned.startsWith('62')) {
                cleaned = '62' + cleaned;
            }
            return cleaned + '@s.whatsapp.net';
        });
        
        const result = await sock.groupParticipantsUpdate(from, numbers, 'add');
        
        let message = `👥 *HASIL PENAMBAHAN ANGGOTA*\n\n`;
        
        result.forEach((res, index) => {
            const number = numbers[index].replace('@s.whatsapp.net', '');
            if (res.status === '200') {
                message += `✅ ${number} - Berhasil ditambahkan\n`;
            } else if (res.status === '403') {
                message += `❌ ${number} - Tidak dapat ditambahkan (privasi)\n`;
            } else if (res.status === '408') {
                message += `⏰ ${number} - Undangan dikirim\n`;
            } else {
                message += `❓ ${number} - Status: ${res.status}\n`;
            }
        });
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error adding members:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal menambahkan anggota*\n\nPastikan bot adalah admin grup dan memiliki izin untuk menambahkan anggota.'
        });
    }
}

/**
 * Handle kick member
 */
async function handleKickMember(sock, msg, args, senderNumber, adminNumbers) {
    const from = msg.key.remoteJid;
    
    try {
        // Check if user is bot admin
        if (!isAdmin(senderNumber, adminNumbers)) {
            await sock.sendMessage(from, {
                text: '❌ *Akses Ditolak*\n\nHanya admin bot yang dapat mengeluarkan anggota.'
            });
            return;
        }
        
        // Check if message has quoted message or mentions
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        
        let targets = [];
        
        if (quotedMsg) {
            const quotedSender = msg.message.extendedTextMessage.contextInfo.participant;
            if (quotedSender) targets.push(quotedSender);
        }
        
        if (mentions.length > 0) {
            targets = targets.concat(mentions);
        }
        
        if (args.length > 0) {
            const numbers = args.map(num => {
                let cleaned = num.replace(/[^0-9]/g, '');
                if (cleaned.startsWith('0')) {
                    cleaned = '62' + cleaned.substring(1);
                } else if (!cleaned.startsWith('62')) {
                    cleaned = '62' + cleaned;
                }
                return cleaned + '@s.whatsapp.net';
            });
            targets = targets.concat(numbers);
        }
        
        if (targets.length === 0) {
            await sock.sendMessage(from, {
                text: '❌ *Target diperlukan*\n\n📝 *Cara penggunaan:*\n• Reply pesan anggota yang ingin dikeluarkan dengan `!kick`\n• Mention anggota: `!kick @user`\n• Gunakan nomor: `!kick 628123456789`'
            });
            return;
        }
        
        // Remove duplicates
        targets = [...new Set(targets)];
        
        const result = await sock.groupParticipantsUpdate(from, targets, 'remove');
        
        let message = `👥 *HASIL PENGELUARAN ANGGOTA*\n\n`;
        
        result.forEach((res, index) => {
            const number = targets[index].replace('@s.whatsapp.net', '');
            if (res.status === '200') {
                message += `✅ ${number} - Berhasil dikeluarkan\n`;
            } else {
                message += `❌ ${number} - Gagal dikeluarkan (Status: ${res.status})\n`;
            }
        });
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error kicking members:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal mengeluarkan anggota*\n\nPastikan bot adalah admin grup dan memiliki izin untuk mengeluarkan anggota.'
        });
    }
}

/**
 * Handle promote member
 */
async function handlePromoteMember(sock, msg, args, senderNumber, adminNumbers) {
    const from = msg.key.remoteJid;
    
    try {
        // Check if user is bot admin
        if (!isAdmin(senderNumber, adminNumbers)) {
            await sock.sendMessage(from, {
                text: '❌ *Akses Ditolak*\n\nHanya admin bot yang dapat mempromosikan anggota.'
            });
            return;
        }
        
        // Get targets (similar to kick logic)
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        
        let targets = [];
        
        if (quotedMsg) {
            const quotedSender = msg.message.extendedTextMessage.contextInfo.participant;
            if (quotedSender) targets.push(quotedSender);
        }
        
        if (mentions.length > 0) {
            targets = targets.concat(mentions);
        }
        
        if (args.length > 0) {
            const numbers = args.map(num => {
                let cleaned = num.replace(/[^0-9]/g, '');
                if (cleaned.startsWith('0')) {
                    cleaned = '62' + cleaned.substring(1);
                } else if (!cleaned.startsWith('62')) {
                    cleaned = '62' + cleaned;
                }
                return cleaned + '@s.whatsapp.net';
            });
            targets = targets.concat(numbers);
        }
        
        if (targets.length === 0) {
            await sock.sendMessage(from, {
                text: '❌ *Target diperlukan*\n\n📝 *Cara penggunaan:*\n• Reply pesan anggota yang ingin dipromosikan dengan `!promote`\n• Mention anggota: `!promote @user`\n• Gunakan nomor: `!promote 628123456789`'
            });
            return;
        }
        
        targets = [...new Set(targets)];
        
        const result = await sock.groupParticipantsUpdate(from, targets, 'promote');
        
        let message = `👑 *HASIL PROMOSI ADMIN*\n\n`;
        
        result.forEach((res, index) => {
            const number = targets[index].replace('@s.whatsapp.net', '');
            if (res.status === '200') {
                message += `✅ ${number} - Berhasil dipromosikan menjadi admin\n`;
            } else {
                message += `❌ ${number} - Gagal dipromosikan (Status: ${res.status})\n`;
            }
        });
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error promoting members:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal mempromosikan anggota*\n\nPastikan bot adalah admin grup dan memiliki izin untuk mempromosikan anggota.'
        });
    }
}

/**
 * Handle demote member
 */
async function handleDemoteMember(sock, msg, args, senderNumber, adminNumbers) {
    const from = msg.key.remoteJid;
    
    try {
        // Check if user is bot admin
        if (!isAdmin(senderNumber, adminNumbers)) {
            await sock.sendMessage(from, {
                text: '❌ *Akses Ditolak*\n\nHanya admin bot yang dapat menurunkan admin.'
            });
            return;
        }
        
        // Get targets (similar to promote logic)
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        
        let targets = [];
        
        if (quotedMsg) {
            const quotedSender = msg.message.extendedTextMessage.contextInfo.participant;
            if (quotedSender) targets.push(quotedSender);
        }
        
        if (mentions.length > 0) {
            targets = targets.concat(mentions);
        }
        
        if (args.length > 0) {
            const numbers = args.map(num => {
                let cleaned = num.replace(/[^0-9]/g, '');
                if (cleaned.startsWith('0')) {
                    cleaned = '62' + cleaned.substring(1);
                } else if (!cleaned.startsWith('62')) {
                    cleaned = '62' + cleaned;
                }
                return cleaned + '@s.whatsapp.net';
            });
            targets = targets.concat(numbers);
        }
        
        if (targets.length === 0) {
            await sock.sendMessage(from, {
                text: '❌ *Target diperlukan*\n\n📝 *Cara penggunaan:*\n• Reply pesan admin yang ingin diturunkan dengan `!demote`\n• Mention admin: `!demote @admin`\n• Gunakan nomor: `!demote 628123456789`'
            });
            return;
        }
        
        targets = [...new Set(targets)];
        
        const result = await sock.groupParticipantsUpdate(from, targets, 'demote');
        
        let message = `👤 *HASIL PENURUNAN ADMIN*\n\n`;
        
        result.forEach((res, index) => {
            const number = targets[index].replace('@s.whatsapp.net', '');
            if (res.status === '200') {
                message += `✅ ${number} - Berhasil diturunkan menjadi anggota biasa\n`;
            } else {
                message += `❌ ${number} - Gagal diturunkan (Status: ${res.status})\n`;
            }
        });
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error demoting members:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal menurunkan admin*\n\nPastikan bot adalah admin grup dan memiliki izin untuk menurunkan admin.'
        });
    }
}

/**
 * Handle group settings
 */
async function handleGroupSettings(sock, msg, args, groupsDB, senderNumber, adminNumbers) {
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    
    if (args.length === 0) {
        // Show group info
        if (isGroup) {
            try {
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;
                const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
                
                let message = `👥 *INFORMASI GRUP*\n\n`;
                message += `📝 *Nama:* ${groupMetadata.subject}\n`;
                message += `🆔 *ID:* ${from}\n`;
                message += `👤 *Anggota:* ${participants.length}\n`;
                message += `👑 *Admin:* ${admins.length}\n`;
                message += `📅 *Dibuat:* ${new Date(groupMetadata.creation * 1000).toLocaleDateString('id-ID')}\n\n`;
                
                if (groupMetadata.desc) {
                    message += `📄 *Deskripsi:*\n${groupMetadata.desc}\n\n`;
                }
                
                // Group settings from database
                if (groupsDB.groups[from]) {
                    const settings = groupsDB.groups[from].settings;
                    message += `⚙️ *Pengaturan Bot:*\n`;
                    message += `💰 Keuangan: ${settings.financeEnabled ? '✅' : '❌'}\n`;
                    message += `🤖 AI Chat: ${settings.aiEnabled ? '✅' : '❌'}\n`;
                    message += `👋 Welcome: ${settings.welcomeMessage ? '✅' : '❌'}\n`;
                }
                
                await sock.sendMessage(from, { text: message });
                
            } catch (error) {
                console.error('Error getting group info:', error);
                await sock.sendMessage(from, {
                    text: '❌ *Gagal mendapatkan informasi grup*'
                });
            }
        } else {
            // Show bot groups list
            const groups = Object.values(groupsDB.groups);
            
            if (groups.length === 0) {
                await sock.sendMessage(from, {
                    text: '📋 *DAFTAR GRUP*\n\n❌ Bot belum bergabung dengan grup manapun.'
                });
                return;
            }
            
            let message = `📋 *DAFTAR GRUP BOT*\n\n`;
            
            groups.forEach((group, index) => {
                message += `${index + 1}. *${group.name}*\n`;
                message += `   🆔 ${group.id}\n`;
                message += `   📅 Bergabung: ${new Date(group.joinedAt).toLocaleDateString('id-ID')}\n\n`;
            });
            
            message += `📊 *Total: ${groups.length} grup*`;
            
            await sock.sendMessage(from, { text: message });
        }
        return;
    }
    
    // Handle group settings modification (admin only)
    if (!isAdmin(senderNumber, adminNumbers)) {
        await sock.sendMessage(from, {
            text: '❌ *Akses Ditolak*\n\nHanya admin bot yang dapat mengubah pengaturan grup.'
        });
        return;
    }
    
    const setting = args[0].toLowerCase();
    const value = args[1]?.toLowerCase();
    
    if (!isGroup) {
        await sock.sendMessage(from, {
            text: '❌ *Command ini hanya bisa digunakan di grup*'
        });
        return;
    }
    
    // Initialize group settings if not exists
    if (!groupsDB.groups[from]) {
        const groupMetadata = await sock.groupMetadata(from);
        groupsDB.groups[from] = {
            id: from,
            name: groupMetadata.subject,
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
    }
    
    const validSettings = ['finance', 'ai', 'welcome'];
    const validValues = ['on', 'off', 'enable', 'disable', 'true', 'false'];
    
    if (!validSettings.includes(setting)) {
        await sock.sendMessage(from, {
            text: `❌ *Pengaturan tidak valid*\n\n✅ *Pengaturan yang tersedia:*\n• \`finance\` - Fitur keuangan\n• \`ai\` - AI Chat\n• \`welcome\` - Pesan selamat datang\n\n📝 *Contoh:* \`!group finance on\``
        });
        return;
    }
    
    if (!validValues.includes(value)) {
        await sock.sendMessage(from, {
            text: `❌ *Nilai tidak valid*\n\n✅ *Nilai yang tersedia:*\n• \`on\` / \`enable\` / \`true\`\n• \`off\` / \`disable\` / \`false\`\n\n📝 *Contoh:* \`!group finance on\``
        });
        return;
    }
    
    const enableValue = ['on', 'enable', 'true'].includes(value);
    
    // Update setting
    switch (setting) {
        case 'finance':
            groupsDB.groups[from].settings.financeEnabled = enableValue;
            break;
        case 'ai':
            groupsDB.groups[from].settings.aiEnabled = enableValue;
            break;
        case 'welcome':
            groupsDB.groups[from].settings.welcomeMessage = enableValue;
            break;
    }
    
    await saveDatabase('groups.json', groupsDB);
    
    const statusText = enableValue ? 'diaktifkan' : 'dinonaktifkan';
    const statusIcon = enableValue ? '✅' : '❌';
    
    await sock.sendMessage(from, {
        text: `${statusIcon} *Pengaturan Diperbarui*\n\n⚙️ *${setting.toUpperCase()}* telah ${statusText} untuk grup ini.`
    });
}

module.exports = {
    handleGroupCommand
};