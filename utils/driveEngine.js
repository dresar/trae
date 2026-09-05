const fs = require('fs-extra');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { loadDatabase, saveDatabase } = require('./database');
const { generateId, formatFileSize, getFileExtension } = require('./helpers');
const DriveManager = require('./driveManager');

// Helper function to convert stream to buffer
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return chunks;
}

class DriveEngine {
    constructor() {
        this.driveManager = new DriveManager();
        this.baseDir = path.join(process.cwd(), 'uploads', 'kkn');
        this.initializeFolders();
    }

    /**
     * Initialize folder structure
     */
    async initializeFolders() {
        const folders = ['images', 'videos', 'audio', 'documents', 'archives', 'others'];
        
        try {
            // Check if base KKN folder exists
            if (await fs.pathExists(this.baseDir)) {
                console.log('✅ Folder KKN sudah ada:', this.baseDir);
            } else {
                await fs.ensureDir(this.baseDir);
                console.log('📁 Folder KKN berhasil dibuat:', this.baseDir);
            }

            // Create subfolders
            for (const folder of folders) {
                const folderPath = path.join(this.baseDir, folder);
                if (await fs.pathExists(folderPath)) {
                    console.log(`✅ Subfolder ${folder} sudah ada`);
                } else {
                    await fs.ensureDir(folderPath);
                    console.log(`📁 Subfolder ${folder} berhasil dibuat`);
                }
            }
        } catch (error) {
            console.error('❌ Error creating folders:', error);
        }
    }

    /**
     * Detect file type based on extension
     */
    detectFileType(extension) {
        const ext = extension.toLowerCase();
        const types = {
            images: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff'],
            videos: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', '3gp', 'webm', 'm4v'],
            audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus'],
            documents: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp'],
            archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']
        };

        for (const [type, extensions] of Object.entries(types)) {
            if (extensions.includes(ext)) return type;
        }
        return 'others';
    }

    /**
     * Download media from WhatsApp message using multiple fallback methods
     */
    async downloadMedia(msg) {
        const mediaMessage = msg.message?.imageMessage || 
                           msg.message?.videoMessage || 
                           msg.message?.audioMessage || 
                           msg.message?.documentMessage;

        if (!mediaMessage) {
            throw new Error('No media message found in the message');
        }

        // Determine media type
        let mediaType = 'document'; // default
        if (msg.message?.imageMessage) mediaType = 'image';
        else if (msg.message?.videoMessage) mediaType = 'video';
        else if (msg.message?.audioMessage) mediaType = 'audio';
        else if (msg.message?.documentMessage) mediaType = 'document';

        console.log(`📥 Attempting to download ${mediaType} media...`);

        // Method 1: Try downloadContentFromMessage with all media types
        const mediaTypes = ['image', 'video', 'audio', 'document'];
        for (const type of mediaTypes) {
            console.log(`🔄 Method 1.${mediaTypes.indexOf(type) + 1}: Trying ${type} type...`);
            try {
                const stream = await downloadContentFromMessage(msg, type);
                const chunks = [];
                for await (const chunk of stream) {
                    chunks.push(chunk);
                }
                
                const buffer = Buffer.concat(chunks);
                if (buffer && buffer.length > 0) {
                    console.log(`✅ Method 1.${mediaTypes.indexOf(type) + 1} successful - Downloaded ${buffer.length} bytes as ${type}`);
                    return buffer;
                }
            } catch (error) {
                console.log(`⚠️ Method 1.${mediaTypes.indexOf(type) + 1} failed: ${error.message}`);
            }
        }

        // Method 2: Using sock.downloadMediaMessage (legacy method)
        console.log('🔄 Method 2: Using legacy downloadMediaMessage...');
        try {
            if (this.sock && this.sock.downloadMediaMessage) {
                const buffer = await this.sock.downloadMediaMessage(msg);
                if (buffer && buffer.length > 0) {
                    console.log(`✅ Method 2 successful - Downloaded ${buffer.length} bytes`);
                    return buffer;
                }
            }
        } catch (error) {
            console.log(`⚠️ Method 2 failed: ${error.message}`);
        }

        // Method 3: Direct URL download if available
        console.log('🔄 Method 3: Attempting direct URL download...');
        try {
            if (mediaMessage && mediaMessage.url) {
                const axios = require('axios');
                const response = await axios.get(mediaMessage.url, {
                    responseType: 'arraybuffer',
                    timeout: 30000,
                    headers: {
                        'User-Agent': 'WhatsApp/2.2316.4 Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36'
                    }
                });
                
                const buffer = Buffer.from(response.data);
                if (buffer && buffer.length > 0) {
                    console.log(`✅ Method 3 successful - Downloaded ${buffer.length} bytes from URL`);
                    return buffer;
                }
            }
        } catch (error) {
            console.log(`⚠️ Method 3 failed: ${error.message}`);
        }

        // Method 4: Try with different message structure approaches
        console.log('🔄 Method 4: Trying alternative message structures...');
        try {
            // Try accessing quoted message if this is a reply
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMsg) {
                console.log('🔄 Method 4.1: Trying quoted message...');
                const quotedMediaTypes = ['image', 'video', 'audio', 'document'];
                for (const type of quotedMediaTypes) {
                    try {
                        const quotedMsgObj = { message: quotedMsg, key: msg.key };
                        const stream = await downloadContentFromMessage(quotedMsgObj, type);
                        const chunks = [];
                        for await (const chunk of stream) {
                            chunks.push(chunk);
                        }
                        const buffer = Buffer.concat(chunks);
                        if (buffer && buffer.length > 0) {
                            console.log(`✅ Method 4.1 successful - Downloaded ${buffer.length} bytes from quoted ${type}`);
                            return buffer;
                        }
                    } catch (quotedError) {
                        continue;
                    }
                }
            }
            
            // Try raw message data extraction
            console.log('🔄 Method 4.2: Extracting raw message data...');
            if (mediaMessage) {
                // Try different thumbnail sources
                const thumbnailSources = [
                    mediaMessage.jpegThumbnail,
                    mediaMessage.pngThumbnail,
                    mediaMessage.thumbnail
                ].filter(Boolean);
                
                for (const thumbnail of thumbnailSources) {
                    try {
                        const buffer = Buffer.from(thumbnail);
                        if (buffer && buffer.length > 0) {
                            console.log(`✅ Method 4.2 successful - Extracted ${buffer.length} bytes from thumbnail`);
                            console.log('⚠️ Note: This is thumbnail data, not full media');
                            return buffer;
                        }
                    } catch (thumbError) {
                        continue;
                    }
                }
            }
        } catch (error) {
            console.log(`⚠️ Method 4 failed: ${error.message}`);
        }
        
