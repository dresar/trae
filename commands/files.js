const fs = require('fs-extra');
const path = require('path');
const { formatFileSize, generateId, isAllowedFileType, getFileExtension } = require('../utils/helpers');
const { loadDatabase, saveDatabase } = require('../utils/database');
const DriveEngine = require('../utils/driveEngine');

// Initialize Drive Engine
const driveEngine = new DriveEngine();

// Function to detect file type based on extension
function detectFileType(extension) {
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff'];
    const videoTypes = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', '3gp', 'webm', 'm4v'];
    const audioTypes = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus'];
    const documentTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp'];
    const archiveTypes = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'];
    
    if (imageTypes.includes(extension)) return 'images';
    if (videoTypes.includes(extension)) return 'videos';
    if (audioTypes.includes(extension)) return 'audio';
    if (documentTypes.includes(extension)) return 'documents';
    if (archiveTypes.includes(extension)) return 'archives';
    
    return 'others';
}

/**
 * Handle file management commands
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {string} command - Command name
 * @param {Array} args - Command arguments
 */
async function handleFileCommand(sock, msg, command, args) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    
    try {
        switch (command) {
            case 'upload':
            case 'save':
                await handleFileUpload(sock, msg, args);
                break;
                
            case 'download':
            case 'get':
                await handleFileDownload(sock, msg, args);
                break;
                
            case 'list':
            case 'files':
                await handleFileList(sock, msg, args);
                break;
                
            case 'kknfiles':
            case 'listkkn':
                await handleKKNFileList(sock, msg, args);
                break;
                
            case 'delete':
            case 'remove':
                await handleFileDelete(sock, msg, args);
                break;
                
            case 'search':
            case 'find':
                await handleFileSearch(sock, msg, args);
                break;
                
            case 'info':
            case 'details':
                await handleFileInfo(sock, msg, args);
                break;
                
            case 'quota':
            case 'storage':
                await handleStorageInfo(sock, msg);
                break;
                
            case 'failed':
            case 'failedfiles':
                await handleFailedFiles(sock, msg);
                break;
                
            case 'clearfailed':
                await handleClearFailed(sock, msg);
                break;
                
            default:
                await sock.sendMessage(from, {
                    text: '❓ *Command file tidak ditemukan*\n\nGunakan: upload, download, list, delete, search, info, quota, failed, clearfailed'
                });
        }
    } catch (error) {
        console.error('Error in file command:', error);
        await sock.sendMessage(from, {
            text: '❌ *Terjadi kesalahan pada file manager*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle file upload using DriveEngine
 */
async function handleFileUpload(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    let targetMsg = msg;
    
    // Check if this is a reply to a media message
    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
        if (quotedMsg.documentMessage || quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.audioMessage) {
            // Create a proper message object for the quoted media
            targetMsg = {
                key: msg.key,
                message: quotedMsg
            };
        }
    }
    
    // Check if target message has media
    if (!targetMsg.message?.documentMessage && !targetMsg.message?.imageMessage && !targetMsg.message?.videoMessage && !targetMsg.message?.audioMessage) {
        await sock.sendMessage(from, {
            text: '📁 *Upload File*\n\n📝 *Cara penggunaan:*\n1. Kirim file (dokumen, gambar, video, audio)\n2. Reply file tersebut dengan `.upload [nama_file]`\n\n📋 *Contoh:*\n`.upload laporan_kkn.pdf`\n`.upload foto_kegiatan.jpg`\n\n💡 *Info:*\n- Maksimal 50MB per file\n- File akan disimpan ke Google Drive\n- Gunakan nama yang mudah diingat'
        });
        return;
    }
    
    try {
        // Send processing message
        const processingMsg = await sock.sendMessage(from, {
            text: '⏳ *Mengupload file ke sistem KKN...*\n\nMohon tunggu sebentar.'
        });
        
        // Use DriveEngine to handle upload
        const result = await driveEngine.uploadFile(sock, targetMsg, args);
        
        // Delete processing message
        try {
            await sock.sendMessage(from, { delete: processingMsg.key });
        } catch (e) {
            // Ignore delete error
        }
        
        // Send result message
        await sock.sendMessage(from, {
            text: result.message
        });
        
    } catch (error) {
        console.error('Error uploading file:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal mengupload file*\n\nSilakan coba lagi atau hubungi admin.'
        });
    }
}

/**
 * Handle file download
 */
async function handleFileDownload(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '📥 *Download File*\n\n📝 *Cara penggunaan:*\n`.download [id_file atau nama_file]`\n\n📋 *Contoh:*\n`.download abc123`\n`.download laporan.pdf`\n\n💡 *Tips:*\n- Gunakan `.list` untuk melihat daftar file\n- Gunakan `.search [kata_kunci]` untuk mencari file'
        });
        return;
    }
    
    const query = args.join(' ');
    
    try {
        const filesDb = loadDatabase('files');
        
        // Find file by ID or name
        let file = filesDb.files.find(f => f.id === query);
        if (!file) {
            file = filesDb.files.find(f => f.name.toLowerCase().includes(query.toLowerCase()));
        }
        
        if (!file) {
            await sock.sendMessage(from, {
                text: `❌ *File tidak ditemukan*\n\nQuery: "${query}"\n\nGunakan \`.list\` untuk melihat daftar file atau \`.search [kata_kunci]\` untuk mencari.`
            });
            return;
        }
        
        // Send processing message
        const processingMsg = await sock.sendMessage(from, {
            text: '⏳ *Menyiapkan file...*\n\nMohon tunggu sebentar.'
        });
        
        // Check if local file exists
        let fileBuffer;
        
        if (await fs.pathExists(file.localPath)) {
            fileBuffer = await fs.readFile(file.localPath);
        } else if (file.driveFileId) {
            // Download from Google Drive
            try {
                fileBuffer = await driveEngine.downloadFile(file.driveFileId);
            } catch (driveError) {
                console.error('Google Drive download failed:', driveError);
                await sock.sendMessage(from, {
                    text: '❌ *File tidak dapat didownload*\n\nFile mungkin sudah dihapus atau rusak.'
                });
                return;
            }
        } else {
            await sock.sendMessage(from, {
                text: '❌ *File tidak tersedia*\n\nFile tidak ditemukan di penyimpanan lokal maupun cloud.'
            });
            return;
        }
        
        // Send file based on type
        let messageOptions = {};
        
        if (file.type === 'image') {
            messageOptions.image = fileBuffer;
            messageOptions.caption = `📷 *${file.name}*\n\n📊 Ukuran: ${formatFileSize(file.size)}\n⏰ Diupload: ${new Date(file.uploadedAt).toLocaleString('id-ID')}`;
        } else if (file.type === 'video') {
            messageOptions.video = fileBuffer;
            messageOptions.caption = `🎥 *${file.name}*\n\n📊 Ukuran: ${formatFileSize(file.size)}\n⏰ Diupload: ${new Date(file.uploadedAt).toLocaleString('id-ID')}`;
        } else if (file.type === 'audio') {
            messageOptions.audio = fileBuffer;
            messageOptions.mimetype = file.mimetype;
        } else {
            messageOptions.document = fileBuffer;
            messageOptions.fileName = file.name;
            messageOptions.mimetype = file.mimetype;
        }
        
        await sock.sendMessage(from, messageOptions);
        
        // Update download count
        file.downloadCount++;
        saveDatabase('files', filesDb);
        
        // Delete processing message
        try {
            await sock.sendMessage(from, { delete: processingMsg.key });
        } catch (e) {
            // Ignore delete error
        }
        
    } catch (error) {
        console.error('Error downloading file:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal mendownload file*\n\nSilakan coba lagi atau hubungi admin.'
        });
    }
}

