const cron = require('node-cron');
const { formatDate, generateId } = require('../utils/helpers');
const { loadDatabase, saveDatabase } = require('../utils/database');

// Store active schedules
const activeSchedules = new Map();

/**
 * Handle schedule commands
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {string} command - Command name
 * @param {Array} args - Command arguments
 */
async function handleScheduleCommand(sock, msg, command, args) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    try {
        switch (command) {
            case 'schedule':
            case 'jadwal':
                await handleCreateSchedule(sock, msg, args);
                break;
                
            case 'reminder':
            case 'remind':
                await handleCreateReminder(sock, msg, args);
                break;
                
            case 'listschedule':
            case 'listjadwal':
                await handleListSchedules(sock, msg, args);
                break;
                
            case 'deleteschedule':
            case 'hapusjadwal':
                await handleDeleteSchedule(sock, msg, args);
                break;
                
            case 'agenda':
                await handleAgenda(sock, msg, args);
                break;
                
            case 'meeting':
            case 'rapat':
                await handleMeeting(sock, msg, args);
                break;
                
            case 'deadline':
                await handleDeadline(sock, msg, args);
                break;
                
            case 'event':
            case 'acara':
                await handleEvent(sock, msg, args);
                break;
                
            default:
                await sock.sendMessage(from, {
                    text: '📅 *Schedule Commands*\n\nGunakan: schedule, reminder, listschedule, deleteschedule, agenda, meeting, deadline, event'
                });
        }
    } catch (error) {
        console.error('Error in schedule command:', error);
        await sock.sendMessage(from, {
            text: '❌ *Terjadi kesalahan pada schedule command*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle create schedule
 */
async function handleCreateSchedule(sock, msg, args) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    if (args.length < 3) {
        await sock.sendMessage(from, {
            text: '📅 *Buat Jadwal*\n\n📝 *Cara penggunaan:*\n`.schedule [tanggal] [waktu] [deskripsi]`\n\n📋 *Contoh:*\n`.schedule 2024-01-15 09:00 Rapat KKN`\n`.schedule tomorrow 14:30 Presentasi laporan`\n`.schedule 15/01/2024 10:00 Survey lokasi`\n\n🕐 *Format waktu:* HH:MM (24 jam)\n📅 *Format tanggal:*\n• YYYY-MM-DD\n• DD/MM/YYYY\n• tomorrow, today\n\n💡 *Tips:* Bot akan mengirim reminder 1 jam sebelum jadwal'
        });
        return;
    }
    
    const dateStr = args[0];
    const timeStr = args[1];
    const description = args.slice(2).join(' ');
    
    try {
        const scheduleDate = parseScheduleDate(dateStr, timeStr);
        
        if (!scheduleDate || scheduleDate < new Date()) {
            await sock.sendMessage(from, {
                text: '❌ *Tanggal atau waktu tidak valid*\n\nPastikan tanggal di masa depan dan format benar.'
            });
            return;
        }
        
        const scheduleId = generateId();
        const schedule = {
            id: scheduleId,
            type: 'schedule',
            title: description,
            description: description,
            date: scheduleDate.toISOString(),
            creator: sender,
            group: from,
            status: 'active',
            createdAt: new Date().toISOString(),
            reminders: [
                { time: new Date(scheduleDate.getTime() - 60 * 60 * 1000), sent: false }, // 1 hour before
                { time: new Date(scheduleDate.getTime() - 15 * 60 * 1000), sent: false }  // 15 minutes before
            ]
        };
        
        // Save to database
        const data = await loadDatabase('schedules') || { schedules: [], settings: {} };
        data.schedules = data.schedules || []; // Ensure schedules array exists
        data.schedules.push(schedule);
        await saveDatabase('schedules', data);
        
        // Create cron job
        createScheduleCronJob(sock, schedule);
        
        let message = `📅 *Jadwal Berhasil Dibuat*\n\n`;
        message += `🆔 *ID:* ${scheduleId}\n`;
        message += `📝 *Deskripsi:* ${description}\n`;
        message += `📅 *Tanggal:* ${formatDate(scheduleDate)}\n`;
        message += `🕐 *Waktu:* ${scheduleDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}\n`;
        message += `👤 *Dibuat oleh:* @${sender.split('@')[0]}\n\n`;
        message += `🔔 *Reminder akan dikirim:*\n`;
        message += `• 1 jam sebelumnya\n`;
        message += `• 15 menit sebelumnya\n\n`;
        message += `💡 *Tips:* Gunakan \`.listschedule\` untuk melihat semua jadwal`;
        
        await sock.sendMessage(from, {
            text: message,
            mentions: [sender]
        });
        
    } catch (error) {
        console.error('Error creating schedule:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal membuat jadwal*\n\nPastikan format tanggal dan waktu benar.'
        });
    }
}

/**
 * Handle create reminder
 */
async function handleCreateReminder(sock, msg, args) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    if (args.length < 2) {
        await sock.sendMessage(from, {
            text: '⏰ *Buat Reminder*\n\n📝 *Cara penggunaan:*\n`.reminder [waktu] [pesan]`\n\n📋 *Contoh:*\n`.reminder 30m Istirahat sejenak`\n`.reminder 2h Cek laporan KKN`\n`.reminder 1d Deadline proposal`\n`.reminder 15:30 Meeting dengan dosen`\n\n⏱️ *Format waktu:*\n• Xm = X menit\n• Xh = X jam\n• Xd = X hari\n• HH:MM = waktu spesifik hari ini\n\n💡 *Tips:* Reminder akan dikirim sekali saja'
        });
        return;
    }
    
    const timeStr = args[0];
    const message = args.slice(1).join(' ');
    
    try {
        const reminderDate = parseReminderTime(timeStr);
        
        if (!reminderDate || reminderDate < new Date()) {
            await sock.sendMessage(from, {
                text: '❌ *Waktu reminder tidak valid*\n\nPastikan waktu di masa depan dan format benar.'
            });
            return;
        }
        
        const reminderId = generateId();
        const reminder = {
            id: reminderId,
            type: 'reminder',
            title: message,
            message: message,
            date: reminderDate.toISOString(),
            creator: sender,
            group: from,
            status: 'active',
            createdAt: new Date().toISOString()
        };
        
        // Save to database
        const data = await loadDatabase('schedules') || { schedules: [], settings: {} };
        data.schedules = data.schedules || []; // Ensure schedules array exists
        data.schedules.push(reminder);
        await saveDatabase('schedules', data);
        
        // Create cron job
        createReminderCronJob(sock, reminder);
        
        let responseMessage = `⏰ *Reminder Berhasil Dibuat*\n\n`;
        responseMessage += `🆔 *ID:* ${reminderId}\n`;
        responseMessage += `💬 *Pesan:* ${message}\n`;
        responseMessage += `📅 *Tanggal:* ${formatDate(reminderDate)}\n`;
        responseMessage += `🕐 *Waktu:* ${reminderDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}\n`;
        responseMessage += `👤 *Dibuat oleh:* @${sender.split('@')[0]}\n\n`;
        responseMessage += `⏳ *Akan diingatkan dalam:* ${getTimeUntil(reminderDate)}`;
        
        await sock.sendMessage(from, {
            text: responseMessage,
            mentions: [sender]
        });
        
    } catch (error) {
        console.error('Error creating reminder:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal membuat reminder*\n\nPastikan format waktu benar.'
        });
    }
}

