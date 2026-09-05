const GroupManager = require('../utils/groupManager');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

class GroupUtilitiesCommands {
    constructor() {
        this.groupManager = new GroupManager();
        this.activePolls = new Map();
        this.reminderTimers = new Map();
    }

    // Handle welcome message for new members
    async handleWelcomeMessage(sock, groupId, participant) {
        try {
            const group = this.groupManager.getGroup(groupId);
            if (!group || !group.features.welcome.enabled) return;
            
            await this.groupManager.addUser(groupId, participant);
            
            const welcomeMessage = group.features.welcome.message
                .replace('{user}', `@${participant.split('@')[0]}`)
                .replace('{group}', group.basic.name || 'Grup');
            
            const messageOptions = {
                text: `🎉 *Selamat Datang!*\n\n${welcomeMessage}`,
                mentions: [participant]
            };
            
            await sock.sendMessage(groupId, messageOptions);
        } catch (error) {
            console.error('Error sending welcome message:', error);
        }
    }

    // Handle goodbye message for leaving members
    async handleGoodbyeMessage(sock, groupId, participant) {
        try {
            const group = this.groupManager.getGroup(groupId);
            if (!group || !group.features.goodbye.enabled) return;
            
            const goodbyeMessage = group.features.goodbye.message
                .replace('{user}', `@${participant.split('@')[0]}`)
                .replace('{group}', group.basic.name || 'Grup');
            
            const messageOptions = {
                text: `👋 *Selamat Tinggal!*\n\n${goodbyeMessage}`,
                mentions: [participant]
            };
            
            await sock.sendMessage(groupId, messageOptions);
        } catch (error) {
            console.error('Error sending goodbye message:', error);
        }
    }

    // Handle user join (welcome message) - Legacy function
    async handleUserJoin(sock, groupId, participants) {
        try {
            const group = this.groupManager.getGroup(groupId);
            if (!group || !group.features.welcome.enabled) return;
            
            for (const participant of participants) {
                await this.groupManager.addUser(groupId, participant);
                
                const welcomeMessage = group.features.welcome.message
                    .replace('{user}', `@${participant.split('@')[0]}`)
                    .replace('{group}', group.basic.name || 'Grup');
                
                const messageOptions = {
                    text: `🎉 *Selamat Datang!*\n\n${welcomeMessage}`,
                    mentions: [participant]
                };
                
                // Add media if configured
                if (group.features.welcome.media) {
                    // Handle media attachment (image/video/sticker)
                    // This would need to be implemented based on media storage
                }
                
                await sock.sendMessage(groupId, messageOptions);
                
                // Auto-assign role if configured
                if (group.features.welcome.autoRole) {
                    // Implementation for auto-role assignment
                }
            }
        } catch (error) {
            console.error('Error handling user join:', error);
        }
    }

    // Handle welcome command
    async handleWelcome(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        
        // DEBUG: trace entry and args
        try {
            console.log('[DEBUG] handleWelcome called', { groupId, sender, args });
        } catch {}
        
        if (args.length === 0) {
            // DEBUG: sending usage message
            try {
                console.log('[DEBUG] handleWelcome sending usage message');
            } catch {}
            try {
                await sock.sendMessage(groupId, {
                    text: `🎉 *Pengaturan Welcome Message*\n\n*Penggunaan:*\n• .welcome on - Aktifkan welcome\n• .welcome off - Matikan welcome\n• .welcome set <pesan> - Atur pesan welcome\n• .welcome status - Lihat status welcome\n\n*Placeholder yang tersedia:*\n• {user} - Mention user baru\n• {group} - Nama grup`
                });
            } catch (err) {
                console.error('[DEBUG] handleWelcome send usage failed:', err?.message || err);
            }
            return;
        }
        
        await this.handleConfigWelcome(sock, msg, args);
    }
    
    // Handle goodbye command
    async handleGoodbye(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        
        if (args.length === 0) {
            await sock.sendMessage(groupId, {
                text: `👋 *Pengaturan Goodbye Message*

*Penggunaan:*
• .goodbye on - Aktifkan goodbye
• .goodbye off - Matikan goodbye
• .goodbye set <pesan> - Atur pesan goodbye
• .goodbye status - Lihat status goodbye

*Placeholder yang tersedia:*
• {user} - Mention user yang keluar
• {group} - Nama grup`
            });
            return;
        }
        
        await this.handleConfigGoodbye(sock, msg, args);
    }
    
