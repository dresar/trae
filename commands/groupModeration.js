const GroupManager = require('../utils/groupManager');
const moment = require('moment');

class GroupModerationCommands {
    constructor() {
        this.groupManager = new GroupManager();
        this.spamTracker = new Map(); // Track user message frequency
        this.linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/gi;
    }

    // Check message for moderation violations
    async checkMessage(groupId, userId, messageText, sock) {
        const group = this.groupManager.getGroup(groupId);
        if (!group) return { shouldDelete: false };

        // Skip if user is admin/moderator
        if (this.groupManager.isModerator(groupId, userId)) {
            return { shouldDelete: false };
        }

        // Create mock message object for existing functions
        const mockMsg = {
            key: {
                remoteJid: groupId,
                participant: userId
            },
            message: {
                conversation: messageText
            }
        };

        // Check anti-spam
        if (group.moderation.antiSpam.enabled) {
            const spamResult = await this.handleAntiSpam(sock, mockMsg);
            if (spamResult) return { shouldDelete: true, reason: 'spam' };
        }

        // Check word filter
        if (group.moderation.wordFilter.enabled) {
            const wordResult = await this.handleWordFilter(sock, mockMsg);
            if (wordResult) return { shouldDelete: true, reason: 'banned_word' };
        }

        // Check link control
        if (group.moderation.linkControl.enabled) {
            const linkResult = await this.handleLinkControl(sock, mockMsg);
            if (linkResult) return { shouldDelete: true, reason: 'unauthorized_link' };
        }

        return { shouldDelete: false };
    }

    // Anti-spam system
    async handleAntiSpam(sock, msg) {
        const groupId = msg.key.remoteJid;
        const userId = msg.key.participant || msg.key.remoteJid;
        
        const group = this.groupManager.getGroup(groupId);
        if (!group || !group.moderation.antiSpam.enabled) return false;
        
        // Skip if user is admin/moderator
        if (this.groupManager.isModerator(groupId, userId)) return false;
        
        const now = Date.now();
        const userKey = `${groupId}_${userId}`;
        
        if (!this.spamTracker.has(userKey)) {
            this.spamTracker.set(userKey, []);
        }
        
        const userMessages = this.spamTracker.get(userKey);
        const timeWindow = group.moderation.antiSpam.timeWindow * 1000; // Convert to milliseconds
        
        // Remove old messages outside time window
        const recentMessages = userMessages.filter(timestamp => now - timestamp < timeWindow);
        recentMessages.push(now);
        this.spamTracker.set(userKey, recentMessages);
        
        if (recentMessages.length > group.moderation.antiSpam.maxMessages) {
            const action = group.moderation.antiSpam.action;
            const username = userId.split('@')[0];
            
            switch (action) {
                case 'warn':
                    const warnCount = await this.groupManager.warnUser(groupId, userId, 'Spam detected', 'system');
                    await sock.sendMessage(groupId, {
                        text: `⚠️ *Anti-Spam Warning*\n\n@${username} terdeteksi spam!\nPeringatan: ${warnCount}/3`,
                        mentions: [userId]
                    });
                    break;
                    
                case 'mute':
                    await this.groupManager.muteUser(groupId, userId, 'Spam detected', 'system', 10);
                    await sock.sendMessage(groupId, {
                        text: `🔇 *Anti-Spam Action*\n\n@${username} di-mute 10 menit karena spam.`,
                        mentions: [userId]
                    });
                    break;
                    
                case 'kick':
                    await this.groupManager.banUser(groupId, userId, 'Spam detected', 'system', 30);
                    await sock.groupParticipantsUpdate(groupId, [userId], 'remove');
                    await sock.sendMessage(groupId, {
                        text: `🚫 *Anti-Spam Action*\n\n@${username} di-kick karena spam.`,
                        mentions: [userId]
                    });
                    break;
            }
            
            // Clear spam tracker for this user
            this.spamTracker.delete(userKey);
            return true; // Message should be deleted
        }
        
        return false;
    }

