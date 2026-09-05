const DriveManager = require('../utils/driveManager');
const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { isAdmin } = require('../utils/helpers');

class DriveCommand {
    constructor() {
        this.driveManager = new DriveManager();
        this.tempDir = path.join(__dirname, '..', 'temp');
        this.initTempDir();
    }

    async initTempDir() {
        await fs.ensureDir(this.tempDir);
    }

    // Handle drive commands
    async handleDriveCommand(sock, message) {
        const { key, message: msg } = message;
        const from = key.remoteJid;
        const sender = key.participant || key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        
        let text = '';
        if (msg.conversation) {
            text = msg.conversation;
        } else if (msg.extendedTextMessage) {
            text = msg.extendedTextMessage.text;
        }
        
        const args = text.split(' ');
        const command = args[0].toLowerCase();
        
        try {
            switch (command) {
                case '!drive':
                case '.drive':
                    await this.showDriveMenu(sock, from);
                    break;
                    
                case '!upload':
                case '.upload':
                    await this.handleUpload(sock, message, args);
                    break;
                    
                case '!download':
                case '.download':
                    await this.handleDownload(sock, from, args);
                    break;
                    
                case '!drivelist':
                case '.drivelist':
                    await this.handleList(sock, from, args);
                    break;
                    
                case '!drivesearch':
                case '.drivesearch':
                    await this.handleSearch(sock, from, args);
                    break;
                    
                case '!driveinfo':
                case '.driveinfo':
                    await this.handleFileInfo(sock, from, args);
                    break;
                    
                case '!driverename':
                case '.driverename':
                    await this.handleRename(sock, from, args, sender);
                    break;
                    
                case '!drivedelete':
                case '.drivedelete':
                    await this.handleDelete(sock, from, args, sender);
                    break;
                    
                case '!drivestorage':
                case '.drivestorage':
                    await this.handleStorageInfo(sock, from);
                    break;
                    
                default:
                    return false;
            }
            return true;
        } catch (error) {
            console.error('❌ Drive command error:', error.message);
            await sock.sendMessage(from, {
                text: `❌ *Error:* ${error.message}`
            });
            return true;
        }
    }

    // Show drive menu
    async showDriveMenu(sock, from) {
        const menuText = `🗂️ *GOOGLE DRIVE MANAGER*

` +
            `📤 *Upload Commands:*
` +
            `• !upload [nama_custom] - Upload file dengan nama custom
` +
            `• !upload - Upload file dengan nama otomatis

` +
            
            `📥 *Download Commands:*
` +
            `• !download [file_id] - Download file dari Drive

` +
            
            `📋 *List & Search:*
` +
            `• !drivelist - List semua file
` +
            `• !drivelist [jenis] - List berdasarkan jenis
` +
            `  Jenis: Dokumen, Gambar, Video, Audio, Arsip, Lainnya
` +
            `• !drivesearch [kata_kunci] - Cari file
` +
            `• !drivesearch [kata_kunci] [jenis] - Cari dalam jenis tertentu

` +
            
            `ℹ️ *Info Commands:*
` +
            `• !driveinfo [file_id] - Info detail file
` +
            `• !drivestorage - Info storage Drive

` +
            
            `🔧 *Management (Admin Only):*
` +
            `• !driverename [file_id] [nama_baru] - Rename file
` +
            `• !drivedelete [file_id] - Hapus file

` +
            
            `📁 *Folder Structure:*
` +
            `Bot-KKN-Files/
` +
            `├── 📄 Dokumen (pdf, doc, txt, dll)
` +
            `├── 🖼️ Gambar (jpg, png, gif, dll)
` +
            `├── 🎥 Video (mp4, avi, mkv, dll)
` +
            `├── 🎵 Audio (mp3, wav, flac, dll)
` +
            `├── 📦 Arsip (zip, rar, 7z, dll)
` +
            `└── 📋 Lainnya

` +
            
            `⏰ *Semua waktu dalam WIB Indonesia*
` +
            `🔒 *File tersimpan aman di Google Drive*`;
        
        await sock.sendMessage(from, { text: menuText });
    }