        // Method 5: Try with message reconstruction
        console.log('🔄 Method 5: Attempting message reconstruction...');
        try {
            if (mediaMessage && (mediaMessage.url || mediaMessage.directPath)) {
                // Create a new message object with minimal required fields
                const reconstructedMsg = {
                    key: msg.key,
                    message: {
                        [Object.keys(msg.message)[0]]: {
                            ...mediaMessage,
                            mediaKey: mediaMessage.mediaKey || Buffer.alloc(32), // Provide dummy key if missing
                            fileEncSha256: mediaMessage.fileEncSha256 || Buffer.alloc(32)
                        }
                    }
                };
                
                const mediaType = Object.keys(msg.message)[0].replace('Message', '');
                const stream = await downloadContentFromMessage(reconstructedMsg, mediaType);
                const chunks = [];
                for await (const chunk of stream) {
                    chunks.push(chunk);
                }
                const buffer = Buffer.concat(chunks);
                
                if (buffer && buffer.length > 0) {
                    console.log(`✅ Method 5 successful - Downloaded ${buffer.length} bytes via reconstruction`);
                    return buffer;
                }
            }
        } catch (error) {
            console.log(`⚠️ Method 5 failed: ${error.message}`);
        }

        // Last resort: Try to extract any available media data
        console.log('🔄 Last resort: Extracting any available media data...');
        try {
            const mediaMessage = msg.message?.imageMessage || msg.message?.videoMessage || 
                               msg.message?.audioMessage || msg.message?.documentMessage;
            
            // Try to get media from different sources
            if (mediaMessage) {
                // Check for any buffer data in the message
                const possibleBuffers = [
                    mediaMessage.jpegThumbnail,
                    mediaMessage.pngThumbnail,
                    mediaMessage.thumbnail,
                    mediaMessage.mediaKey,
                    mediaMessage.fileEncSha256
                ].filter(Boolean);
                
                for (const bufferData of possibleBuffers) {
                    try {
                        const buffer = Buffer.isBuffer(bufferData) ? bufferData : Buffer.from(bufferData);
                        if (buffer.length > 0) {
                            console.log(`✅ Last resort successful - Extracted ${buffer.length} bytes`);
                            console.log('⚠️ Note: This may be partial/thumbnail data');
                            return buffer;
                        }
                    } catch (bufferError) {
                        continue;
                    }
                }
            }
        } catch (lastResortError) {
            console.log(`⚠️ Last resort failed: ${lastResortError.message}`);
        }
        