/**
 * Handle list schedules
 */
async function handleListSchedules(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    try {
        const data = await loadDatabase('schedules') || { schedules: [], settings: {} };
        const schedules = (data.schedules || []).filter(s => 
            s.group === from && 
            s.status === 'active' &&
            new Date(s.date) > new Date()
        );
        
        if (schedules.length === 0) {
            await sock.sendMessage(from, {
                text: '📅 *Tidak ada jadwal aktif*\n\nBelum ada jadwal yang dibuat untuk grup ini.\n\n💡 *Tips:* Gunakan `.schedule` untuk membuat jadwal baru'
            });
            return;
        }
        
        // Sort by date
        schedules.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        let message = `📅 *Daftar Jadwal Aktif*\n\n`;
        
        schedules.slice(0, 10).forEach((schedule, index) => {
            const date = new Date(schedule.date);
            const timeUntil = getTimeUntil(date);
            
            message += `${index + 1}. **${schedule.title}**\n`;
            message += `   🆔 ID: ${schedule.id}\n`;
            message += `   📅 ${formatDate(date)}\n`;
            message += `   🕐 ${date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}\n`;
            message += `   ⏳ ${timeUntil}\n`;
            message += `   👤 @${schedule.creator.split('@')[0]}\n\n`;
        });
        
        if (schedules.length > 10) {
            message += `📊 *Menampilkan 10 dari ${schedules.length} jadwal*\n`;
        }
        
        message += `💡 *Tips:* Gunakan \`.deleteschedule [ID]\` untuk menghapus jadwal`;
        
        const mentions = schedules.slice(0, 10).map(s => s.creator);
        
        await sock.sendMessage(from, {
            text: message,
            mentions: mentions
        });
        
    } catch (error) {
        console.error('Error listing schedules:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal memuat daftar jadwal*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle delete schedule
 */
async function handleDeleteSchedule(sock, msg, args) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '🗑️ *Hapus Jadwal*\n\n📝 *Cara penggunaan:*\n`.deleteschedule [ID]`\n\n📋 *Contoh:*\n`.deleteschedule abc123`\n\n💡 *Tips:* Gunakan `.listschedule` untuk melihat ID jadwal'
        });
        return;
    }
    
    const scheduleId = args[0];
    
    try {
        const data = await loadDatabase('schedules') || { schedules: [], settings: {} };
        const scheduleIndex = data.schedules.findIndex(s => s.id === scheduleId && s.group === from);
        
        if (scheduleIndex === -1) {
            await sock.sendMessage(from, {
                text: '❌ *Jadwal tidak ditemukan*\n\nPastikan ID jadwal benar dan jadwal ada di grup ini.'
            });
            return;
        }
        
        const schedule = data.schedules[scheduleIndex];
        
        // Check if user is creator or admin
        const { isAdmin } = require('../utils/helpers');
        if (schedule.creator !== sender && !isAdmin(sender)) {
            await sock.sendMessage(from, {
                text: '❌ *Tidak ada izin*\n\nHanya pembuat jadwal atau admin yang dapat menghapus jadwal.'
            });
            return;
        }
        
        // Remove from database
        data.schedules.splice(scheduleIndex, 1);
        await saveDatabase('schedules', data);
        
        // Cancel cron job
        if (activeSchedules.has(scheduleId)) {
            activeSchedules.get(scheduleId).destroy();
            activeSchedules.delete(scheduleId);
        }
        
        let message = `🗑️ *Jadwal Berhasil Dihapus*\n\n`;
        message += `🆔 *ID:* ${scheduleId}\n`;
        message += `📝 *Judul:* ${schedule.title}\n`;
        message += `📅 *Tanggal:* ${formatDate(new Date(schedule.date))}\n`;
        message += `👤 *Dihapus oleh:* @${sender.split('@')[0]}`;
        
        await sock.sendMessage(from, {
            text: message,
            mentions: [sender]
        });
        
    } catch (error) {
        console.error('Error deleting schedule:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal menghapus jadwal*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle agenda command
 */
async function handleAgenda(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    try {
        const data = await loadDatabase('schedules') || { schedules: [], settings: {} };
        const today = new Date();
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        
        const todaySchedules = (data.schedules || []).filter(s => 
            s.group === from && 
            s.status === 'active' &&
            isSameDay(new Date(s.date), today)
        );
        
        const tomorrowSchedules = (data.schedules || []).filter(s => 
            s.group === from && 
            s.status === 'active' &&
            isSameDay(new Date(s.date), tomorrow)
        );
        
        let message = `📋 *Agenda KKN*\n\n`;
        
        // Today's agenda
        message += `📅 **Hari Ini (${formatDate(today)})**\n`;
        if (todaySchedules.length === 0) {
            message += `   Tidak ada jadwal\n\n`;
        } else {
            todaySchedules.sort((a, b) => new Date(a.date) - new Date(b.date));
            todaySchedules.forEach((schedule, index) => {
                const time = new Date(schedule.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                message += `   ${index + 1}. ${time} - ${schedule.title}\n`;
            });
            message += `\n`;
        }
        
        // Tomorrow's agenda
        message += `📅 **Besok (${formatDate(tomorrow)})**\n`;
        if (tomorrowSchedules.length === 0) {
            message += `   Tidak ada jadwal\n\n`;
        } else {
            tomorrowSchedules.sort((a, b) => new Date(a.date) - new Date(b.date));
            tomorrowSchedules.forEach((schedule, index) => {
                const time = new Date(schedule.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                message += `   ${index + 1}. ${time} - ${schedule.title}\n`;
            });
            message += `\n`;
        }
        
        message += `⏰ *Diperbarui:* ${new Date().toLocaleString('id-ID')}`;
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error getting agenda:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal memuat agenda*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle meeting command
 */
async function handleMeeting(sock, msg, args) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    if (args.length < 4) {
        await sock.sendMessage(from, {
            text: '🤝 *Jadwal Meeting*\n\n📝 *Cara penggunaan:*\n`.meeting [tanggal] [waktu] [durasi] [topik]`\n\n📋 *Contoh:*\n`.meeting 2024-01-15 14:00 2h Evaluasi KKN`\n`.meeting tomorrow 09:30 90m Presentasi hasil`\n\n⏱️ *Format durasi:*\n• Xm = X menit\n• Xh = X jam\n• X = X menit (default)\n\n💡 *Tips:* Meeting akan otomatis diingatkan 30 menit sebelumnya'
        });
        return;
    }
    
    const dateStr = args[0];
    const timeStr = args[1];
    const durationStr = args[2];
    const topic = args.slice(3).join(' ');
    
    try {
        const meetingDate = parseScheduleDate(dateStr, timeStr);
        const duration = parseDuration(durationStr);
        
        if (!meetingDate || meetingDate < new Date()) {
            await sock.sendMessage(from, {
                text: '❌ *Tanggal atau waktu tidak valid*\n\nPastikan tanggal di masa depan dan format benar.'
            });
            return;
        }
        
        const meetingId = generateId();
        const meeting = {
            id: meetingId,
            type: 'meeting',
            title: `Meeting: ${topic}`,
            description: topic,
            date: meetingDate.toISOString(),
            duration: duration,
            creator: sender,
            group: from,
            status: 'active',
            createdAt: new Date().toISOString(),
            reminders: [
                { time: new Date(meetingDate.getTime() - 30 * 60 * 1000), sent: false } // 30 minutes before
            ]
        };
        
        // Save to database
        const data = await loadDatabase('schedules') || { schedules: [], settings: {} };
        data.schedules.push(meeting);
        await saveDatabase('schedules', data);
        
        // Create cron job
        createScheduleCronJob(sock, meeting);
        
        const endTime = new Date(meetingDate.getTime() + duration * 60 * 1000);
        
        let message = `🤝 *Meeting Berhasil Dijadwalkan*\n\n`;
        message += `🆔 *ID:* ${meetingId}\n`;
        message += `📝 *Topik:* ${topic}\n`;
        message += `📅 *Tanggal:* ${formatDate(meetingDate)}\n`;
        message += `🕐 *Waktu:* ${meetingDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}\n`;
        message += `⏱️ *Durasi:* ${formatDuration(duration)}\n`;
        message += `👤 *Dibuat oleh:* @${sender.split('@')[0]}\n\n`;
        message += `🔔 *Reminder akan dikirim 30 menit sebelumnya*`;
        
        await sock.sendMessage(from, {
            text: message,
            mentions: [sender]
        });
        
    } catch (error) {
        console.error('Error creating meeting:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal membuat jadwal meeting*\n\nPastikan format tanggal, waktu, dan durasi benar.'
        });
    }
}

/**
 * Handle deadline command
 */
async function handleDeadline(sock, msg, args) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    if (args.length < 3) {
        await sock.sendMessage(from, {
            text: '⏰ *Deadline Tracker*\n\n📝 *Cara penggunaan:*\n`.deadline [tanggal] [waktu] [tugas]`\n\n📋 *Contoh:*\n`.deadline 2024-01-20 23:59 Laporan KKN`\n`.deadline next week 17:00 Presentasi`\n\n💡 *Tips:* Deadline akan diingatkan 3 hari, 1 hari, dan 1 jam sebelumnya'
        });
        return;
    }
    
    const dateStr = args[0];
    const timeStr = args[1];
    const task = args.slice(2).join(' ');
    
    try {
        const deadlineDate = parseScheduleDate(dateStr, timeStr);
        
        if (!deadlineDate || deadlineDate < new Date()) {
            await sock.sendMessage(from, {
                text: '❌ *Tanggal atau waktu tidak valid*\n\nPastikan deadline di masa depan dan format benar.'
            });
            return;
        }
        
        const deadlineId = generateId();
        const deadline = {
            id: deadlineId,
            type: 'deadline',
            title: `Deadline: ${task}`,
            description: task,
            date: deadlineDate.toISOString(),
            creator: sender,
            group: from,
            status: 'active',
            createdAt: new Date().toISOString(),
            reminders: [
                { time: new Date(deadlineDate.getTime() - 3 * 24 * 60 * 60 * 1000), sent: false }, // 3 days before
                { time: new Date(deadlineDate.getTime() - 24 * 60 * 60 * 1000), sent: false },     // 1 day before
                { time: new Date(deadlineDate.getTime() - 60 * 60 * 1000), sent: false }          // 1 hour before
            ].filter(r => r.time > new Date()) // Only future reminders
        };
        
        // Save to database
        const data = await loadDatabase('schedules') || { schedules: [], settings: {} };
        data.schedules.push(deadline);
        await saveDatabase('schedules', data);
        
        // Create cron job
        createScheduleCronJob(sock, deadline);
        
        let message = `⏰ *Deadline Berhasil Ditambahkan*\n\n`;
        message += `🆔 *ID:* ${deadlineId}\n`;
        message += `📝 *Tugas:* ${task}\n`;
        message += `📅 *Deadline:* ${formatDate(deadlineDate)}\n`;
        message += `🕐 *Waktu:* ${deadlineDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}\n`;
        message += `👤 *Dibuat oleh:* @${sender.split('@')[0]}\n\n`;
        message += `⏳ *Sisa waktu:* ${getTimeUntil(deadlineDate)}\n\n`;
        message += `🔔 *Reminder akan dikirim:*\n`;
        
        deadline.reminders.forEach(reminder => {
            const reminderDate = new Date(reminder.time);
            message += `• ${getTimeUntil(reminderDate)} (${formatDate(reminderDate)})\n`;
        });
        
        await sock.sendMessage(from, {
            text: message,
            mentions: [sender]
        });
        
    } catch (error) {
        console.error('Error creating deadline:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal membuat deadline*\n\nPastikan format tanggal dan waktu benar.'
        });
    }
}

/**
 * Handle event command
 */
async function handleEvent(sock, msg, args) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    if (args.length < 4) {
        await sock.sendMessage(from, {
            text: '🎉 *Event Organizer*\n\n📝 *Cara penggunaan:*\n`.event [tanggal] [waktu] [lokasi] [deskripsi]`\n\n📋 *Contoh:*\n`.event 2024-01-25 08:00 "Balai Desa" Gotong royong`\n`.event tomorrow 19:00 Online Webinar KKN`\n\n💡 *Tips:* Event akan diingatkan 1 hari dan 2 jam sebelumnya'
        });
        return;
    }
    
    const dateStr = args[0];
    const timeStr = args[1];
    const location = args[2];
    const description = args.slice(3).join(' ');
    
    try {
        const eventDate = parseScheduleDate(dateStr, timeStr);
        
        if (!eventDate || eventDate < new Date()) {
            await sock.sendMessage(from, {
                text: '❌ *Tanggal atau waktu tidak valid*\n\nPastikan tanggal di masa depan dan format benar.'
            });
            return;
        }
        
        const eventId = generateId();
        const event = {
            id: eventId,
            type: 'event',
            title: `Event: ${description}`,
            description: description,
            location: location,
            date: eventDate.toISOString(),
            creator: sender,
            group: from,
            status: 'active',
            createdAt: new Date().toISOString(),
            reminders: [
                { time: new Date(eventDate.getTime() - 24 * 60 * 60 * 1000), sent: false }, // 1 day before
                { time: new Date(eventDate.getTime() - 2 * 60 * 60 * 1000), sent: false }   // 2 hours before
            ].filter(r => r.time > new Date())
        };
        
        // Save to database
        const data = await loadDatabase('schedules') || { schedules: [], settings: {} };
        data.schedules.push(event);
        await saveDatabase('schedules', data);
        
        // Create cron job
        createScheduleCronJob(sock, event);
        
        let message = `🎉 *Event Berhasil Dibuat*\n\n`;
        message += `🆔 *ID:* ${eventId}\n`;
        message += `📝 *Deskripsi:* ${description}\n`;
        message += `📍 *Lokasi:* ${location}\n`;
        message += `📅 *Tanggal:* ${formatDate(eventDate)}\n`;
        message += `🕐 *Waktu:* ${eventDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}\n`;
        message += `👤 *Dibuat oleh:* @${sender.split('@')[0]}\n\n`;
        message += `⏳ *Dimulai dalam:* ${getTimeUntil(eventDate)}`;
        
        await sock.sendMessage(from, {
            text: message,
            mentions: [sender]
        });
        
    } catch (error) {
        console.error('Error creating event:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal membuat event*\n\nPastikan format tanggal dan waktu benar.'
        });
    }
}