/**
 * Handle KKN file list command using DriveEngine
 */
async function handleKKNFileList(sock, msg, args) {
    try {
        const result = await driveEngine.listFiles();
        
        if (!result.success) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Error: ${result.error}`
            });
        }
        
        if (result.total === 0) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '📂 *Daftar File KKN*\n\n❌ Belum ada file yang diupload ke folder KKN.\n\n_Gunakan .upload untuk mengunggah file._'
            });
        }
        
        let message = '📂 *Daftar File KKN*\n\n';
        
        // Show files by category
        Object.keys(result.filesByType).forEach(type => {
            const typeIcon = driveEngine.getTypeIcon(type);
            const files = result.filesByType[type];
            message += `${typeIcon} *${type.toUpperCase()}* (${files.length})\n`;
            
            files.slice(0, 5).forEach((file, index) => {
                message += `${index + 1}. ${file.name}\n`;
                message += `   📊 ${formatFileSize(file.size)} | 📅 ${new Date(file.uploadedAt).toLocaleDateString('id-ID')}\n`;
            });
            
            if (files.length > 5) {
                message += `   ... dan ${files.length - 5} file lainnya\n`;
            }
            message += '\n';
        });
        
        message += `📊 *Total:* ${result.total} file\n`;
        message += '_Gunakan .download [nama_file] untuk mengunduh file._';
        
        await sock.sendMessage(msg.key.remoteJid, { text: message });
        
    } catch (error) {
        console.error('Error listing KKN files:', error);
        await sock.sendMessage(msg.key.remoteJid, {
            text: '❌ Terjadi kesalahan saat mengambil daftar file KKN.'
        });
    }
}

// Handle clear failed files
async function handleClearFailed(sock, msg) {
    const from = msg.key.remoteJid;
    
    try {
        const { loadDatabase, saveDatabase } = require('../utils/database');
        const filesDb = loadDatabase('files');
        const failedCount = filesDb.failed_uploads ? filesDb.failed_uploads.length : 0;
        
        if (failedCount === 0) {
            await sock.sendMessage(from, {
                text: '✅ *Daftar sudah kosong*\n\nTidak ada file gagal yang perlu dibersihkan.'
            });
            return;
        }
        
        // Clear failed uploads
        filesDb.failed_uploads = [];
        saveDatabase('files', filesDb);
        
        await sock.sendMessage(from, {
            text: `🗑️ *Daftar file gagal dibersihkan*\n\n` +
                  `📊 *Dihapus:* ${failedCount} record\n\n` +
                  `✅ Daftar file gagal sekarang kosong.`
        });
        
        console.log(`🗑️ Cleared ${failedCount} failed upload records`);
        
    } catch (error) {
        console.error('Error clearing failed files:', error);
        await sock.sendMessage(from, {
            text: '❌ Gagal membersihkan daftar file yang gagal'
        });
    }
}



/**
 * Handle file list
 */
async function handleFileList(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    try {
        const filesDb = loadDatabase('files');
        const files = filesDb.files;
        
        if (files.length === 0) {
            await sock.sendMessage(from, {
                text: '📁 *Daftar File*\n\n❌ Belum ada file yang diupload.\n\nGunakan `.upload` untuk mengupload file pertama.'
            });
            return;
        }
        
        // Pagination
        const page = parseInt(args[0]) || 1;
        const itemsPerPage = 10;
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const totalPages = Math.ceil(files.length / itemsPerPage);
        
        const pageFiles = files.slice(startIndex, endIndex);
        
        let message = `📁 *Daftar File* (Halaman ${page}/${totalPages})\n\n`;
        
        pageFiles.forEach((file, index) => {
            const number = startIndex + index + 1;
            const uploadDate = new Date(file.uploadedAt).toLocaleDateString('id-ID');
            
            message += `${number}. 📄 *${file.name}*\n`;
            message += `   🆔 ${file.id}\n`;
            message += `   📊 ${formatFileSize(file.size)} | ${file.type}\n`;
            message += `   📅 ${uploadDate} | ⬇️ ${file.downloadCount}x\n\n`;
        });
        
        // Navigation info
        if (totalPages > 1) {
            message += `📄 *Navigasi:*\n`;
            if (page > 1) message += `⬅️ \`.list ${page - 1}\` (Sebelumnya)\n`;
        if (page < totalPages) message += `➡️ \`.list ${page + 1}\` (Selanjutnya)\n`;
            message += `\n`;
        }
        
        message += `📊 *Total:* ${files.length} file\n`;
        message += `💾 *Ukuran:* ${formatFileSize(filesDb.stats.totalSize)}\n\n`;
        message += `💡 *Tips:*\n`;
        message += `• \`.download [id]\` - Download file\n`;
        message += `• \`.info [id]\` - Info detail file\n`;
        message += `• \`.search [kata]\` - Cari file`;
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error listing files:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal menampilkan daftar file*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Download media from WhatsApp message
 */
async function downloadMedia(msg) {
    try {
        let mediaMessage;
        
        if (msg.message?.documentMessage) {
            mediaMessage = msg.message.documentMessage;
        } else if (msg.message?.imageMessage) {
            mediaMessage = msg.message.imageMessage;
        } else if (msg.message?.videoMessage) {
            mediaMessage = msg.message.videoMessage;
        } else if (msg.message?.audioMessage) {
            mediaMessage = msg.message.audioMessage;
        }
        
        if (!mediaMessage) {
            throw new Error('No media message found');
        }
        
        // Use the media URL to download
        if (mediaMessage.url) {
            const response = await fetch(mediaMessage.url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        }
        
        throw new Error('No media URL found');
        
    } catch (error) {
        console.error('Error downloading media:', error);
        throw error;
    }
}

/**
 * Handle file search
 */
async function handleFileSearch(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '🔍 *Cari File*\n\n📝 *Cara penggunaan:*\n`.search [kata_kunci]`\n\n📋 *Contoh:*\n`.search laporan`\n`.search .pdf`\n`.search 2024`\n\n💡 *Tips:* Pencarian berdasarkan nama file'
        });
        return;
    }
    
    const query = args.join(' ').toLowerCase();
    
    try {
        const filesDb = loadDatabase('files');
        const matchedFiles = filesDb.files.filter(file => 
            file.name.toLowerCase().includes(query) ||
            file.originalName.toLowerCase().includes(query) ||
            file.extension.toLowerCase().includes(query)
        );
        
        if (matchedFiles.length === 0) {
            await sock.sendMessage(from, {
                text: `🔍 *Hasil Pencarian*\n\n❌ Tidak ditemukan file dengan kata kunci "${query}"\n\nCoba gunakan kata kunci yang berbeda atau gunakan \`.list\` untuk melihat semua file.`
            });
            return;
        }
        
        let message = `🔍 *Hasil Pencarian*\n\n`;
        message += `🔎 Kata kunci: "${query}"\n`;
        message += `📊 Ditemukan: ${matchedFiles.length} file\n\n`;
        
        matchedFiles.slice(0, 10).forEach((file, index) => {
            const uploadDate = new Date(file.uploadedAt).toLocaleDateString('id-ID');
            
            message += `${index + 1}. 📄 *${file.name}*\n`;
            message += `   🆔 ${file.id}\n`;
            message += `   📊 ${formatFileSize(file.size)} | ${file.type}\n`;
            message += `   📅 ${uploadDate}\n\n`;
        });
        
        if (matchedFiles.length > 10) {
            message += `... dan ${matchedFiles.length - 10} file lainnya\n\n`;
        }
        
        message += `💡 *Tips:*\n`;
        message += `• \`.download [id]\` - Download file\n`;
        message += `• \`.info [id]\` - Info detail file`;
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error searching files:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal mencari file*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle file info
 */
async function handleFileInfo(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '📋 *Info File*\n\n📝 *Cara penggunaan:*\n`.info [id_file atau nama_file]`\n\n📋 *Contoh:*\n`.info abc123`\n`.info laporan.pdf`'
        });
        return;
    }
    
    const query = args.join(' ');
    
    try {
        const filesDb = loadDatabase('files');
        
        // Find file by ID or name
        let file = filesDb.files.find(f => f.id === query);
        if (!file) {
            file = filesDb.files.find(f => f.name.toLowerCase().includes(query.toLowerCase()));
        }
        
        if (!file) {
            await sock.sendMessage(from, {
                text: `❌ *File tidak ditemukan*\n\nQuery: "${query}"\n\nGunakan \`.list\` untuk melihat daftar file.`
            });
            return;
        }
        
        let message = `📋 *Info File*\n\n`;
        message += `📄 *Nama:* ${file.name}\n`;
        message += `🆔 *ID:* ${file.id}\n`;
        message += `📊 *Ukuran:* ${formatFileSize(file.size)}\n`;
        message += `🏷️ *Jenis:* ${file.type}\n`;
        message += `📎 *Ekstensi:* .${file.extension}\n`;
        message += `🔧 *MIME Type:* ${file.mimetype}\n`;
        message += `👤 *Diupload oleh:* ${file.uploadedBy}\n`;
        message += `📅 *Tanggal upload:* ${new Date(file.uploadedAt).toLocaleString('id-ID')}\n`;
        message += `⬇️ *Download count:* ${file.downloadCount}x\n`;
        
        if (file.driveUrl) {
            message += `☁️ *Google Drive:* Tersedia\n`;
            message += `🔗 *Link:* ${file.driveUrl}\n`;
        } else {
            message += `💾 *Penyimpanan:* Lokal saja\n`;
        }
        
        message += `\n📝 *Cara download:*\n`;
        message += `\`.download ${file.id}\`\n`;
        message += `\`.download ${file.name}\``;
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error getting file info:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal mendapatkan info file*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle storage info
 */
async function handleStorageInfo(sock, msg) {
    const from = msg.key.remoteJid;
    
    try {
        const filesDb = loadDatabase('files');
        const stats = filesDb.stats;
        const settings = filesDb.settings;
        
        let message = `💾 *Info Penyimpanan*\n\n`;
        message += `📊 *Statistik:*\n`;
        message += `📁 Total file: ${stats.totalFiles}\n`;
        message += `💽 Total ukuran: ${formatFileSize(stats.totalSize)}\n`;
        message += `📈 Total download: ${stats.totalDownloads}\n\n`;
        
        message += `⚙️ *Pengaturan:*\n`;
        message += `📏 Ukuran max: ${formatFileSize(settings.maxFileSize)}\n`;
        message += `☁️ Auto upload Drive: ${settings.autoUploadToDrive ? '✅' : '❌'}\n`;
        message += `🗜️ Auto compress: ${settings.autoCompress ? '✅' : '❌'}\n\n`;
        
        // File type breakdown
        const fileTypes = {};
        filesDb.files.forEach(file => {
            fileTypes[file.type] = (fileTypes[file.type] || 0) + 1;
        });
        
        if (Object.keys(fileTypes).length > 0) {
            message += `📋 *Jenis File:*\n`;
            Object.entries(fileTypes).forEach(([type, count]) => {
                const emoji = {
                    'document': '📄',
                    'image': '🖼️',
                    'video': '🎥',
                    'audio': '🎵'
                }[type] || '📎';
                message += `${emoji} ${type}: ${count}\n`;
            });
            message += `\n`;
        }
        
        // Recent uploads
        const recentFiles = filesDb.files
            .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
            .slice(0, 5);
            
        if (recentFiles.length > 0) {
            message += `🕒 *Upload Terbaru:*\n`;
            recentFiles.forEach((file, index) => {
                const date = new Date(file.uploadedAt).toLocaleDateString('id-ID');
                message += `${index + 1}. ${file.name} (${date})\n`;
            });
        }
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error getting storage info:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal mendapatkan info penyimpanan*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle file delete
 */
async function handleFileDelete(sock, msg, args) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    const senderNumber = sender.replace('@s.whatsapp.net', '');
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '🗑️ *Hapus File*\n\n📝 *Cara penggunaan:*\n`.delete [id_file atau nama_file]`\n\n📋 *Contoh:*\n`.delete abc123`\n`.delete laporan.pdf`\n\n⚠️ *Peringatan:* File yang dihapus tidak dapat dikembalikan!'
        });
        return;
    }
    
    const query = args.join(' ');
    
    try {
        const filesDb = loadDatabase('files');
        
        // Find file by ID or name
        let fileIndex = filesDb.files.findIndex(f => f.id === query);
        if (fileIndex === -1) {
            fileIndex = filesDb.files.findIndex(f => f.name.toLowerCase().includes(query.toLowerCase()));
        }
        
        if (fileIndex === -1) {
            await sock.sendMessage(from, {
                text: `❌ *File tidak ditemukan*\n\nQuery: "${query}"\n\nGunakan \`!list\` untuk melihat daftar file.`
            });
            return;
        }
        
        const file = filesDb.files[fileIndex];
        
        // Check if user is admin or file owner
        const { isAdmin } = require('../utils/helpers');
        if (!isAdmin(senderNumber) && file.uploadedBy !== senderNumber) {
            await sock.sendMessage(from, {
                text: '❌ *Akses ditolak*\n\nAnda hanya bisa menghapus file yang Anda upload sendiri, atau menjadi admin.'
            });
            return;
        }
        
        // Delete local file
        try {
            if (await fs.pathExists(file.localPath)) {
                await fs.remove(file.localPath);
            }
        } catch (e) {
            console.error('Error deleting local file:', e);
        }
        
        // Delete from Google Drive
        if (file.driveFileId) {
            try {
                await driveEngine.deleteFile(file.driveFileId);
            } catch (e) {
                console.error('Error deleting from Google Drive:', e);
            }
        }
        
        // Remove from database
        filesDb.files.splice(fileIndex, 1);
        filesDb.stats.totalFiles--;
        filesDb.stats.totalSize -= file.size;
        
        saveDatabase('files', filesDb);
        
        await sock.sendMessage(from, {
            text: `✅ *File berhasil dihapus*\n\n📄 *Nama:* ${file.name}\n📊 *Ukuran:* ${formatFileSize(file.size)}\n\n⚠️ File telah dihapus permanen dari semua penyimpanan.`
        });
        
    } catch (error) {
        console.error('Error deleting file:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal menghapus file*\n\nSilakan coba lagi atau hubungi admin.'
        });
    }
}

