const { isAdmin, normalizeSenderToPhone } = require('../utils/helpers');
const { saveDatabase } = require('../utils/database');

/**
 * Handle sambutan commands
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {string} command - Command name
 * @param {Array} args - Command arguments
 * @param {Object} groupsDB - Groups database
 */
async function handleSambutanCommand(sock, msg, command, args, groupsDB) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    const senderNumber = normalizeSenderToPhone(sender);
    const isGroup = from.endsWith('@g.us');
    const { getAdminNumbers } = require('../utils/helpers');
    const adminNumbers = getAdminNumbers();

    if (!isGroup) {
        await sock.sendMessage(from, {
            text: '❌ *Command ini hanya bisa digunakan di grup*'
        });
        return;
    }

    try {
        switch (command) {
            case 'sambutan':
                await handleBotIntroduction(sock, msg, args, groupsDB, senderNumber, adminNumbers);
                break;
                
            default:
                await sock.sendMessage(from, {
                    text: '❓ *Command sambutan tidak ditemukan*\n\nGunakan: sambutan'
                });
        }
    } catch (error) {
        console.error('Error in sambutan command:', error);
        await sock.sendMessage(from, {
            text: '❌ *Terjadi kesalahan*\n\nSilakan coba lagi atau hubungi admin.'
        });
    }
}

/**
 * Handle bot introduction and welcome all members
 */