    // Handle file upload
    async handleUpload(sock, message, args) {
        const { key, message: msg } = message;
        const from = key.remoteJid;
        const customName = args.slice(1).join(' ') || null;
        
        // Check if message has media
        const mediaMessage = msg.imageMessage || msg.videoMessage || msg.audioMessage || msg.documentMessage;
        
        if (!mediaMessage) {
            await sock.sendMessage(from, {
                text: `❌ *Upload Failed*\n\nSilakan kirim file (gambar, video, audio, atau dokumen) bersamaan dengan perintah !upload`
            });
            return;
        }
        
        try {
            await sock.sendMessage(from, {
                text: `⏳ *Mengupload file...*\n\nMohon tunggu sebentar...`
            });
            
            // Download media to temp
            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const fileName = mediaMessage.fileName || `file_${Date.now()}`;
            const tempPath = path.join(this.tempDir, fileName);
            
            await fs.writeFile(tempPath, buffer);
            
            // Upload to Drive
            const fileInfo = await this.driveManager.uploadFile(tempPath, fileName, customName);
            
            // Clean up temp file
            await fs.unlink(tempPath);
            
            const responseText = `✅ *Upload Berhasil!*\n\n` +
                `📁 *Nama:* ${fileInfo.name}\n` +
                `📂 *Jenis:* ${fileInfo.type}\n` +
                `📏 *Ukuran:* ${this.driveManager.formatFileSize(fileInfo.size)}\n` +
                `⏰ *Waktu:* ${fileInfo.uploadTime}\n` +
                `🔗 *Link:* ${fileInfo.downloadUrl}\n\n` +
                `💡 *File ID:* \`${fileInfo.id}\`\n` +
                `(Gunakan untuk download/manage)`;
            
            await sock.sendMessage(from, { text: responseText });
            
        } catch (error) {
            console.error('❌ Upload error:', error.message);
            await sock.sendMessage(from, {
                text: `❌ *Upload Failed*\n\n${error.message}`
            });
        }
    }

    // Handle file download
    async handleDownload(sock, from, args) {
        if (args.length < 2) {
            await sock.sendMessage(from, {
                text: `❌ *Format salah!*\n\nGunakan: !download [file_id]\n\nContoh: !download 1ABC123xyz`
            });
            return;
        }
        
        const fileId = args[1];
        
        try {
            await sock.sendMessage(from, {
                text: `⏳ *Mendownload file...*\n\nMohon tunggu sebentar...`
            });
            
            // Get file info first
            const fileInfo = await this.driveManager.getFileInfo(fileId);
            
            // Download file
            const downloadPath = path.join(this.tempDir, fileInfo.name);
            await this.driveManager.downloadFile(fileId, downloadPath);
            
            // Send file via WhatsApp
            const buffer = await fs.readFile(downloadPath);
            const mimeType = fileInfo.mimeType;
            
            let messageOptions = {};
            
            if (mimeType.startsWith('image/')) {
                messageOptions.image = buffer;
                messageOptions.caption = `📁 ${fileInfo.name}\n📏 ${this.driveManager.formatFileSize(fileInfo.size)}\n⏰ ${fileInfo.created}`;
            } else if (mimeType.startsWith('video/')) {
                messageOptions.video = buffer;
                messageOptions.caption = `📁 ${fileInfo.name}\n📏 ${this.driveManager.formatFileSize(fileInfo.size)}\n⏰ ${fileInfo.created}`;
            } else if (mimeType.startsWith('audio/')) {
                messageOptions.audio = buffer;
                messageOptions.mimetype = mimeType;
            } else {
                messageOptions.document = buffer;
                messageOptions.fileName = fileInfo.name;
                messageOptions.mimetype = mimeType;
                messageOptions.caption = `📁 ${fileInfo.name}\n📏 ${this.driveManager.formatFileSize(fileInfo.size)}\n⏰ ${fileInfo.created}`;
            }
            
            await sock.sendMessage(from, messageOptions);
            
            // Clean up temp file
            await fs.unlink(downloadPath);
            
        } catch (error) {
            console.error('❌ Download error:', error.message);
            await sock.sendMessage(from, {
                text: `❌ *Download Failed*\n\n${error.message}`
            });
        }
    }