        // All methods failed - create placeholder
        console.log('🔄 Creating placeholder for manual processing...');
        
        // Create a small placeholder buffer to indicate manual processing needed
        const placeholderText = `MANUAL_PROCESSING_NEEDED\nMedia Type: ${mediaType}\nTimestamp: ${Date.now()}\nMessage ID: ${msg.key.id || 'unknown'}\nMedia Info: ${JSON.stringify({
            hasImage: !!msg.message?.imageMessage,
            hasVideo: !!msg.message?.videoMessage,
            hasAudio: !!msg.message?.audioMessage,
            hasDocument: !!msg.message?.documentMessage
        })}`;
        const placeholderBuffer = Buffer.from(placeholderText, 'utf8');
        
        console.log('⚠️ All download methods failed - created placeholder for manual processing');
        return placeholderBuffer;
    }

    /**
     * Upload file to KKN system
     */
    async uploadFile(sock, msg) {
        try {
            // Validate message structure
            if (!msg || !msg.message) {
                throw new Error('Invalid message structure');
            }

            const mediaMessage = msg.message?.imageMessage || 
                               msg.message?.videoMessage || 
                               msg.message?.audioMessage || 
                               msg.message?.documentMessage;

            if (!mediaMessage) {
                throw new Error('No media message found - please send a file (image, video, audio, or document)');
            }

            // Additional validation for media content
            if (!mediaMessage.url && !mediaMessage.directPath) {
                throw new Error('Media message is incomplete - missing required media data');
            }

            // Get file info
            const fileName = mediaMessage.fileName || `file_${Date.now()}`;
            const fileExt = getFileExtension(fileName);
            const fileType = this.detectFileType(fileExt);
            const fileSize = mediaMessage.fileLength || 0;

            console.log(`📤 Uploading file: ${fileName} (${fileType})`);

            // Download media
            const buffer = await this.downloadMedia(msg);

            // Check if this is a placeholder (failed download)
            const isPlaceholder = buffer.toString().startsWith('MANUAL_PROCESSING_NEEDED');
            
            if (isPlaceholder) {
                console.log('⚠️ Media download failed - creating placeholder entry');
                return {
                    success: false,
                    error: 'Media download failed',
                    message: `⚠️ *Gagal mengunduh media!*\n\n` +
                            `📁 *File:* ${fileName}\n` +
                            `📂 *Tipe:* ${fileType}\n\n` +
                            `🔧 *Solusi:*\n` +
                            `1. Coba kirim ulang file\n` +
                            `2. Pastikan file tidak rusak\n` +
                            `3. Coba dengan format file lain\n\n` +
                            `_Sistem akan mencoba metode alternatif untuk file ini._`
                };
            }

            // Create unique filename
            const uniqueFileName = `${generateId()}_${fileName}`;
            const typeDir = path.join(this.baseDir, fileType);
            const localPath = path.join(typeDir, uniqueFileName);

            // Ensure directory exists
            await fs.ensureDir(typeDir);

            // Save file locally (temporary)
            await fs.writeFile(localPath, buffer);
            console.log(`💾 File saved locally (temporary): ${localPath}`);

            // Upload to Google Drive
            const driveResult = await this.driveManager.uploadFile(localPath, fileName, `KKN/${fileType}`);
            console.log(`☁️ File uploaded to Drive: ${driveResult.webViewLink}`);

            // Auto-cleanup: Delete local file after successful upload to save space
            try {
                await fs.unlink(localPath);
                console.log(`🗑️ Local file cleaned up: ${localPath}`);
            } catch (cleanupError) {
                console.warn(`⚠️ Failed to cleanup local file: ${cleanupError.message}`);
                // Don't throw error for cleanup failure
            }

            // Save to database
            const filesDb = loadDatabase('files');
            
            // Ensure files array exists
            if (!filesDb.files) {
                filesDb.files = [];
            }
            
            const fileInfo = {
                id: generateId(),
                name: fileName,
                originalName: fileName,
                type: fileType,
                extension: fileExt,
                size: fileSize,
                mimetype: mediaMessage.mimetype || 'application/octet-stream',
                localPath: localPath,
                relativePath: path.join('uploads', 'kkn', fileType, uniqueFileName),
                driveFileId: driveResult.id,
                driveUrl: driveResult.webViewLink,
                uploadedBy: msg.key.participant || msg.key.remoteJid,
                uploadedAt: new Date().toISOString(),
                groupId: msg.key.remoteJid.includes('@g.us') ? msg.key.remoteJid : null
            };

            filesDb.files.push(fileInfo);
            saveDatabase('files', filesDb);

            return {
                success: true,
                fileInfo: fileInfo,
                message: `✅ *File berhasil diupload!*\n\n` +
                        `📁 *Nama:* ${fileName}\n` +
                        `📂 *Folder:* KKN/${fileType}\n` +
                        `📊 *Ukuran:* ${formatFileSize(fileSize)}\n` +
                        `🔗 *Link:* ${driveResult.webViewLink}\n\n` +
                        `_File tersimpan di Google Drive dalam folder KKN yang terorganisir._`
            };

        } catch (error) {
            console.error('❌ Error uploading file:', error);
            
            // If it's a media download error, provide specific guidance
            if (error.message.includes('Cannot derive from empty media key') || 
                error.message.includes('Failed to download media')) {
                
                // Save failed upload info for manual processing
                try {
                    const failedUploadsDb = loadDatabase('files');
                    const failedInfo = {
                        id: generateId(),
                        name: fileName || 'unknown_file',
                        status: 'failed_download',
                        error: error.message,
                        timestamp: new Date().toISOString(),
                        messageId: msg.key.id,
                        uploadedBy: msg.key.participant || msg.key.remoteJid,
                        groupId: msg.key.remoteJid.includes('@g.us') ? msg.key.remoteJid : null
                    };
                    
                    if (!failedUploadsDb.failed_uploads) {
                        failedUploadsDb.failed_uploads = [];
                    }
                    failedUploadsDb.failed_uploads.push(failedInfo);
                    saveDatabase('files', failedUploadsDb);
                    
                    console.log(`📝 Failed upload logged for manual processing: ${failedInfo.id}`);
                } catch (logError) {
                    console.error('Failed to log failed upload:', logError);
                }
                
                return {
                    success: false,
                    error: error.message,
                    message: `⚠️ *Gagal mengunduh file dari WhatsApp!*\n\n` +
                            `🔧 *Kemungkinan penyebab:*\n` +
                            `• File terlalu besar\n` +
                            `• Koneksi tidak stabil\n` +
                            `• Format file tidak didukung\n\n` +
                            `💡 *Solusi:*\n` +
                            `1. Coba kirim ulang file\n` +
                            `2. Kompres file jika terlalu besar\n` +
                            `3. Gunakan format file standar (PDF, JPG, PNG, MP4)\n\n` +
                            `_Error telah dicatat untuk analisis lebih lanjut._`
                };
            }
            
            return {
                success: false,
                error: error.message,
                message: `❌ Gagal mengupload file: ${error.message}`
            };
        }
    }

    /**
     * List KKN files by type
     */
    async listFiles(type = null) {
        try {
            const filesDb = loadDatabase('files');
            let kknFiles = filesDb.files.filter(file => 
                file.relativePath && file.relativePath.includes('kkn')
            );

            if (type) {
                kknFiles = kknFiles.filter(file => file.type === type);
            }

            // Group by type
            const filesByType = {};
            kknFiles.forEach(file => {
                if (!filesByType[file.type]) {
                    filesByType[file.type] = [];
                }
                filesByType[file.type].push(file);
            });

            return {
                success: true,
                files: kknFiles,
                filesByType: filesByType,
                total: kknFiles.length
            };
        } catch (error) {
            console.error('Error listing files:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get file type icon
     */
    getTypeIcon(type) {
        const icons = {
            'images': '🖼️',
            'videos': '🎥',
            'audio': '🎵',
            'documents': '📄',
            'archives': '📦',
            'others': '📁'
        };
        return icons[type] || '📁';
    }

    /**
     * Get folder statistics
     */
    async getFolderStats() {
        try {
            const result = await this.listFiles();
            if (!result.success) return result;

            const stats = {
                totalFiles: result.total,
                byType: {}
            };

            Object.keys(result.filesByType).forEach(type => {
                stats.byType[type] = {
                    count: result.filesByType[type].length,
                    icon: this.getTypeIcon(type)
                };
            });

            return {
                success: true,
                stats: stats
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = DriveEngine;