/**
 * Parse schedule date from string
 */
function parseScheduleDate(dateStr, timeStr) {
    try {
        if (!dateStr || !timeStr) return null;
        const rawDate = String(dateStr).trim().toLowerCase();
        const rawTime = String(timeStr).trim();

        let targetDate;
        const today = new Date();

        // Handle special keywords first
        switch (rawDate) {
            case 'today':
            case 'hari ini':
                targetDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                break;
            case 'tomorrow':
            case 'besok':
                {
                    const tmr = new Date(today);
                    tmr.setDate(tmr.getDate() + 1);
                    targetDate = new Date(tmr.getFullYear(), tmr.getMonth(), tmr.getDate());
                }
                break;
            case 'next week':
            case 'minggu depan':
                {
                    const nxt = new Date(today);
                    nxt.setDate(nxt.getDate() + 7);
                    targetDate = new Date(nxt.getFullYear(), nxt.getMonth(), nxt.getDate());
                }
                break;
            default: {
                // Try to parse explicit date formats
                // 1) DD/MM/YYYY
                const slashMatch = rawDate.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/);
                // 2) YYYY-MM-DD
                const isoDashMatch = rawDate.match(/^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/);
                // 3) DD-MM-YYYY
                const dmyDashMatch = rawDate.match(/^\s*(\d{1,2})-(\d{1,2})-(\d{4})\s*$/);

                if (slashMatch) {
                    const day = parseInt(slashMatch[1], 10);
                    const month = parseInt(slashMatch[2], 10);
                    const year = parseInt(slashMatch[3], 10);
                    targetDate = new Date(year, month - 1, day);
                } else if (isoDashMatch) {
                    const year = parseInt(isoDashMatch[1], 10);
                    const month = parseInt(isoDashMatch[2], 10);
                    const day = parseInt(isoDashMatch[3], 10);
                    targetDate = new Date(year, month - 1, day);
                } else if (dmyDashMatch) {
                    const day = parseInt(dmyDashMatch[1], 10);
                    const month = parseInt(dmyDashMatch[2], 10);
                    const year = parseInt(dmyDashMatch[3], 10);
                    targetDate = new Date(year, month - 1, day);
                } else {
                    return null;
                }

                if (isNaN(targetDate?.getTime())) return null;
            }
        }

        // Parse time (support HH:MM or HH.MM)
        const timeMatch = rawTime.match(/^(\d{1,2})[:.](\d{2})$/);
        if (!timeMatch) return null;
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return null;
        }

        targetDate.setHours(hours, minutes, 0, 0);
        return targetDate;
    } catch (error) {
        return null;
    }
}