async function handleBotIntroduction(sock, msg, args, groupsDB, senderNumber, adminNumbers) {
    const from = msg.key.remoteJid;
    
    try {
        // Get group metadata terlebih dahulu untuk bisa cek admin grup
        const groupMetadata = await sock.groupMetadata(from);
        const participants = groupMetadata.participants;

        // Kumpulkan admin grup (normalize agar konsisten dengan senderNumber)
        const groupAdmins = participants
            .filter(p => !!p.admin)
            .map(p => normalizeSenderToPhone(p.id));
        const isGroupAdmin = groupAdmins.includes(senderNumber);

        // Check if user is admin bot atau admin grup
        if (!isAdmin(senderNumber, adminNumbers) && !isGroupAdmin) {
            console.log(`❌ Sambutan denied. sender=${senderNumber} | adminNumbers=${JSON.stringify(adminNumbers)} | groupAdmins=${JSON.stringify(groupAdmins)} `);
            await sock.sendMessage(from, {
                text: '❌ *Akses Ditolak*\n\nHanya admin bot atau admin grup yang dapat menggunakan fitur sambutan.'
            });
            return;
        }
        
        if (participants.length === 0) {
            await sock.sendMessage(from, {
                text: '❌ *Tidak ada anggota grup yang ditemukan*'
            });
            return;
        }

        // Create mention list for all members
        const mentions = participants.map(p => p.id);
        const mentionHandles = participants.map(p => {
            const cleanId = p.id.replace('@lid', '').replace('@s.whatsapp.net', '');
            return `@${cleanId}`;
        });

        // Group mentions per 5 per line
        const chunkSize = 5;
        const mentionLines = [];
        for (let i = 0; i < mentionHandles.length; i += chunkSize) {
            mentionLines.push(mentionHandles.slice(i, i + chunkSize).join(' '));
        }
        const mentionBlock = mentionLines.join('\n');

        // Get system info
        const memoryUsage = process.memoryUsage();
        const memoryMB = Math.round(memoryUsage.rss / 1024 / 1024);
        const uptime = process.uptime();
        const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

        // Custom welcome message from args
        const customMessage = args.length > 0 ? args.join(' ') : 'Selamat datang semua! 🎉';

        // Build comprehensive introduction message
        const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
        let message = '';
        
        // Header
        message += '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        message += '🤖 *SELAMAT DATANG DI BOT KKN* 🤖\n';
        message += '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

        // Welcome message
        message += `🎉 *Pesan Sambutan:*\n_${customMessage}_\n\n`;

        // Bot specifications
        message += '📋 *SPESIFIKASI BOT*\n';
        message += '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        message += `🏷️ *Nama:* KKN WhatsApp Bot\n`;
        message += `📦 *Versi:* 1.0.0\n`;
        message += `⚙️ *Platform:* Node.js ${process.version}\n`;
        message += `💾 *Memory:* ${memoryMB} MB\n`;
        message += `⏱️ *Uptime:* ${uptimeStr}\n`;
        message += `🏠 *Grup:* ${groupMetadata.subject}\n`;
        message += `📅 *Waktu Sambutan:* ${nowStr}\n`;
        message += '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

        // Main features
        message += '🌟 *FITUR UTAMA BOT*\n';
        message += '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        message += '💰 *Manajemen Keuangan* (Admin Only)\n';
        message += '   • !masuk, !keluar, !saldo, !laporan\n';
        message += '   • !kategori, !backup, !restore\n\n';
        message += '👥 *Manajemen Grup*\n';
        message += '   • !tagall, !hidetag, !add, !kick\n';
        message += '   • !promote, !demote, !group\n\n';
        message += '🤖 *AI Assistant*\n';
        message += '   • !ai, !chat, !ask, !translate\n';
        message += '   • !summarize, !explain, !analyze\n\n';
        message += '📁 *File Manager & Google Drive*\n';
        message += '   • !upload, !download, !listfiles\n';
        message += '   • !drive, !kknfiles, !quota\n\n';
        message += '🎨 *Media Tools*\n';
        message += '   • !sticker, !removebg, !ocr, !qr\n';
        message += '   • !ytdl, !toimg, !readqr\n\n';
        message += '🌤️ *Informasi & Utilitas*\n';
        message += '   • !cuaca, !news, !translate\n';
        message += '   • !calculator, !password, !ping\n\n';
        message += '📅 *Schedule & Reminder*\n';
        message += '   • !schedule, !reminder, !agenda\n';
        message += '   • !meeting, !deadline, !event\n';
        message += '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

        // Usage instructions
        message += '📖 *CARA PENGGUNAAN*\n';
        message += '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        message += '• Gunakan tanda ! sebelum command\n';
        message += '• Contoh: !help untuk melihat menu\n';
        message += '• Fitur keuangan hanya untuk admin\n';
        message += '• Bot aktif 24/7 untuk melayani Anda\n';
        message += '• Ketik !info untuk detail lengkap\n';
        message += '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

        // Members introduction
        message += '👥 *ANGGOTA YANG DISAPA*\n';
        message += `${mentionBlock}\n\n`;
        message += `📊 *Total Anggota:* ${participants.length} orang\n`;

        // Footer
        message += '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        message += '🎓 *Dibuat khusus untuk kegiatan KKN*\n';
        message += '💻 *Bot siap membantu aktivitas kelompok*\n';
        message += '🤝 *Mari bekerja sama dengan efisien!*\n';
        message += '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

        // Send the introduction message
        await sock.sendMessage(from, {
            text: message,
            mentions: mentions
        });

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
                    tagAllCount: 0,
                    introductionCount: 0
                }
            };
        }

        // Track introduction usage
        groupsDB.groups[from].stats.introductionCount = (groupsDB.groups[from].stats.introductionCount || 0) + 1;
        groupsDB.groups[from].lastIntroduction = new Date().toISOString();
        await saveDatabase('groups.json', groupsDB);

        console.log(`✅ Bot introduction sent to group: ${groupMetadata.subject} by: ${senderNumber} | GroupAdmin: ${isGroupAdmin} | BotAdmin: ${isAdmin(senderNumber, adminNumbers)}`);

    } catch (error) {
        console.error('Error in bot introduction:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal mengirim sambutan*\n\nPastikan bot memiliki akses untuk membaca daftar anggota grup.'
        });
    }
}

module.exports = {
    handleSambutanCommand
};