/**
 * Handle failed files
 */
async function handleFailedFiles(sock, msg) {
    const from = msg.key.remoteJid;
    
    try {
        const filesDb = loadDatabase('files');
        const failedUploads = filesDb.failed_uploads || [];
        
        if (failedUploads.length === 0) {
            await sock.sendMessage(from, {
                text: '✅ *Tidak ada file yang gagal diupload*\n\nSemua file berhasil diproses dengan baik!'
            });
            return;
        }
        
        let message = `⚠️ *Daftar File Gagal Upload*\n\n`;
        message += `📊 *Total:* ${failedUploads.length} file\n\n`;
        
        failedUploads.slice(-10).forEach((failed, index) => {
            const date = new Date(failed.timestamp).toLocaleString('id-ID');
            message += `${index + 1}. 📁 *${failed.name}*\n`;
            message += `   🕒 ${date}\n`;
            message += `   ❌ ${failed.error.substring(0, 50)}...\n\n`;
        });
        
        if (failedUploads.length > 10) {
            message += `_Menampilkan 10 file terakhir dari ${failedUploads.length} total._\n\n`;
        }
        
        message += `💡 *Tips:*\n`;
        message += `• Kirim ulang file yang gagal\n`;
        message += `• Kompres file besar sebelum kirim\n`;
        message += `• Gunakan format file standar\n\n`;
        message += `_Gunakan !clearfailed untuk membersihkan daftar._`;
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error getting failed files:', error);
        await sock.sendMessage(from, {
            text: '❌ Gagal mendapatkan daftar file yang gagal'
        });
    }
}



module.exports = {
    handleFileCommand
};