/**
 * Parse reminder time from string
 */
function parseReminderTime(timeStr) {
    try {
        const now = new Date();
        
        // Check if it's a specific time (HH:MM)
        if (timeStr.includes(':')) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes)) return null;
            
            const targetTime = new Date();
            targetTime.setHours(hours, minutes, 0, 0);
            
            // If time has passed today, set for tomorrow
            if (targetTime <= now) {
                targetTime.setDate(targetTime.getDate() + 1);
            }
            
            return targetTime;
        }
        
        // Parse relative time (Xm, Xh, Xd)
        const match = timeStr.match(/^(\d+)([mhd])$/i);
        if (!match) return null;
        
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        let milliseconds;
        switch (unit) {
            case 'm':
                milliseconds = value * 60 * 1000;
                break;
            case 'h':
                milliseconds = value * 60 * 60 * 1000;
                break;
            case 'd':
                milliseconds = value * 24 * 60 * 60 * 1000;
                break;
            default:
                return null;
        }
        
        return new Date(now.getTime() + milliseconds);
        
    } catch (error) {
        return null;
    }
}

/**
 * Parse duration string
 */
function parseDuration(durationStr) {
    const match = durationStr.match(/^(\d+)([mh]?)$/i);
    if (!match) return 60; // Default 60 minutes
    
    const value = parseInt(match[1]);
    const unit = match[2]?.toLowerCase() || 'm';
    
    switch (unit) {
        case 'h':
            return value * 60;
        case 'm':
        default:
            return value;
    }
}