    // Handle poll command
    async handlePoll(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        
        if (args.length === 0) {
            await sock.sendMessage(groupId, {
                text: `📊 *Pengaturan Polling*

*Penggunaan:*
• .poll create <pertanyaan> | <opsi1> | <opsi2> | ... - Buat polling
• .poll vote <id> <nomor_opsi> - Vote polling
• .poll result <id> - Lihat hasil polling
• .poll close <id> - Tutup polling
• .poll list - Lihat daftar polling aktif

*Contoh:*
.poll create Makanan favorit? | Nasi Gudeg | Sate Ayam | Bakso`
            });
            return;
        }
        
        const subCommand = args[0].toLowerCase();
        const restArgs = args.slice(1);
        
        switch (subCommand) {
            case 'create':
                await this.handleCreatePoll(sock, msg, restArgs);
                break;
            case 'vote':
                await this.handleVote(sock, msg, restArgs);
                break;
            case 'result':
                await this.handlePollResult(sock, msg, restArgs);
                break;
            case 'close':
                await this.handleClosePoll(sock, msg, restArgs);
                break;
            case 'list':
                await this.handleListPolls(sock, msg);
                break;
            default:
                await sock.sendMessage(groupId, {
                    text: '❌ Sub-command tidak valid. Gunakan: create, vote, result, close, atau list'
                });
        }
    }

    // Handle user leave (goodbye message)
    async handleUserLeave(sock, groupId, participants) {
        try {
            const group = this.groupManager.getGroup(groupId);
            if (!group || !group.features.goodbye.enabled) return;
            
            for (const participant of participants) {
                const goodbyeMessage = group.features.goodbye.message
                    .replace('{user}', `@${participant.split('@')[0]}`)
                    .replace('{group}', group.basic.name || 'Grup');
                
                await sock.sendMessage(groupId, {
                    text: `👋 *Selamat Tinggal!*\n\n${goodbyeMessage}`,
                    mentions: [participant]
                });
            }
        } catch (error) {
            console.error('Error handling user leave:', error);
        }
    }