    // Handle list files
    async handleList(sock, from, args) {
        const fileType = args[1] || null;
        const validTypes = ['Dokumen', 'Gambar', 'Video', 'Audio', 'Arsip', 'Lainnya'];
        
        if (fileType && !validTypes.includes(fileType)) {
            await sock.sendMessage(from, {
                text: `❌ *Jenis file tidak valid!*\n\nJenis yang tersedia:\n${validTypes.map(type => `• ${type}`).join('\n')}`
            });
            return;
        }
        
        try {
            const files = await this.driveManager.listFiles(fileType, 15);
            
            if (files.length === 0) {
                await sock.sendMessage(from, {
                    text: `📂 *Tidak ada file${fileType ? ` dalam kategori ${fileType}` : ''}*`
                });
                return;
            }
            
            let listText = `📂 *DAFTAR FILE${fileType ? ` - ${fileType.toUpperCase()}` : ''}*\n\n`;
            
            files.forEach((file, index) => {
                listText += `${index + 1}. 📄 *${file.name}*\n`;
                listText += `   📂 ${file.type} | 📏 ${this.driveManager.formatFileSize(file.size)}\n`;
                listText += `   ⏰ ${file.created}\n`;
                listText += `   🆔 \`${file.id}\`\n\n`;
            });
            
            listText += `📊 *Total: ${files.length} file(s)*\n`;
            listText += `💡 *Gunakan file ID untuk download/manage*`;
            
            await sock.sendMessage(from, { text: listText });
            
        } catch (error) {
            console.error('❌ List error:', error.message);
            await sock.sendMessage(from, {
                text: `❌ *List Failed*\n\n${error.message}`
            });
        }
    }

    // Handle search files
    async handleSearch(sock, from, args) {
        if (args.length < 2) {
            await sock.sendMessage(from, {
                text: `❌ *Format salah!*\n\nGunakan: !drivesearch [kata_kunci] [jenis_opsional]\n\nContoh:\n• !drivesearch laporan\n• !drivesearch foto Gambar`
            });
            return;
        }
        
        const query = args[1];
        const fileType = args[2] || null;
        const validTypes = ['Dokumen', 'Gambar', 'Video', 'Audio', 'Arsip', 'Lainnya'];
        
        if (fileType && !validTypes.includes(fileType)) {
            await sock.sendMessage(from, {
                text: `❌ *Jenis file tidak valid!*\n\nJenis yang tersedia:\n${validTypes.map(type => `• ${type}`).join('\n')}`
            });
            return;
        }
        
        try {
            const files = await this.driveManager.searchFiles(query, fileType);
            
            if (files.length === 0) {
                await sock.sendMessage(from, {
                    text: `🔍 *Tidak ditemukan file dengan kata kunci "${query}"${fileType ? ` dalam kategori ${fileType}` : ''}*`
                });
                return;
            }
            
            let searchText = `🔍 *HASIL PENCARIAN: "${query}"${fileType ? ` - ${fileType.toUpperCase()}` : ''}*\n\n`;
            
            files.forEach((file, index) => {
                searchText += `${index + 1}. 📄 *${file.name}*\n`;
                searchText += `   📂 ${file.type} | 📏 ${this.driveManager.formatFileSize(file.size)}\n`;
                searchText += `   ⏰ ${file.created}\n`;
                searchText += `   🆔 \`${file.id}\`\n\n`;
            });
            
            searchText += `📊 *Ditemukan: ${files.length} file(s)*`;
            
            await sock.sendMessage(from, { text: searchText });
            
        } catch (error) {
            console.error('❌ Search error:', error.message);
            await sock.sendMessage(from, {
                text: `❌ *Search Failed*\n\n${error.message}`
            });
        }
    }

    // Handle file info
    async handleFileInfo(sock, from, args) {
        if (args.length < 2) {
            await sock.sendMessage(from, {
                text: `❌ *Format salah!*\n\nGunakan: !driveinfo [file_id]\n\nContoh: !driveinfo 1ABC123xyz`
            });
            return;
        }
        
        const fileId = args[1];
        
        try {
            const fileInfo = await this.driveManager.getFileInfo(fileId);
            
            const infoText = `ℹ️ *INFORMASI FILE*\n\n` +
                `📁 *Nama:* ${fileInfo.name}\n` +
                `📏 *Ukuran:* ${this.driveManager.formatFileSize(fileInfo.size)}\n` +
                `📂 *Tipe MIME:* ${fileInfo.mimeType}\n` +
                `📅 *Dibuat:* ${fileInfo.created}\n` +
                `🔄 *Dimodifikasi:* ${fileInfo.modified}\n` +
                `🔗 *Link View:* ${fileInfo.downloadUrl}\n` +
                `⬇️ *Direct Download:* ${fileInfo.directDownload}\n\n` +
                `🆔 *File ID:* \`${fileInfo.id}\`\n\n`;
            
            if (fileInfo.description) {
                infoText += `📝 *Deskripsi:*\n${fileInfo.description}`;
            }
            
            await sock.sendMessage(from, { text: infoText });
            
        } catch (error) {
            console.error('❌ File info error:', error.message);
            await sock.sendMessage(from, {
                text: `❌ *File Info Failed*\n\n${error.message}`
            });
        }
    }