/**
 * Format duration in minutes to readable string
 */
function formatDuration(minutes) {
    if (minutes < 60) {
        return `${minutes} menit`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
        return `${hours} jam`;
    }
    
    return `${hours} jam ${remainingMinutes} menit`;
}

/**
 * Get time until target date
 */
function getTimeUntil(targetDate) {
    const now = new Date();
    const diff = targetDate - now;
    
    if (diff <= 0) return 'Sudah lewat';
    
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    
    if (days > 0) {
        return `${days} hari ${hours} jam`;
    } else if (hours > 0) {
        return `${hours} jam ${minutes} menit`;
    } else {
        return `${minutes} menit`;
    }
}

/**
 * Check if two dates are the same day
 */
function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

/**
 * Create cron job for schedule
 */
function createScheduleCronJob(sock, schedule) {
    const scheduleDate = new Date(schedule.date);
    
    // Create reminder jobs
    if (schedule.reminders) {
        schedule.reminders.forEach((reminder, index) => {
            const reminderDate = new Date(reminder.time);
            
            if (reminderDate > new Date()) {
                const cronExpression = `${reminderDate.getMinutes()} ${reminderDate.getHours()} ${reminderDate.getDate()} ${reminderDate.getMonth() + 1} *`;
                
                const job = cron.schedule(cronExpression, async () => {
                    await sendScheduleReminder(sock, schedule, index);
                }, {
                    scheduled: true,
                    timezone: 'Asia/Jakarta'
                });
                
                activeSchedules.set(`${schedule.id}_reminder_${index}`, job);
            }
        });
    }
    
    // Create main schedule job
    const cronExpression = `${scheduleDate.getMinutes()} ${scheduleDate.getHours()} ${scheduleDate.getDate()} ${scheduleDate.getMonth() + 1} *`;
    
    const mainJob = cron.schedule(cronExpression, async () => {
        await sendScheduleNotification(sock, schedule);
    }, {
        scheduled: true,
        timezone: 'Asia/Jakarta'
    });
    
    activeSchedules.set(schedule.id, mainJob);
}