    // Word filter system
    async handleWordFilter(sock, msg) {
        const groupId = msg.key.remoteJid;
        const userId = msg.key.participant || msg.key.remoteJid;
        
        const group = this.groupManager.getGroup(groupId);
        if (!group || !group.moderation.wordFilter.enabled) return false;
        
        // Skip if user is admin/moderator
        if (this.groupManager.isModerator(groupId, userId)) return false;
        
        const messageText = msg.message?.conversation || 
                           msg.message?.extendedTextMessage?.text || '';
        
        const blacklist = group.moderation.wordFilter.blacklist;
        const foundBadWords = blacklist.filter(word => 
            messageText.toLowerCase().includes(word.toLowerCase())
        );
        
        if (foundBadWords.length > 0) {
            const action = group.moderation.wordFilter.action;
            const username = userId.split('@')[0];
            
            switch (action) {
                case 'warn':
                    const warnCount = await this.groupManager.warnUser(
                        groupId, userId, `Menggunakan kata terlarang: ${foundBadWords.join(', ')}`, 'system'
                    );
                    await sock.sendMessage(groupId, {
                        text: `⚠️ *Word Filter Warning*\n\n@${username} menggunakan kata terlarang!\nPeringatan: ${warnCount}/3`,
                        mentions: [userId]
                    });
                    break;
                    
                case 'delete':
                    await sock.sendMessage(groupId, {
                        text: `🗑️ *Pesan dihapus*\n\n@${username}, pesan Anda mengandung kata terlarang.`,
                        mentions: [userId]
                    });
                    break;
                    
                case 'mute':
                    await this.groupManager.muteUser(groupId, userId, 'Menggunakan kata terlarang', 'system', 5);
                    await sock.sendMessage(groupId, {
                        text: `🔇 *Word Filter Action*\n\n@${username} di-mute 5 menit karena kata terlarang.`,
                        mentions: [userId]
                    });
                    break;
            }
            
            return true; // Message should be deleted
        }
        
        return false;
    }

    // Link control system
    async handleLinkControl(sock, msg) {
        const groupId = msg.key.remoteJid;
        const userId = msg.key.participant || msg.key.remoteJid;
        
        const group = this.groupManager.getGroup(groupId);
        if (!group || !group.moderation.linkControl.enabled) return false;
        
        // Skip if user is admin/moderator
        if (this.groupManager.isModerator(groupId, userId)) return false;
        
        const messageText = msg.message?.conversation || 
                           msg.message?.extendedTextMessage?.text || '';
        
        const links = messageText.match(this.linkRegex);
        if (links && links.length > 0) {
            const whitelist = group.moderation.linkControl.whitelist;
            const isWhitelisted = links.some(link => 
                whitelist.some(whiteLink => link.includes(whiteLink))
            );
            
            if (!isWhitelisted) {
                const action = group.moderation.linkControl.action;
                const username = userId.split('@')[0];
                
                switch (action) {
                    case 'warn':
                        const warnCount = await this.groupManager.warnUser(
                            groupId, userId, 'Mengirim link tanpa izin', 'system'
                        );
                        await sock.sendMessage(groupId, {
                            text: `⚠️ *Link Control Warning*\n\n@${username} mengirim link tanpa izin!\nPeringatan: ${warnCount}/3`,
                            mentions: [userId]
                        });
                        break;
                        
                    case 'delete':
                        await sock.sendMessage(groupId, {
                            text: `🔗 *Link dihapus*\n\n@${username}, link tidak diizinkan di grup ini.`,
                            mentions: [userId]
                        });
                        break;
                        
                    case 'mute':
                        await this.groupManager.muteUser(groupId, userId, 'Mengirim link tanpa izin', 'system', 5);
                        await sock.sendMessage(groupId, {
                            text: `🔇 *Link Control Action*\n\n@${username} di-mute 5 menit karena mengirim link.`,
                            mentions: [userId]
                        });
                        break;
                }
                
                return true; // Message should be deleted
            }
        }
        
        return false;
    }