    // Handle rename file (Admin only)
    async handleRename(sock, from, args, sender) {
        if (!isAdmin(sender)) {
            await sock.sendMessage(from, {
                text: `❌ *Akses Ditolak*\n\nHanya admin yang dapat mengganti nama file.`
            });
            return;
        }
        
        if (args.length < 3) {
            await sock.sendMessage(from, {
                text: `❌ *Format salah!*\n\nGunakan: !driverename [file_id] [nama_baru]\n\nContoh: !driverename 1ABC123xyz laporan_baru.pdf`
            });
            return;
        }
        
        const fileId = args[1];
        const newName = args.slice(2).join(' ');
        
        try {
            const result = await this.driveManager.renameFile(fileId, newName);
            
            await sock.sendMessage(from, {
                text: `✅ *Rename Berhasil!*\n\n📁 *Nama Baru:* ${result.name}\n🆔 *File ID:* \`${result.id}\``
            });
            
        } catch (error) {
            console.error('❌ Rename error:', error.message);
            await sock.sendMessage(from, {
                text: `❌ *Rename Failed*\n\n${error.message}`
            });
        }
    }

    // Handle delete file (Admin only)
    async handleDelete(sock, from, args, sender) {
        if (!isAdmin(sender)) {
            await sock.sendMessage(from, {
                text: `❌ *Akses Ditolak*\n\nHanya admin yang dapat menghapus file.`
            });
            return;
        }
        
        if (args.length < 2) {
            await sock.sendMessage(from, {
                text: `❌ *Format salah!*\n\nGunakan: !drivedelete [file_id]\n\nContoh: !drivedelete 1ABC123xyz`
            });
            return;
        }
        
        const fileId = args[1];
        
        try {
            // Get file info first for confirmation
            const fileInfo = await this.driveManager.getFileInfo(fileId);
            
            await this.driveManager.deleteFile(fileId);
            
            await sock.sendMessage(from, {
                text: `✅ *File Berhasil Dihapus!*\n\n📁 *Nama:* ${fileInfo.name}\n🆔 *File ID:* \`${fileId}\``
            });
            
        } catch (error) {
            console.error('❌ Delete error:', error.message);
            await sock.sendMessage(from, {
                text: `❌ *Delete Failed*\n\n${error.message}`
            });
        }
    }

    // Handle storage info
    async handleStorageInfo(sock, from) {
        try {
            const storageInfo = await this.driveManager.getStorageInfo();
            
            const usagePercent = ((storageInfo.storage.usage / storageInfo.storage.limit) * 100).toFixed(1);
            
            const infoText = `💾 *INFORMASI STORAGE GOOGLE DRIVE*\n\n` +
                `👤 *User:* ${storageInfo.user.name}\n` +
                `📧 *Email:* ${storageInfo.user.email}\n\n` +
                `📊 *Storage Usage:*\n` +
                `• *Total:* ${this.driveManager.formatFileSize(storageInfo.storage.limit)}\n` +
                `• *Terpakai:* ${this.driveManager.formatFileSize(storageInfo.storage.usage)} (${usagePercent}%)\n` +
                `• *Drive:* ${this.driveManager.formatFileSize(storageInfo.storage.usageInDrive)}\n` +
                `• *Tersisa:* ${this.driveManager.formatFileSize(storageInfo.storage.available)}\n\n` +
                `📈 *Progress Bar:*\n${'█'.repeat(Math.floor(usagePercent / 5))}${'░'.repeat(20 - Math.floor(usagePercent / 5))} ${usagePercent}%`;
            
            await sock.sendMessage(from, { text: infoText });
            
        } catch (error) {
            console.error('❌ Storage info error:', error.message);
            await sock.sendMessage(from, {
                text: `❌ *Storage Info Failed*\n\n${error.message}`
            });
        }
    }
}

module.exports = DriveCommand;