/**
 * Create cron job for reminder
 */
function createReminderCronJob(sock, reminder) {
    const reminderDate = new Date(reminder.date);
    const cronExpression = `${reminderDate.getMinutes()} ${reminderDate.getHours()} ${reminderDate.getDate()} ${reminderDate.getMonth() + 1} *`;
    
    const job = cron.schedule(cronExpression, async () => {
        await sendReminderNotification(sock, reminder);
    }, {
        scheduled: true,
        timezone: 'Asia/Jakarta'
    });
    
    activeSchedules.set(reminder.id, job);
}

/**
 * Send schedule reminder
 */
async function sendScheduleReminder(sock, schedule, reminderIndex) {
    try {
        const scheduleDate = new Date(schedule.date);
        const timeUntil = getTimeUntil(scheduleDate);
        
        let message = `🔔 *Reminder Jadwal*\n\n`;
        message += `📝 *${schedule.title}*\n`;
        message += `📅 ${formatDate(scheduleDate)}\n`;
        message += `🕐 ${scheduleDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}\n`;
        
        if (schedule.location) {
            message += `📍 *Lokasi:* ${schedule.location}\n`;
        }
        
        message += `⏳ *Dimulai dalam:* ${timeUntil}\n\n`;
        message += `👤 *Dibuat oleh:* @${schedule.creator.split('@')[0]}\n\n`;
        
        await sock.sendMessage(schedule.group, {
            text: message,
            mentions: [schedule.creator]
        });
        
        // Mark reminder as sent
        const data = await loadDatabase('schedules');
        const scheduleData = data.schedules.find(s => s.id === schedule.id);
        if (scheduleData && scheduleData.reminders[reminderIndex]) {
            scheduleData.reminders[reminderIndex].sent = true;
            await saveDatabase('schedules', data);
        }
        
    } catch (error) {
        console.error('Error sending schedule reminder:', error);
    }
}