    // Configure welcome message
    async handleConfigWelcome(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const rawSenderId = msg.key.participant || msg.key.remoteJid;
        const senderId = rawSenderId.replace('@s.whatsapp.net', '');
        
        // Debug logging untuk troubleshooting
        try {
            console.log('[DEBUG] handleConfigWelcome called', {
                groupId,
                rawSenderId,
                senderId,
                args
            });
            
            const { normalizeSenderToPhone } = require('../utils/helpers');
            const normalizedSender = normalizeSenderToPhone(rawSenderId);
            console.log('[DEBUG] Sender normalization', {
                rawSenderId,
                normalizedSender
            });
            
            const isAdminResult = this.groupManager.isAdmin(groupId, rawSenderId);
            console.log('[DEBUG] Admin check result', {
                isAdmin: isAdminResult,
                checkedWith: rawSenderId
            });
        } catch (debugError) {
            console.error('[DEBUG] Error in debug logging:', debugError);
        }
        
        if (!this.groupManager.isAdmin(groupId, rawSenderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat mengkonfigurasi pesan selamat datang.'
            });
        }

        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format:\n' +
                      '• `.welcome on [pesan]` - Aktifkan welcome message\n' +
                      '• `.welcome off` - Matikan welcome message\n' +
                      '• `.welcome test` - Test welcome message\n\n' +
                      'Variabel yang tersedia:\n' +
                      '• {user} - Mention user\n' +
                      '• {group} - Nama grup\n\n' +
                      'Contoh: `.welcome on Halo {user}! Selamat datang di {group} 👋`'
            });
        }

        const [command, ...params] = args;
        
        try {
            let group = this.groupManager.getGroup(groupId);
            
            // Initialize group if it doesn't exist
            if (!group) {
                console.log('[DEBUG] Group not found, initializing:', groupId);
                await this.groupManager.initializeGroup(groupId, 'Unknown Group', rawSenderId);
                group = this.groupManager.getGroup(groupId);
                console.log('[DEBUG] Group initialized:', !!group);
            }
            
            if (group) {
                console.log('[DEBUG] Group found, processing command:', command.toLowerCase());
                switch (command.toLowerCase()) {
                    case 'on':
                        group.features.welcome.enabled = true;
                        if (params.length > 0) {
                            group.features.welcome.message = params.join(' ');
                        }
                        await this.groupManager.updateGroup(groupId, group);
                        
                        console.log('[DEBUG] Sending welcome on response');
                        return await sock.sendMessage(groupId, {
                            text: `✅ *Welcome message diaktifkan*\n\n` +
                                  `📝 *Pesan:* ${group.features.welcome.message}`
                        });
                        
                    case 'off':
                        group.features.welcome.enabled = false;
                        await this.groupManager.updateGroup(groupId, group);
                        
                        return await sock.sendMessage(groupId, {
                            text: '✅ *Welcome message dimatikan*'
                        });
                        
                    case 'test':
                        const testMessage = group.features.welcome.message
                            .replace('{user}', `@${senderId.split('@')[0]}`)
                            .replace('{group}', group.basic.name || 'Grup');
                        
                        return await sock.sendMessage(groupId, {
                            text: `🧪 *Test Welcome Message*\n\n${testMessage}`,
                            mentions: [senderId]
                        });
                }
            } else {
                console.log('[DEBUG] Group still null after initialization attempt');
                await sock.sendMessage(groupId, {
                    text: '❌ Gagal menginisialisasi grup. Silakan coba lagi.'
                });
            }
        } catch (error) {
            console.error('[DEBUG] Error configuring welcome:', error);
            console.error('[DEBUG] Error stack:', error.stack);
            try {
                await sock.sendMessage(groupId, {
                    text: '❌ Terjadi kesalahan saat mengkonfigurasi welcome message.'
                });
            } catch (sendError) {
                console.error('[DEBUG] Failed to send error message:', sendError);
            }
        }
    }

    // Configure goodbye message
    async handleConfigGoodbye(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat mengkonfigurasi pesan perpisahan.'
            });
        }

        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format:\n' +
                      '• `.goodbye on [pesan]` - Aktifkan goodbye message\n' +
                      '• `.goodbye off` - Matikan goodbye message\n\n' +
                      'Variabel yang tersedia:\n' +
                      '• {user} - Mention user\n' +
                      '• {group} - Nama grup\n\n' +
                      'Contoh: `.goodbye on Selamat tinggal {user}! Semoga sukses selalu 👋`'
            });
        }

        const [command, ...params] = args;
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                switch (command.toLowerCase()) {
                    case 'on':
                        group.features.goodbye.enabled = true;
                        if (params.length > 0) {
                            group.features.goodbye.message = params.join(' ');
                        }
                        await this.groupManager.updateGroup(groupId, group);
                        
                        return await sock.sendMessage(groupId, {
                            text: `✅ *Goodbye message diaktifkan*\n\n` +
                                  `📝 *Pesan:* ${group.features.goodbye.message}`
                        });
                        
                    case 'off':
                        group.features.goodbye.enabled = false;
                        await this.groupManager.updateGroup(groupId, group);
                        
                        return await sock.sendMessage(groupId, {
                            text: '✅ *Goodbye message dimatikan*'
                        });
                }
            }
        } catch (error) {
            console.error('Error configuring goodbye:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat mengkonfigurasi goodbye message.'
            });
        }
    }

    // Manage group rules
    async handleRules(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (args.length < 1) {
            // Show current rules
            const group = this.groupManager.getGroup(groupId);
            if (group && group.features.rules.content) {
                const lastUpdated = group.features.rules.lastUpdated ? 
                    moment(group.features.rules.lastUpdated).format('DD/MM/YYYY HH:mm') : 'Tidak diketahui';
                const updatedBy = group.features.rules.updatedBy ? 
                    `@${group.features.rules.updatedBy.split('@')[0]}` : 'Tidak diketahui';
                
                return await sock.sendMessage(groupId, {
                    text: `📋 *Aturan Grup*\n\n${group.features.rules.content}\n\n` +
                          `📅 *Terakhir diperbarui:* ${lastUpdated}\n` +
                          `👤 *Oleh:* ${updatedBy}`,
                    mentions: group.features.rules.updatedBy ? [group.features.rules.updatedBy] : []
                });
            } else {
                return await sock.sendMessage(groupId, {
                    text: '📋 *Aturan Grup*\n\nBelum ada aturan yang ditetapkan.\n\nAdmin dapat menambahkan aturan dengan: `.rules set [aturan]`'
                });
            }
        }

        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat mengubah aturan grup.'
            });
        }

        const [command, ...params] = args;
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                switch (command.toLowerCase()) {
                    case 'set':
                        if (params.length > 0) {
                            group.features.rules.content = params.join(' ');
                            group.features.rules.lastUpdated = moment().toISOString();
                            group.features.rules.updatedBy = senderId;
                            await this.groupManager.updateGroup(groupId, group);
                            
                            return await sock.sendMessage(groupId, {
                                text: `✅ *Aturan grup berhasil diperbarui*\n\n` +
                                      `📋 *Aturan baru:*\n${group.features.rules.content}\n\n` +
                                      `👤 *Diperbarui oleh:* @${senderId.split('@')[0]}`,
                                mentions: [senderId]
                            });
                        } else {
                            return await sock.sendMessage(groupId, {
                                text: '❌ Format: `.rules set [aturan]`\n\nContoh: `.rules set 1. Sopan santun\n2. No spam\n3. No SARA`'
                            });
                        }
                        
                    case 'clear':
                        group.features.rules.content = '';
                        group.features.rules.lastUpdated = moment().toISOString();
                        group.features.rules.updatedBy = senderId;
                        await this.groupManager.updateGroup(groupId, group);
                        
                        return await sock.sendMessage(groupId, {
                            text: `✅ *Aturan grup dihapus*\n\n👤 *Oleh:* @${senderId.split('@')[0]}`,
                            mentions: [senderId]
                        });
                }
            }
        } catch (error) {
            console.error('Error managing rules:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat mengelola aturan.'
            });
        }
    }

    // Create poll
    async handleCreatePoll(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (args.length < 3) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format: `.poll [pertanyaan] | [opsi1] | [opsi2] | [opsi3] ...`\n\n' +
                      'Contoh: `.poll Makanan favorit? | Pizza | Burger | Sushi | Nasi Goreng`\n\n' +
                      'Maksimal 10 opsi, minimal 2 opsi.'
            });
        }

        try {
            const pollData = args.join(' ').split('|').map(item => item.trim());
            const question = pollData[0];
            const options = pollData.slice(1);
            
            if (options.length < 2 || options.length > 10) {
                return await sock.sendMessage(groupId, {
                    text: '❌ Poll harus memiliki minimal 2 opsi dan maksimal 10 opsi.'
                });
            }
            
            const pollId = uuidv4().substring(0, 8);
            const poll = {
                id: pollId,
                question: question,
                options: options.map((option, index) => ({
                    id: index + 1,
                    text: option,
                    votes: []
                })),
                createdBy: senderId,
                createdAt: moment().toISOString(),
                isActive: true
            };
            
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                group.features.polls.active[pollId] = poll;
                await this.groupManager.updateGroup(groupId, group);
                
                let pollText = `📊 *POLLING*\n\n` +
                              `❓ *Pertanyaan:* ${question}\n\n` +
                              `📋 *Pilihan:*\n`;
                
                options.forEach((option, index) => {
                    pollText += `${index + 1}️⃣ ${option}\n`;
                });
                
                pollText += `\n🗳️ *Cara voting:* Ketik \`.vote ${pollId} [nomor]\`\n` +
                           `📊 *Lihat hasil:* \`.pollresult ${pollId}\`\n` +
                           `🆔 *Poll ID:* \`${pollId}\`\n\n` +
                           `👤 *Dibuat oleh:* @${senderId.split('@')[0]}`;
                
                await sock.sendMessage(groupId, {
                    text: pollText,
                    mentions: [senderId]
                });
            }
        } catch (error) {
            console.error('Error creating poll:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat membuat poll.'
            });
        }
    }

    // Vote in poll
    async handleVote(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (args.length < 2) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format: `.vote [poll_id] [nomor_pilihan]`\n\nContoh: `.vote abc123 2`'
            });
        }

        const [pollId, optionNumber] = args;
        const optionIndex = parseInt(optionNumber) - 1;
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group && group.features.polls.active[pollId]) {
                const poll = group.features.polls.active[pollId];
                
                if (!poll.isActive) {
                    return await sock.sendMessage(groupId, {
                        text: '❌ Poll ini sudah ditutup.'
                    });
                }
                
                if (optionIndex < 0 || optionIndex >= poll.options.length) {
                    return await sock.sendMessage(groupId, {
                        text: `❌ Pilihan tidak valid. Pilih nomor 1-${poll.options.length}.`
                    });
                }
                
                // Remove previous vote from this user
                poll.options.forEach(option => {
                    const voteIndex = option.votes.indexOf(senderId);
                    if (voteIndex > -1) {
                        option.votes.splice(voteIndex, 1);
                    }
                });
                
                // Add new vote
                poll.options[optionIndex].votes.push(senderId);
                
                await this.groupManager.updateGroup(groupId, group);
                
                await sock.sendMessage(groupId, {
                    text: `✅ *Vote berhasil!*\n\n` +
                          `📊 *Poll:* ${poll.question}\n` +
                          `🗳️ *Pilihan Anda:* ${poll.options[optionIndex].text}\n` +
                          `👤 *Voter:* @${senderId.split('@')[0]}`,
                    mentions: [senderId]
                });
            } else {
                await sock.sendMessage(groupId, {
                    text: '❌ Poll tidak ditemukan atau sudah berakhir.'
                });
            }
        } catch (error) {
            console.error('Error voting:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat voting.'
            });
        }
    }

    // Show poll results
    async handlePollResult(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        
        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format: `.pollresult [poll_id]`\n\nContoh: `.pollresult abc123`'
            });
        }

        const pollId = args[0];
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group && group.features.polls.active[pollId]) {
                const poll = group.features.polls.active[pollId];
                const totalVotes = poll.options.reduce((sum, option) => sum + option.votes.length, 0);
                
                let resultText = `📊 *HASIL POLLING*\n\n` +
                               `❓ *Pertanyaan:* ${poll.question}\n` +
                               `🗳️ *Total suara:* ${totalVotes}\n\n` +
                               `📋 *Hasil:*\n`;
                
                poll.options.forEach((option, index) => {
                    const percentage = totalVotes > 0 ? Math.round((option.votes.length / totalVotes) * 100) : 0;
                    const bar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
                    
                    resultText += `\n${index + 1}️⃣ *${option.text}*\n`;
                    resultText += `${bar} ${percentage}% (${option.votes.length} suara)\n`;
                });
                
                resultText += `\n🆔 *Poll ID:* \`${pollId}\`\n` +
                             `👤 *Dibuat oleh:* @${poll.createdBy.split('@')[0]}\n` +
                             `📅 *Dibuat:* ${moment(poll.createdAt).format('DD/MM/YYYY HH:mm')}`;
                
                await sock.sendMessage(groupId, {
                    text: resultText,
                    mentions: [poll.createdBy]
                });
            } else {
                await sock.sendMessage(groupId, {
                    text: '❌ Poll tidak ditemukan.'
                });
            }
        } catch (error) {
            console.error('Error showing poll result:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat menampilkan hasil poll.'
            });
        }
    }

    // Close poll
    async handleClosePoll(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format: `.closepoll [poll_id]`\n\nContoh: `.closepoll abc123`'
            });
        }

        const pollId = args[0];
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group && group.features.polls.active[pollId]) {
                const poll = group.features.polls.active[pollId];
                
                // Check if user is poll creator or admin
                if (poll.createdBy !== senderId && !this.groupManager.isAdmin(groupId, senderId)) {
                    return await sock.sendMessage(groupId, {
                        text: '❌ Hanya pembuat poll atau admin yang dapat menutup poll.'
                    });
                }
                
                poll.isActive = false;
                poll.closedAt = moment().toISOString();
                poll.closedBy = senderId;
                
                // Move to history
                group.features.polls.history.push(poll);
                delete group.features.polls.active[pollId];
                
                await this.groupManager.updateGroup(groupId, group);
                
                // Show final results
                await this.handlePollResult(sock, { key: { remoteJid: groupId } }, [pollId]);
                
                await sock.sendMessage(groupId, {
                    text: `🔒 *Poll ditutup*\n\n` +
                          `🆔 *Poll ID:* \`${pollId}\`\n` +
                          `👤 *Ditutup oleh:* @${senderId.split('@')[0]}`,
                    mentions: [senderId]
                });
            } else {
                await sock.sendMessage(groupId, {
                    text: '❌ Poll tidak ditemukan atau sudah ditutup.'
                });
            }
        } catch (error) {
            console.error('Error closing poll:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat menutup poll.'
            });
        }
    }

    // List active polls
    async handleListPolls(sock, msg) {
        const groupId = msg.key.remoteJid;
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                const activePolls = Object.values(group.features.polls.active);
                
                if (activePolls.length === 0) {
                    return await sock.sendMessage(groupId, {
                        text: '📊 *Daftar Poll Aktif*\n\nTidak ada poll yang sedang aktif.'
                    });
                }
                
                let listText = `📊 *Daftar Poll Aktif*\n\n`;
                
                activePolls.forEach((poll, index) => {
                    const totalVotes = poll.options.reduce((sum, option) => sum + option.votes.length, 0);
                    listText += `${index + 1}. *${poll.question}*\n`;
                    listText += `   🆔 ID: \`${poll.id}\`\n`;
                    listText += `   🗳️ Total suara: ${totalVotes}\n`;
                    listText += `   👤 Dibuat: @${poll.createdBy.split('@')[0]}\n\n`;
                });
                
                const mentions = activePolls.map(poll => poll.createdBy);
                
                await sock.sendMessage(groupId, {
                    text: listText,
                    mentions: mentions
                });
            }
        } catch (error) {
            console.error('Error listing polls:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat menampilkan daftar poll.'
            });
        }
    }

    // Create reminder
    async handleReminder(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (args.length < 3) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format: `.reminder [waktu] [unit] [pesan]`\n\n' +
                      'Unit waktu: m (menit), h (jam), d (hari)\n\n' +
                      'Contoh:\n' +
                      '• `.reminder 30 m Meeting dalam 30 menit`\n' +
                      '• `.reminder 2 h Jangan lupa makan siang`\n' +
                      '• `.reminder 1 d Deadline project besok`'
            });
        }

        const [time, unit, ...messageParts] = args;
        const message = messageParts.join(' ');
        const timeValue = parseInt(time);
        
        if (isNaN(timeValue) || timeValue <= 0) {
            return await sock.sendMessage(groupId, {
                text: '❌ Waktu harus berupa angka positif.'
            });
        }
        
        let milliseconds;
        let unitText;
        
        switch (unit.toLowerCase()) {
            case 'm':
            case 'menit':
                milliseconds = timeValue * 60 * 1000;
                unitText = 'menit';
                break;
            case 'h':
            case 'jam':
                milliseconds = timeValue * 60 * 60 * 1000;
                unitText = 'jam';
                break;
            case 'd':
            case 'hari':
                milliseconds = timeValue * 24 * 60 * 60 * 1000;
                unitText = 'hari';
                break;
            default:
                return await sock.sendMessage(groupId, {
                    text: '❌ Unit waktu tidak valid. Gunakan: m (menit), h (jam), d (hari)'
                });
        }
        
        try {
            const reminderId = uuidv4().substring(0, 8);
            const reminderTime = moment().add(timeValue, unit.toLowerCase()).toISOString();
            
            const reminder = {
                id: reminderId,
                message: message,
                createdBy: senderId,
                createdAt: moment().toISOString(),
                reminderTime: reminderTime,
                isActive: true
            };
            
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                group.features.reminders[reminderId] = reminder;
                await this.groupManager.updateGroup(groupId, group);
                
                // Set timer
                const timer = setTimeout(async () => {
                    try {
                        await sock.sendMessage(groupId, {
                            text: `⏰ *PENGINGAT*\n\n` +
                                  `📝 *Pesan:* ${message}\n\n` +
                                  `👤 *Dari:* @${senderId.split('@')[0]}\n` +
                                  `🕐 *Dibuat:* ${moment(reminder.createdAt).format('DD/MM/YYYY HH:mm')}`,
                            mentions: [senderId]
                        });
                        
                        // Remove from active reminders
                        const updatedGroup = this.groupManager.getGroup(groupId);
                        if (updatedGroup && updatedGroup.features.reminders[reminderId]) {
                            delete updatedGroup.features.reminders[reminderId];
                            await this.groupManager.updateGroup(groupId, updatedGroup);
                        }
                        
                        this.reminderTimers.delete(reminderId);
                    } catch (error) {
                        console.error('Error sending reminder:', error);
                    }
                }, milliseconds);
                
                this.reminderTimers.set(reminderId, timer);
                
                await sock.sendMessage(groupId, {
                    text: `✅ *Pengingat berhasil dibuat*\n\n` +
                          `📝 *Pesan:* ${message}\n` +
                          `⏰ *Waktu:* ${timeValue} ${unitText}\n` +
                          `🕐 *Akan diingatkan:* ${moment(reminderTime).format('DD/MM/YYYY HH:mm')}\n` +
                          `🆔 *ID:* \`${reminderId}\`\n` +
                          `👤 *Dibuat oleh:* @${senderId.split('@')[0]}`,
                    mentions: [senderId]
                });
            }
        } catch (error) {
            console.error('Error creating reminder:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat membuat pengingat.'
            });
        }
    }

    // List active reminders
    async handleListReminders(sock, msg) {
        const groupId = msg.key.remoteJid;
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                const reminders = Object.values(group.features.reminders);
                
                if (reminders.length === 0) {
                    return await sock.sendMessage(groupId, {
                        text: '⏰ *Daftar Pengingat*\n\nTidak ada pengingat yang aktif.'
                    });
                }
                
                let listText = `⏰ *Daftar Pengingat Aktif*\n\n`;
                
                reminders.forEach((reminder, index) => {
                    const timeLeft = moment(reminder.reminderTime).fromNow();
                    listText += `${index + 1}. *${reminder.message}*\n`;
                    listText += `   🆔 ID: \`${reminder.id}\`\n`;
                    listText += `   ⏰ Waktu: ${timeLeft}\n`;
                    listText += `   👤 Dibuat: @${reminder.createdBy.split('@')[0]}\n\n`;
                });
                
                const mentions = reminders.map(reminder => reminder.createdBy);
                
                await sock.sendMessage(groupId, {
                    text: listText,
                    mentions: mentions
                });
            }
        } catch (error) {
            console.error('Error listing reminders:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat menampilkan daftar pengingat.'
            });
        }
    }

    // Cancel reminder
    async handleCancelReminder(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format: `.cancelreminder [reminder_id]`\n\nContoh: `.cancelreminder abc123`'
            });
        }

        const reminderId = args[0];
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group && group.features.reminders[reminderId]) {
                const reminder = group.features.reminders[reminderId];
                
                // Check if user is reminder creator or admin
                if (reminder.createdBy !== senderId && !this.groupManager.isAdmin(groupId, senderId)) {
                    return await sock.sendMessage(groupId, {
                        text: '❌ Hanya pembuat pengingat atau admin yang dapat membatalkan pengingat.'
                    });
                }
                
                // Clear timer
                if (this.reminderTimers.has(reminderId)) {
                    clearTimeout(this.reminderTimers.get(reminderId));
                    this.reminderTimers.delete(reminderId);
                }
                
                // Remove from database
                delete group.features.reminders[reminderId];
                await this.groupManager.updateGroup(groupId, group);
                
                await sock.sendMessage(groupId, {
                    text: `✅ *Pengingat dibatalkan*\n\n` +
                          `📝 *Pesan:* ${reminder.message}\n` +
                          `🆔 *ID:* \`${reminderId}\`\n` +
                          `👤 *Dibatalkan oleh:* @${senderId.split('@')[0]}`,
                    mentions: [senderId]
                });
            } else {
                await sock.sendMessage(groupId, {
                    text: '❌ Pengingat tidak ditemukan atau sudah berakhir.'
                });
            }
        } catch (error) {
            console.error('Error canceling reminder:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat membatalkan pengingat.'
            });
        }
    }
}

module.exports = GroupUtilitiesCommands;