    // Configure anti-spam
    async handleAntiSpam(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat mengkonfigurasi anti-spam.'
            });
        }

        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format: *.antispam [on/off] [max_pesan] [detik] [aksi]*\n\n' +
                      'Contoh:\n' +
                      '• `.antispam on 5 60 warn` - Aktifkan, max 5 pesan per 60 detik, beri peringatan\n' +
                      '• `.antispam off` - Matikan anti-spam\n\n' +
                      'Aksi yang tersedia: warn, mute, kick'
            });
        }

        const [status, maxMessages, timeWindow, action] = args;
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                if (status.toLowerCase() === 'off') {
                    group.moderation.antiSpam.enabled = false;
                    await this.groupManager.updateGroup(groupId, group);
                    
                    return await sock.sendMessage(groupId, {
                        text: '✅ *Anti-spam dimatikan*'
                    });
                }
                
                if (status.toLowerCase() === 'on') {
                    group.moderation.antiSpam.enabled = true;
                    if (maxMessages) group.moderation.antiSpam.maxMessages = parseInt(maxMessages) || 5;
                    if (timeWindow) group.moderation.antiSpam.timeWindow = parseInt(timeWindow) || 60;
                    if (action && ['warn', 'mute', 'kick'].includes(action.toLowerCase())) {
                        group.moderation.antiSpam.action = action.toLowerCase();
                    }
                    
                    await this.groupManager.updateGroup(groupId, group);
                    
                    return await sock.sendMessage(groupId, {
                        text: `✅ *Anti-spam dikonfigurasi*\n\n` +
                              `📊 *Pengaturan:*\n` +
                              `• Status: Aktif\n` +
                              `• Max pesan: ${group.moderation.antiSpam.maxMessages}\n` +
                              `• Jendela waktu: ${group.moderation.antiSpam.timeWindow} detik\n` +
                              `• Aksi: ${group.moderation.antiSpam.action}`
                    });
                }
            }
        } catch (error) {
            console.error('Error configuring anti-spam:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat mengkonfigurasi anti-spam.'
            });
        }
    }

    // Configure word filter
    async handleWordFilter(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat mengkonfigurasi word filter.'
            });
        }

        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format:\n' +
                      '• `.wordfilter on [aksi]` - Aktifkan filter\n' +
                      '• `.wordfilter off` - Matikan filter\n' +
                      '• `.wordfilter add kata1,kata2` - Tambah kata terlarang\n' +
                      '• `.wordfilter remove kata1,kata2` - Hapus kata terlarang\n' +
                      '• `.wordfilter list` - Lihat daftar kata terlarang\n\n' +
                      'Aksi yang tersedia: warn, delete, mute'
            });
        }

        const [command, ...params] = args;
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                switch (command.toLowerCase()) {
                    case 'on':
                        group.moderation.wordFilter.enabled = true;
                        if (params[0] && ['warn', 'delete', 'mute'].includes(params[0].toLowerCase())) {
                            group.moderation.wordFilter.action = params[0].toLowerCase();
                        }
                        await this.groupManager.updateGroup(groupId, group);
                        
                        return await sock.sendMessage(groupId, {
                            text: `✅ *Word filter diaktifkan*\n\n` +
                                  `⚙️ *Aksi:* ${group.moderation.wordFilter.action}\n` +
                                  `📝 *Kata terlarang:* ${group.moderation.wordFilter.blacklist.length} kata`
                        });
                        
                    case 'off':
                        group.moderation.wordFilter.enabled = false;
                        await this.groupManager.updateGroup(groupId, group);
                        
                        return await sock.sendMessage(groupId, {
                            text: '✅ *Word filter dimatikan*'
                        });
                        
                    case 'add':
                        if (params.length > 0) {
                            const newWords = params.join(' ').split(',').map(w => w.trim().toLowerCase());
                            const uniqueWords = newWords.filter(w => !group.moderation.wordFilter.blacklist.includes(w));
                            group.moderation.wordFilter.blacklist.push(...uniqueWords);
                            await this.groupManager.updateGroup(groupId, group);
                            
                            return await sock.sendMessage(groupId, {
                                text: `✅ *Kata terlarang ditambahkan*\n\n` +
                                      `📝 *Ditambahkan:* ${uniqueWords.join(', ')}\n` +
                                      `📊 *Total:* ${group.moderation.wordFilter.blacklist.length} kata`
                            });
                        }
                        break;
                        
                    case 'remove':
                        if (params.length > 0) {
                            const wordsToRemove = params.join(' ').split(',').map(w => w.trim().toLowerCase());
                            group.moderation.wordFilter.blacklist = group.moderation.wordFilter.blacklist
                                .filter(w => !wordsToRemove.includes(w));
                            await this.groupManager.updateGroup(groupId, group);
                            
                            return await sock.sendMessage(groupId, {
                                text: `✅ *Kata terlarang dihapus*\n\n` +
                                      `📝 *Dihapus:* ${wordsToRemove.join(', ')}\n` +
                                      `📊 *Sisa:* ${group.moderation.wordFilter.blacklist.length} kata`
                            });
                        }
                        break;
                        
                    case 'list':
                        const blacklist = group.moderation.wordFilter.blacklist;
                        if (blacklist.length > 0) {
                            return await sock.sendMessage(groupId, {
                                text: `📝 *Daftar Kata Terlarang*\n\n` +
                                      `${blacklist.map((word, i) => `${i + 1}. ${word}`).join('\n')}\n\n` +
                                      `📊 *Total:* ${blacklist.length} kata`
                            });
                        } else {
                            return await sock.sendMessage(groupId, {
                                text: '📝 *Daftar Kata Terlarang*\n\nBelum ada kata terlarang.'
                            });
                        }
                }
            }
        } catch (error) {
            console.error('Error configuring word filter:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat mengkonfigurasi word filter.'
            });
        }
    }

    // Configure link control
    async handleLinkControl(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat mengkonfigurasi link control.'
            });
        }

        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format:\n' +
                      '• `.linkcontrol on [aksi]` - Aktifkan kontrol link\n' +
                      '• `.linkcontrol off` - Matikan kontrol link\n' +
                      '• `.linkcontrol whitelist add domain.com` - Tambah domain ke whitelist\n' +
                      '• `.linkcontrol whitelist remove domain.com` - Hapus dari whitelist\n' +
                      '• `.linkcontrol whitelist list` - Lihat whitelist\n\n' +
                      'Aksi yang tersedia: warn, delete, mute'
            });
        }

        const [command, ...params] = args;
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                switch (command.toLowerCase()) {
                    case 'on':
                        group.moderation.linkControl.enabled = true;
                        if (params[0] && ['warn', 'delete', 'mute'].includes(params[0].toLowerCase())) {
                            group.moderation.linkControl.action = params[0].toLowerCase();
                        }
                        await this.groupManager.updateGroup(groupId, group);
                        
                        return await sock.sendMessage(groupId, {
                            text: `✅ *Link control diaktifkan*\n\n` +
                                  `⚙️ *Aksi:* ${group.moderation.linkControl.action}\n` +
                                  `📝 *Whitelist:* ${group.moderation.linkControl.whitelist.length} domain`
                        });
                        
                    case 'off':
                        group.moderation.linkControl.enabled = false;
                        await this.groupManager.updateGroup(groupId, group);
                        
                        return await sock.sendMessage(groupId, {
                            text: '✅ *Link control dimatikan*'
                        });
                        
                    case 'whitelist':
                        if (params[0] === 'add' && params[1]) {
                            const domain = params[1].toLowerCase();
                            if (!group.moderation.linkControl.whitelist.includes(domain)) {
                                group.moderation.linkControl.whitelist.push(domain);
                                await this.groupManager.updateGroup(groupId, group);
                                
                                return await sock.sendMessage(groupId, {
                                    text: `✅ *Domain ditambahkan ke whitelist*\n\n` +
                                          `🔗 *Domain:* ${domain}\n` +
                                          `📊 *Total whitelist:* ${group.moderation.linkControl.whitelist.length}`
                                });
                            } else {
                                return await sock.sendMessage(groupId, {
                                    text: '❌ Domain sudah ada dalam whitelist.'
                                });
                            }
                        } else if (params[0] === 'remove' && params[1]) {
                            const domain = params[1].toLowerCase();
                            const index = group.moderation.linkControl.whitelist.indexOf(domain);
                            if (index > -1) {
                                group.moderation.linkControl.whitelist.splice(index, 1);
                                await this.groupManager.updateGroup(groupId, group);
                                
                                return await sock.sendMessage(groupId, {
                                    text: `✅ *Domain dihapus dari whitelist*\n\n` +
                                          `🔗 *Domain:* ${domain}\n` +
                                          `📊 *Sisa whitelist:* ${group.moderation.linkControl.whitelist.length}`
                                });
                            } else {
                                return await sock.sendMessage(groupId, {
                                    text: '❌ Domain tidak ditemukan dalam whitelist.'
                                });
                            }
                        } else if (params[0] === 'list') {
                            const whitelist = group.moderation.linkControl.whitelist;
                            if (whitelist.length > 0) {
                                return await sock.sendMessage(groupId, {
                                    text: `🔗 *Whitelist Domain*\n\n` +
                                          `${whitelist.map((domain, i) => `${i + 1}. ${domain}`).join('\n')}\n\n` +
                                          `📊 *Total:* ${whitelist.length} domain`
                                });
                            } else {
                                return await sock.sendMessage(groupId, {
                                    text: '🔗 *Whitelist Domain*\n\nBelum ada domain dalam whitelist.'
                                });
                            }
                        }
                        break;
                }
            }
        } catch (error) {
            console.error('Error configuring link control:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat mengkonfigurasi link control.'
            });
        }
    }

    // Auto-delete messages
    async handleAutoDelete(sock, msg) {
        const groupId = msg.key.remoteJid;
        const userId = msg.key.participant || msg.key.remoteJid;
        
        const group = this.groupManager.getGroup(groupId);
        if (!group || !group.moderation.autoDelete.enabled) return;
        
        // Skip if user is admin/moderator
        if (this.groupManager.isModerator(groupId, userId)) return;
        
        const messageTypes = group.moderation.autoDelete.types;
        const delay = group.moderation.autoDelete.delay * 1000; // Convert to milliseconds
        
        let shouldDelete = false;
        
        // Check message type
        if (messageTypes.includes('sticker') && msg.message?.stickerMessage) shouldDelete = true;
        if (messageTypes.includes('image') && msg.message?.imageMessage) shouldDelete = true;
        if (messageTypes.includes('video') && msg.message?.videoMessage) shouldDelete = true;
        if (messageTypes.includes('audio') && msg.message?.audioMessage) shouldDelete = true;
        if (messageTypes.includes('document') && msg.message?.documentMessage) shouldDelete = true;
        
        if (shouldDelete) {
            setTimeout(async () => {
                try {
                    await sock.sendMessage(groupId, { delete: msg.key });
                } catch (error) {
                    console.error('Error auto-deleting message:', error);
                }
            }, delay);
        }
    }

    // Configure auto-delete
    async handleAutoDelete(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat mengkonfigurasi auto-delete.'
            });
        }

        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format:\n' +
                      '• `.autodelete on [detik] [tipe1,tipe2]` - Aktifkan auto-delete\n' +
                      '• `.autodelete off` - Matikan auto-delete\n\n' +
                      'Contoh: `.autodelete on 300 sticker,image,video`\n\n' +
                      'Tipe yang tersedia: sticker, image, video, audio, document'
            });
        }

        const [status, delay, types] = args;
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                if (status.toLowerCase() === 'off') {
                    group.moderation.autoDelete.enabled = false;
                    await this.groupManager.updateGroup(groupId, group);
                    
                    return await sock.sendMessage(groupId, {
                        text: '✅ *Auto-delete dimatikan*'
                    });
                }
                
                if (status.toLowerCase() === 'on') {
                    group.moderation.autoDelete.enabled = true;
                    if (delay) group.moderation.autoDelete.delay = parseInt(delay) || 300;
                    if (types) {
                        const validTypes = ['sticker', 'image', 'video', 'audio', 'document'];
                        const selectedTypes = types.split(',').map(t => t.trim().toLowerCase())
                            .filter(t => validTypes.includes(t));
                        group.moderation.autoDelete.types = selectedTypes;
                    }
                    
                    await this.groupManager.updateGroup(groupId, group);
                    
                    return await sock.sendMessage(groupId, {
                        text: `✅ *Auto-delete dikonfigurasi*\n\n` +
                              `📊 *Pengaturan:*\n` +
                              `• Status: Aktif\n` +
                              `• Delay: ${group.moderation.autoDelete.delay} detik\n` +
                              `• Tipe: ${group.moderation.autoDelete.types.join(', ')}`
                    });
                }
            }
        } catch (error) {
            console.error('Error configuring auto-delete:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat mengkonfigurasi auto-delete.'
            });
        }
    }

    // Process all moderation checks
    async processMessage(sock, msg) {
        try {
            const groupId = msg.key.remoteJid;
            const userId = msg.key.participant || msg.key.remoteJid;
            
            // Skip if not a group message
            if (!groupId.endsWith('@g.us')) return;
            
            // Skip if user is muted
            if (this.groupManager.isMuted(groupId, userId)) {
                await sock.sendMessage(groupId, { delete: msg.key });
                return;
            }
            
            // Skip if user is banned
            if (this.groupManager.isBanned(groupId, userId)) {
                await sock.groupParticipantsUpdate(groupId, [userId], 'remove');
                return;
            }
            
            let shouldDelete = false;
            
            // Run all moderation checks
            if (await this.handleAntiSpam(sock, msg)) shouldDelete = true;
            if (await this.handleWordFilter(sock, msg)) shouldDelete = true;
            if (await this.handleLinkControl(sock, msg)) shouldDelete = true;
            
            // Delete message if any check failed
            if (shouldDelete) {
                await sock.sendMessage(groupId, { delete: msg.key });
            }
            
            // Handle auto-delete (runs independently)
            await this.handleAutoDelete(sock, msg);
            
        } catch (error) {
            console.error('Error processing moderation:', error);
        }
    }
}

module.exports = GroupModerationCommands;