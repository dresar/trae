const GroupManager = require('../utils/groupManager');
const moment = require('moment');

class GroupAdminCommands {
    constructor() {
        this.groupManager = new GroupManager();
    }

    // Initialize group when bot joins
    async handleGroupJoin(sock, groupId, groupName, createdBy) {
        try {
            const initialized = await this.groupManager.initializeGroup(groupId, groupName, createdBy);
            if (initialized) {
                await sock.sendMessage(groupId, {
                    text: `🎉 *Grup berhasil diinisialisasi!*\n\n` +
                          `📋 *Fitur yang tersedia:*\n` +
                          `• Moderasi otomatis\n` +
                          `• Sistem peringatan\n` +
                          `• Anti-spam\n` +
                          `• Filter kata\n` +
                          `• Pesan selamat datang/perpisahan\n` +
                          `• Polling & voting\n` +
                          `• Pengingat & todo list\n` +
                          `• Games & hiburan\n` +
                          `• Analitik grup\n\n` +
                          `Ketik *.help admin* untuk melihat perintah admin.`
                });
            }
        } catch (error) {
            console.error('Error initializing group:', error);
        }
    }

    // Kick user command
    async handleKick(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat menggunakan perintah ini.'
            });
        }

        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format: *.ban @user [alasan] [durasi_menit]*\n\nContoh:\n• `.ban @user spam`\n• `.ban @user toxic 60` (ban 1 jam)'
            });
        }

        const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) {
            return await sock.sendMessage(groupId, {
                text: '❌ Harap mention user yang ingin di-ban.'
            });
        }

        const reason = args.slice(1, -1).join(' ') || 'Tidak ada alasan';
        const duration = parseInt(args[args.length - 1]) || null;
        
        try {
            await this.groupManager.banUser(groupId, mentionedJid, reason, senderId, duration);
            
            // Remove user from group
            await sock.groupParticipantsUpdate(groupId, [mentionedJid], 'remove');
            
            const durationText = duration ? ` selama ${duration} menit` : ' permanen';
            await sock.sendMessage(groupId, {
                text: `✅ *User berhasil di-ban${durationText}*\n\n` +
                      `👤 *User:* @${mentionedJid.split('@')[0]}\n` +
                      `📝 *Alasan:* ${reason}\n` +
                      `👮 *Oleh:* @${senderId.split('@')[0]}\n` +
                      `⏰ *Waktu:* ${moment().format('DD/MM/YYYY HH:mm')}`,
                mentions: [mentionedJid, senderId]
            });
        } catch (error) {
            console.error('Error banning user:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat mem-ban user.'
            });
        }
    }

    // Ban user command
    async handleBan(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat menggunakan perintah ini.'
            });
        }

        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format: *.unban nomor_user*\n\nContoh: `.unban 628123456789`'
            });
        }

        const userId = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        
        try {
            const success = await this.groupManager.unbanUser(groupId, userId, senderId);
            
            if (success) {
                await sock.sendMessage(groupId, {
                    text: `✅ *User berhasil di-unban*\n\n` +
                          `👤 *User:* @${userId.split('@')[0]}\n` +
                          `👮 *Oleh:* @${senderId.split('@')[0]}\n` +
                          `⏰ *Waktu:* ${moment().format('DD/MM/YYYY HH:mm')}`,
                    mentions: [userId, senderId]
                });
            } else {
                await sock.sendMessage(groupId, {
                    text: '❌ User tidak ditemukan dalam daftar ban atau sudah di-unban.'
                });
            }
        } catch (error) {
            console.error('Error unbanning user:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat meng-unban user.'
            });
        }
    }

    // Mute user command
    async handleMute(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin/moderator yang dapat menggunakan perintah ini.'
            });
        }

        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format: *.mute @user [alasan] [durasi_menit]*\n\nContoh:\n• `.mute @user spam`\n• `.mute @user flood 30` (mute 30 menit)'
            });
        }

        const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) {
            return await sock.sendMessage(groupId, {
                text: '❌ Harap mention user yang ingin di-mute.'
            });
        }

        const reason = args.slice(1, -1).join(' ') || 'Tidak ada alasan';
        const duration = parseInt(args[args.length - 1]) || null;
        
        try {
            await this.groupManager.muteUser(groupId, mentionedJid, reason, senderId, duration);
            
            const durationText = duration ? ` selama ${duration} menit` : ' permanen';
            await sock.sendMessage(groupId, {
                text: `🔇 *User berhasil di-mute${durationText}*\n\n` +
                      `👤 *User:* @${mentionedJid.split('@')[0]}\n` +
                      `📝 *Alasan:* ${reason}\n` +
                      `👮 *Oleh:* @${senderId.split('@')[0]}\n` +
                      `⏰ *Waktu:* ${moment().format('DD/MM/YYYY HH:mm')}`,
                mentions: [mentionedJid, senderId]
            });
        } catch (error) {
            console.error('Error muting user:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat mem-mute user.'
            });
        }
    }

    // Unmute user command
    async handleUnmute(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin/moderator yang dapat menggunakan perintah ini.'
            });
        }

        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format: *.unmute @user*'
            });
        }

        const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) {
            return await sock.sendMessage(groupId, {
                text: '❌ Harap mention user yang ingin di-unmute.'
            });
        }
        
        try {
            const success = await this.groupManager.unmuteUser(groupId, mentionedJid, senderId);
            
            if (success) {
                await sock.sendMessage(groupId, {
                    text: `🔊 *User berhasil di-unmute*\n\n` +
                          `👤 *User:* @${mentionedJid.split('@')[0]}\n` +
                          `👮 *Oleh:* @${senderId.split('@')[0]}\n` +
                          `⏰ *Waktu:* ${moment().format('DD/MM/YYYY HH:mm')}`,
                    mentions: [mentionedJid, senderId]
                });
            } else {
                await sock.sendMessage(groupId, {
                    text: '❌ User tidak ditemukan dalam daftar mute atau sudah di-unmute.'
                });
            }
        } catch (error) {
            console.error('Error unmuting user:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat meng-unmute user.'
            });
        }
    }

    // Warn user command
    async handleWarn(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin/moderator yang dapat menggunakan perintah ini.'
            });
        }

        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format: *.warn @user [alasan]*\n\nContoh: `.warn @user melanggar aturan`'
            });
        }

        const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) {
            return await sock.sendMessage(groupId, {
                text: '❌ Harap mention user yang ingin diberi peringatan.'
            });
        }

        const reason = args.slice(1).join(' ') || 'Tidak ada alasan';
        
        try {
            const warnCount = await this.groupManager.warnUser(groupId, mentionedJid, reason, senderId);
            
            await sock.sendMessage(groupId, {
                text: `⚠️ *Peringatan diberikan*\n\n` +
                      `👤 *User:* @${mentionedJid.split('@')[0]}\n` +
                      `📝 *Alasan:* ${reason}\n` +
                      `👮 *Oleh:* @${senderId.split('@')[0]}\n` +
                      `🔢 *Total peringatan:* ${warnCount}/3\n` +
                      `⏰ *Waktu:* ${moment().format('DD/MM/YYYY HH:mm')}\n\n` +
                      (warnCount >= 3 ? '🚨 *User telah mencapai batas maksimal peringatan!*' : ''),
                mentions: [mentionedJid, senderId]
            });

            // Auto-ban if warnings >= 3
            if (warnCount >= 3) {
                await this.groupManager.banUser(groupId, mentionedJid, 'Mencapai batas maksimal peringatan (3)', 'system', 60);
                await sock.groupParticipantsUpdate(groupId, [mentionedJid], 'remove');
                
                await sock.sendMessage(groupId, {
                    text: `🚫 *Auto-ban activated*\n\n@${mentionedJid.split('@')[0]} telah di-ban otomatis selama 1 jam karena mencapai 3 peringatan.`,
                    mentions: [mentionedJid]
                });
            }
        } catch (error) {
            console.error('Error warning user:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat memberi peringatan.'
            });
        }
    }

    // Add moderator command
    async handleAddModerator(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat menggunakan perintah ini.'
            });
        }

        const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) {
            return await sock.sendMessage(groupId, {
                text: '❌ Harap mention user yang ingin dijadikan moderator.'
            });
        }

        try {
            const group = this.groupManager.getGroup(groupId);
            if (group && !group.moderation.moderators.includes(mentionedJid)) {
                group.moderation.moderators.push(mentionedJid);
                await this.groupManager.updateGroup(groupId, group);
                
                await sock.sendMessage(groupId, {
                    text: `✅ *Moderator baru ditambahkan*\n\n` +
                          `👤 *User:* @${mentionedJid.split('@')[0]}\n` +
                          `👮 *Oleh:* @${senderId.split('@')[0]}\n` +
                          `⏰ *Waktu:* ${moment().format('DD/MM/YYYY HH:mm')}`,
                    mentions: [mentionedJid, senderId]
                });
            } else {
                await sock.sendMessage(groupId, {
                    text: '❌ User sudah menjadi moderator atau admin.'
                });
            }
        } catch (error) {
            console.error('Error adding moderator:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat menambah moderator.'
            });
        }
    }

    // Remove moderator command
    async handleRemoveModerator(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat menggunakan perintah ini.'
            });
        }

        const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) {
            return await sock.sendMessage(groupId, {
                text: '❌ Harap mention moderator yang ingin dihapus.'
            });
        }

        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                const index = group.moderation.moderators.indexOf(mentionedJid);
                if (index > -1) {
                    group.moderation.moderators.splice(index, 1);
                    await this.groupManager.updateGroup(groupId, group);
                    
                    await sock.sendMessage(groupId, {
                        text: `✅ *Moderator dihapus*\n\n` +
                              `👤 *User:* @${mentionedJid.split('@')[0]}\n` +
                              `👮 *Oleh:* @${senderId.split('@')[0]}\n` +
                              `⏰ *Waktu:* ${moment().format('DD/MM/YYYY HH:mm')}`,
                        mentions: [mentionedJid, senderId]
                    });
                } else {
                    await sock.sendMessage(groupId, {
                        text: '❌ User bukan moderator.'
                    });
                }
            }
        } catch (error) {
            console.error('Error removing moderator:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat menghapus moderator.'
            });
        }
    }

    // Show moderation logs
    async handleLogs(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        let senderId = msg.key.participant || msg.key.remoteJid;
        senderId = senderId.replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin/moderator yang dapat melihat log.'
            });
        }

        try {
            const group = this.groupManager.getGroup(groupId);
            if (group && group.moderation.logs.length > 0) {
                const limit = parseInt(args[0]) || 10;
                const recentLogs = group.moderation.logs.slice(-limit).reverse();
                
                let logText = `📋 *Log Moderasi (${limit} terakhir)*\n\n`;
                
                recentLogs.forEach((log, index) => {
                    const time = moment(log.timestamp).format('DD/MM HH:mm');
                    logText += `${index + 1}. *${log.action.toUpperCase()}*\n`;
                    logText += `   👤 Target: @${log.target.split('@')[0]}\n`;
                    logText += `   👮 Moderator: @${log.moderator.split('@')[0]}\n`;
                    if (log.reason) logText += `   📝 Alasan: ${log.reason}\n`;
                    if (log.duration) logText += `   ⏱️ Durasi: ${log.duration} menit\n`;
                    logText += `   ⏰ Waktu: ${time}\n\n`;
                });
                
                const mentions = recentLogs.flatMap(log => [log.target, log.moderator]);
                
                await sock.sendMessage(groupId, {
                    text: logText,
                    mentions: mentions
                });
            } else {
                await sock.sendMessage(groupId, {
                    text: '📋 *Log Moderasi*\n\nBelum ada aktivitas moderasi.'
                });
            }
        } catch (error) {
            console.error('Error showing logs:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat menampilkan log.'
            });
        }
    }

    // Show group info
    async handleGroupInfo(sock, msg) {
        const groupId = msg.key.remoteJid;
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                const totalUsers = Object.keys(group.analytics.activeUsers).length;
                const totalMessages = group.analytics.messageCount;
                const totalCommands = group.analytics.commandCount;
                const bannedCount = Object.keys(group.moderation.bannedUsers).length;
                const mutedCount = Object.keys(group.moderation.mutedUsers).length;
                const moderatorCount = group.moderation.moderators.length;
                const adminCount = group.moderation.admins.length;
                
                const infoText = `ℹ️ *Informasi Grup*\n\n` +
                               `📊 *Statistik:*\n` +
                               `• Total pengguna: ${totalUsers}\n` +
                               `• Total pesan: ${totalMessages}\n` +
                               `• Total perintah: ${totalCommands}\n\n` +
                               `👮 *Moderasi:*\n` +
                               `• Admin: ${adminCount}\n` +
                               `• Moderator: ${moderatorCount}\n` +
                               `• User di-ban: ${bannedCount}\n` +
                               `• User di-mute: ${mutedCount}\n\n` +
                               `⚙️ *Pengaturan:*\n` +
                               `• Bahasa: ${group.basic.language}\n` +
                               `• Zona waktu: ${group.basic.timezone}\n` +
                               `• Prefix: ${group.basic.prefix}\n` +
                               `• Anti-spam: ${group.moderation.antiSpam.enabled ? '✅' : '❌'}\n` +
                               `• Filter kata: ${group.moderation.wordFilter.enabled ? '✅' : '❌'}\n` +
                               `• Kontrol link: ${group.moderation.linkControl.enabled ? '✅' : '❌'}\n\n` +
                               `📅 *Dibuat:* ${moment(group.basic.createdAt).format('DD/MM/YYYY HH:mm')}`;
                
                await sock.sendMessage(groupId, {
                    text: infoText
                });
            } else {
                await sock.sendMessage(groupId, {
                    text: '❌ Grup belum diinisialisasi. Silakan restart bot atau hubungi admin.'
                });
            }
        } catch (error) {
            console.error('Error showing group info:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat menampilkan informasi grup.'
            });
        }
    }
}

module.exports = GroupAdminCommands;