/**
 * Send schedule notification
 */
async function sendScheduleNotification(sock, schedule) {
    try {
        let message = `⏰ *Waktunya ${schedule.type}!*\n\n`;
        message += `📝 *${schedule.title}*\n`;
        
        if (schedule.location) {
            message += `📍 *Lokasi:* ${schedule.location}\n`;
        }
        
        if (schedule.duration) {
            message += `⏱️ *Durasi:* ${formatDuration(schedule.duration)}\n`;
        }
        
        message += `\n👤 *Dibuat oleh:* @${schedule.creator.split('@')[0]}`;
        
        await sock.sendMessage(schedule.group, {
            text: message,
            mentions: [schedule.creator]
        });
        
        // Mark schedule as completed
        const data = await loadDatabase('schedules');
        const scheduleData = data.schedules.find(s => s.id === schedule.id);
        if (scheduleData) {
            scheduleData.status = 'completed';
            await saveDatabase('schedules', data);
        }
        
        // Remove from active schedules
        if (activeSchedules.has(schedule.id)) {
            activeSchedules.get(schedule.id).destroy();
            activeSchedules.delete(schedule.id);
        }
        
    } catch (error) {
        console.error('Error sending schedule notification:', error);
    }
}

/**
 * Send reminder notification
 */
async function sendReminderNotification(sock, reminder) {
    try {
        let message = `⏰ *Reminder*\n\n`;
        message += `💬 ${reminder.message}\n\n`;
        message += `👤 *Dibuat oleh:* @${reminder.creator.split('@')[0]}`;
        
        await sock.sendMessage(reminder.group, {
            text: message,
            mentions: [reminder.creator]
        });
        
        // Mark reminder as completed
        const data = await loadDatabase('schedules');
        const reminderData = data.schedules.find(s => s.id === reminder.id);
        if (reminderData) {
            reminderData.status = 'completed';
            await saveDatabase('schedules', data);
        }
        
        // Remove from active schedules
        if (activeSchedules.has(reminder.id)) {
            activeSchedules.get(reminder.id).destroy();
            activeSchedules.delete(reminder.id);
        }
        
    } catch (error) {
        console.error('Error sending reminder notification:', error);
    }
}

/**
 * Initialize schedules on startup
 */
async function initializeSchedules(sock) {
    try {
        const data = await loadDatabase('schedules') || { schedules: [], settings: {} };
        if (!data || !data.schedules) return;
        
        const activeSchedulesList = (data.schedules || []).filter(s => 
            s.status === 'active' && 
            new Date(s.date) > new Date()
        );
        
        activeSchedulesList.forEach(schedule => {
            if (schedule.type === 'reminder') {
                createReminderCronJob(sock, schedule);
            } else {
                createScheduleCronJob(sock, schedule);
            }
        });
        
        console.log(`Initialized ${activeSchedulesList.length} active schedules`);
        
    } catch (error) {
        console.error('Error initializing schedules:', error);
    }
}

module.exports = {
    handleScheduleCommand,
    initializeSchedules
};