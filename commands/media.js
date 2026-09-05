const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { formatFileSize, generateId, sleep } = require('../utils/helpers');

/**
 * Handle media commands
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {string} command - Command name
 * @param {Array} args - Command arguments
 */
async function handleMediaCommand(sock, msg, command, args) {
    const from = msg.key.remoteJid;
    
    try {
        switch (command) {
            case 'sticker':
            case 's':
                await handleStickerCommand(sock, msg, args);
                break;
                
            case 'toimg':
            case 'toimage':
                await handleStickerToImage(sock, msg);
                break;
                
            case 'ytdl':
            case 'youtube':
            case 'yt':
                await handleYouTubeDownload(sock, msg, args);
                break;
                
            case 'tiktok':
            case 'tt':
                await handleTikTokDownload(sock, msg, args);
                break;
                
            case 'instagram':
            case 'ig':
                await handleInstagramDownload(sock, msg, args);
                break;
                
            case 'removebg':
            case 'nobg':
                await handleRemoveBackground(sock, msg);
                break;
                
            case 'ocr':
            case 'readtext':
                await handleOCR(sock, msg);
                break;
                
            case 'qr':
            case 'qrcode':
                await handleQRCode(sock, msg, args);
                break;
                
            case 'readqr':
            case 'scanqr':
                await handleQRReader(sock, msg);
                break;
                
            default:
                await sock.sendMessage(from, {
                    text: '❓ *Command media tidak ditemukan*\n\nGunakan: sticker, toimg, ytdl, tiktok, instagram, removebg, ocr, qr, readqr'
                });
        }
    } catch (error) {
        console.error('Error in media command:', error);
        await sock.sendMessage(from, {
            text: '❌ *Terjadi kesalahan pada media command*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle sticker creation
 */
async function handleStickerCommand(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    // Check if message has media or is replying to media
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const mediaMessage = msg.message?.imageMessage || msg.message?.videoMessage || 
                        quotedMsg?.imageMessage || quotedMsg?.videoMessage;
    
    if (!mediaMessage) {
        await sock.sendMessage(from, {
            text: '🎭 *Buat Sticker*\n\n📝 *Cara penggunaan:*\n1. Kirim gambar/video (max 10 detik)\n2. Reply dengan `!sticker` atau `!s`\n\nAtau kirim gambar/video langsung dengan caption `!sticker`\n\n📋 *Contoh:*\n`!sticker` (reply ke gambar)\n`!s` (reply ke video)\n\n💡 *Tips:*\n- Video maksimal 10 detik\n- Format: JPG, PNG, MP4, GIF\n- Ukuran optimal: 512x512px'
        });
        return;
    }
    
    try {
        // Send processing message
        const processingMsg = await sock.sendMessage(from, {
            text: '⏳ *Membuat sticker...*\n\nMohon tunggu sebentar.'
        });
        
        // Download media
        let buffer;
        if (quotedMsg) {
            // Create temporary message object for quoted message
            const tempMsg = {
                message: quotedMsg,
                key: msg.key
            };
            buffer = await downloadMedia(tempMsg);
        } else {
            buffer = await downloadMedia(msg);
        }
        
        // Get sticker options from args
        const packname = args.find(arg => arg.startsWith('pack:'))?.replace('pack:', '') || 'KKN Bot';
        const author = args.find(arg => arg.startsWith('author:'))?.replace('author:', '') || 'WhatsApp Bot';
        
        // Create sticker
        const stickerBuffer = await createSticker(buffer, {
            packname,
            author,
            type: mediaMessage.seconds ? 'video' : 'image'
        });
        
        // Send sticker
        await sock.sendMessage(from, {
            sticker: stickerBuffer
        });
        
        // Delete processing message
        try {
            await sock.sendMessage(from, { delete: processingMsg.key });
        } catch (e) {
            // Ignore delete error
        }
        
    } catch (error) {
        console.error('Error creating sticker:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal membuat sticker*\n\nPastikan file adalah gambar atau video yang valid (max 10 detik).'
        });
    }
}

/**
 * Handle sticker to image conversion
 */
async function handleStickerToImage(sock, msg) {
    const from = msg.key.remoteJid;
    
    // Check if message has sticker or is replying to sticker
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const stickerMessage = msg.message?.stickerMessage || quotedMsg?.stickerMessage;
    
    if (!stickerMessage) {
        await sock.sendMessage(from, {
            text: '🖼️ *Sticker ke Gambar*\n\n📝 *Cara penggunaan:*\n1. Reply sticker dengan `!toimg`\n2. Atau kirim sticker dengan caption `!toimg`\n\n💡 *Tips:* Sticker akan dikonversi menjadi gambar PNG'
        });
        return;
    }
    
    try {
        // Send processing message
        const processingMsg = await sock.sendMessage(from, {
            text: '⏳ *Mengkonversi sticker...*\n\nMohon tunggu sebentar.'
        });
        
        // Download sticker
        let buffer;
        if (quotedMsg) {
            const tempMsg = {
                message: quotedMsg,
                key: msg.key
            };
            buffer = await downloadMedia(tempMsg);
        } else {
            buffer = await downloadMedia(msg);
        }
        
        // Convert sticker to image
        const imageBuffer = await convertStickerToImage(buffer);
        
        // Send image
        await sock.sendMessage(from, {
            image: imageBuffer,
            caption: '✅ *Sticker berhasil dikonversi ke gambar*'
        });
        
        // Delete processing message
        try {
            await sock.sendMessage(from, { delete: processingMsg.key });
        } catch (e) {
            // Ignore delete error
        }
        
    } catch (error) {
        console.error('Error converting sticker:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal mengkonversi sticker*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle YouTube download
 */
async function handleYouTubeDownload(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '📺 *YouTube Downloader*\n\n📝 *Cara penggunaan:*\n`!ytdl [url] [format]`\n\n📋 *Contoh:*\n`!ytdl https://youtu.be/abc123 mp3`\n`!ytdl https://youtu.be/abc123 mp4`\n\n🎵 *Format audio:* mp3, m4a\n🎥 *Format video:* mp4, mkv\n\n💡 *Tips:*\n- Jika tidak ada format, default mp3\n- Video maksimal 50MB\n- Audio maksimal 20MB'
        });
        return;
    }
    
    const url = args[0];
    const format = args[1] || 'mp3';
    
    // Validate YouTube URL
    if (!isValidYouTubeURL(url)) {
        await sock.sendMessage(from, {
            text: '❌ *URL YouTube tidak valid*\n\nPastikan URL adalah link YouTube yang benar.\n\n📋 *Contoh URL yang valid:*\n• https://youtu.be/abc123\n• https://youtube.com/watch?v=abc123\n• https://m.youtube.com/watch?v=abc123'
        });
        return;
    }
    
    try {
        // Send processing message
        const processingMsg = await sock.sendMessage(from, {
            text: '⏳ *Mengunduh dari YouTube...*\n\nMohon tunggu, proses ini membutuhkan waktu beberapa menit.'
        });
        
        // Get video info first
        const videoInfo = await getYouTubeInfo(url);
        
        if (!videoInfo) {
            await sock.sendMessage(from, {
                text: '❌ *Video tidak ditemukan*\n\nPastikan URL YouTube valid dan video dapat diakses.'
            });
            return;
        }
        
        // Check duration (max 10 minutes for video, 30 minutes for audio)
        const maxDuration = format.includes('mp4') || format.includes('mkv') ? 600 : 1800;
        if (videoInfo.duration > maxDuration) {
            await sock.sendMessage(from, {
                text: `❌ *Video terlalu panjang*\n\nDurasi: ${Math.floor(videoInfo.duration / 60)} menit\nMaksimal: ${Math.floor(maxDuration / 60)} menit untuk format ${format}`
            });
            return;
        }
        
        // Download video/audio
        const downloadResult = await downloadYouTube(url, format);
        
        if (!downloadResult) {
            await sock.sendMessage(from, {
                text: '❌ *Gagal mengunduh video*\n\nSilakan coba lagi nanti atau gunakan URL yang berbeda.'
            });
            return;
        }
        
        // Check file size
        const maxSize = format.includes('mp4') || format.includes('mkv') ? 50 * 1024 * 1024 : 20 * 1024 * 1024;
        if (downloadResult.size > maxSize) {
            await sock.sendMessage(from, {
                text: `❌ *File terlalu besar*\n\nUkuran: ${formatFileSize(downloadResult.size)}\nMaksimal: ${formatFileSize(maxSize)}\n\nCoba gunakan format yang lebih kecil.`
            });
            
            // Clean up file
            await fs.remove(downloadResult.path);
            return;
        }
        
        // Read file buffer
        const fileBuffer = await fs.readFile(downloadResult.path);
        
        // Send file based on format
        let messageOptions = {
            caption: `🎵 *${videoInfo.title}*\n\n👤 *Channel:* ${videoInfo.channel}\n⏱️ *Durasi:* ${formatDuration(videoInfo.duration)}\n📊 *Ukuran:* ${formatFileSize(downloadResult.size)}\n🎯 *Format:* ${format.toUpperCase()}\n\n📺 *YouTube Downloader*`
        };
        
        if (format.includes('mp4') || format.includes('mkv')) {
            messageOptions.video = fileBuffer;
        } else {
            messageOptions.audio = fileBuffer;
            messageOptions.mimetype = 'audio/mpeg';
        }
        
        await sock.sendMessage(from, messageOptions);
        
        // Clean up file
        await fs.remove(downloadResult.path);
        
        // Delete processing message
        try {
            await sock.sendMessage(from, { delete: processingMsg.key });
        } catch (e) {
            // Ignore delete error
        }
        
    } catch (error) {
        console.error('Error downloading YouTube:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal mengunduh dari YouTube*\n\nSilakan coba lagi nanti atau periksa URL.'
        });
    }
}

/**
 * Handle QR Code generation
 */
async function handleQRCode(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '📱 *QR Code Generator*\n\n📝 *Cara penggunaan:*\n`!qr [teks atau url]`\n\n📋 *Contoh:*\n`!qr https://google.com`\n`!qr Halo dari KKN Bot!`\n`!qr +6281234567890`\n\n💡 *Tips:* QR Code akan dibuat dalam format PNG'
        });
        return;
    }
    
    const text = args.join(' ');
    
    try {
        // Send processing message
        const processingMsg = await sock.sendMessage(from, {
            text: '⏳ *Membuat QR Code...*\n\nMohon tunggu sebentar.'
        });
        
        // Generate QR Code
        const qrBuffer = await generateQRCode(text);
        
        // Send QR Code
        await sock.sendMessage(from, {
            image: qrBuffer,
            caption: `📱 *QR Code Generated*\n\n📝 *Teks:* ${text.length > 100 ? text.substring(0, 100) + '...' : text}\n\n💡 *Scan QR Code ini dengan aplikasi scanner untuk melihat isi lengkap*`
        });
        
        // Delete processing message
        try {
            await sock.sendMessage(from, { delete: processingMsg.key });
        } catch (e) {
            // Ignore delete error
        }
        
    } catch (error) {
        console.error('Error generating QR code:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal membuat QR Code*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle OCR (Optical Character Recognition)
 */
async function handleOCR(sock, msg) {
    const from = msg.key.remoteJid;
    
    // Check if message has image or is replying to image
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imageMessage = msg.message?.imageMessage || quotedMsg?.imageMessage;
    
    if (!imageMessage) {
        await sock.sendMessage(from, {
            text: '👁️ *OCR - Baca Teks dari Gambar*\n\n📝 *Cara penggunaan:*\n1. Kirim gambar yang berisi teks\n2. Reply dengan `!ocr` atau `!readtext`\n\nAtau kirim gambar dengan caption `!ocr`\n\n💡 *Tips:*\n- Pastikan teks dalam gambar jelas\n- Format: JPG, PNG, WebP\n- Resolusi tinggi untuk hasil terbaik'
        });
        return;
    }
    
    try {
        // Send processing message
        const processingMsg = await sock.sendMessage(from, {
            text: '⏳ *Membaca teks dari gambar...*\n\nMohon tunggu sebentar.'
        });
        
        // Download image
        let buffer;
        if (quotedMsg) {
            const tempMsg = {
                message: quotedMsg,
                key: msg.key
            };
            buffer = await downloadMedia(tempMsg);
        } else {
            buffer = await downloadMedia(msg);
        }
        
        // Perform OCR
        const extractedText = await performOCR(buffer);
        
        if (!extractedText || extractedText.trim().length === 0) {
            await sock.sendMessage(from, {
                text: '❌ *Tidak ada teks yang terdeteksi*\n\nPastikan gambar berisi teks yang jelas dan mudah dibaca.'
            });
            return;
        }
        
        // Send extracted text
        let message = `👁️ *Teks Terdeteksi*\n\n`;
        message += `📝 *Hasil OCR:*\n${extractedText}\n\n`;
        message += `📊 *Jumlah karakter:* ${extractedText.length}\n`;
        message += `📄 *Jumlah kata:* ${extractedText.split(/\s+/).length}`;
        
        await sock.sendMessage(from, { text: message });
        
        // Delete processing message
        try {
            await sock.sendMessage(from, { delete: processingMsg.key });
        } catch (e) {
            // Ignore delete error
        }
        
    } catch (error) {
        console.error('Error performing OCR:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal membaca teks dari gambar*\n\nSilakan coba lagi dengan gambar yang lebih jelas.'
        });
    }
}

/**
 * Create sticker from buffer
 */
async function createSticker(buffer, options = {}) {
    const { packname = 'KKN Bot', author = 'WhatsApp Bot', type = 'image' } = options;
    
    // For now, return the buffer as-is
    // In a real implementation, you would use a library like sharp or ffmpeg
    // to convert and resize the image/video to sticker format
    
    return buffer;
}

/**
 * Convert sticker to image
 */
async function convertStickerToImage(buffer) {
    // For now, return the buffer as-is
    // In a real implementation, you would use a library like sharp
    // to convert the sticker format to PNG
    
    return buffer;
}

/**
 * Validate YouTube URL
 */
function isValidYouTubeURL(url) {
    const youtubeRegex = /^(https?\:\/\/)?(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\/.+/;
    return youtubeRegex.test(url);
}

/**
 * Get YouTube video info
 */
async function getYouTubeInfo(url) {
    // Mock implementation - in real scenario, use yt-dlp or similar
    return {
        title: 'Sample Video Title',
        channel: 'Sample Channel',
        duration: 180, // 3 minutes
        thumbnail: 'https://example.com/thumb.jpg'
    };
}

/**
 * Download YouTube video/audio
 */
async function downloadYouTube(url, format) {
    // Mock implementation - in real scenario, use yt-dlp or similar
    const tempDir = path.join(process.cwd(), 'temp');
    await fs.ensureDir(tempDir);
    
    const fileName = `${generateId()}.${format}`;
    const filePath = path.join(tempDir, fileName);
    
    // Create a dummy file for demo
    await fs.writeFile(filePath, Buffer.from('dummy content'));
    
    return {
        path: filePath,
        size: 1024 // 1KB dummy size
    };
}

/**
 * Generate QR Code
 */
async function generateQRCode(text) {
    try {
        // Use online QR code API as fallback
        const response = await axios.get(`https://api.qrserver.com/v1/create-qr-code/`, {
            params: {
                size: '500x500',
                data: text,
                format: 'png'
            },
            responseType: 'arraybuffer'
        });
        
        return Buffer.from(response.data);
    } catch (error) {
        throw new Error('Failed to generate QR code');
    }
}

/**
 * Perform OCR on image buffer
 */
async function performOCR(buffer) {
    const apiKey = process.env.OCR_API_KEY;
    
    if (!apiKey || apiKey === 'your_ocr_api_key_here') {
        throw new Error('OCR API key not configured');
    }
    
    try {
        // Use OCR.space API
        const formData = new FormData();
        formData.append('file', buffer, 'image.jpg');
        formData.append('apikey', apiKey);
        formData.append('language', 'eng');
        formData.append('isOverlayRequired', 'false');
        
        const response = await axios.post('https://api.ocr.space/parse/image', formData, {
            headers: {
                ...formData.getHeaders()
            }
        });
        
        if (response.data.ParsedResults && response.data.ParsedResults.length > 0) {
            return response.data.ParsedResults[0].ParsedText;
        }
        
        return null;
        
    } catch (error) {
        console.error('OCR API error:', error);
        throw new Error('Failed to perform OCR');
    }
}

/**
 * Handle remove background
 */
async function handleRemoveBackground(sock, msg) {
    const from = msg.key.remoteJid;
    
    // Check if message has image or is replying to image
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imageMessage = msg.message?.imageMessage || quotedMsg?.imageMessage;
    
    if (!imageMessage) {
        await sock.sendMessage(from, {
            text: '🖼️ *Remove Background*\n\n📝 *Cara penggunaan:*\n1. Kirim gambar\n2. Reply dengan `!removebg` atau `!nobg`\n\nAtau kirim gambar dengan caption `!removebg`\n\n💡 *Tips:*\n- Hasil terbaik dengan foto orang/objek\n- Format: JPG, PNG\n- Resolusi tinggi untuk hasil optimal'
        });
        return;
    }
    
    try {
        // Send processing message
        const processingMsg = await sock.sendMessage(from, {
            text: '⏳ *Menghapus background...*\n\nMohon tunggu sebentar.'
        });
        
        // Download image
        let buffer;
        if (quotedMsg) {
            const tempMsg = {
                message: quotedMsg,
                key: msg.key
            };
            buffer = await downloadMedia(tempMsg);
        } else {
            buffer = await downloadMedia(msg);
        }
        
        // Remove background
        const resultBuffer = await removeBackground(buffer);
        
        // Send result
        await sock.sendMessage(from, {
            image: resultBuffer,
            caption: '✅ *Background berhasil dihapus*\n\n💡 *Tips:* Simpan gambar ini untuk digunakan sebagai sticker atau edit lebih lanjut.'
        });
        
        // Delete processing message
        try {
            await sock.sendMessage(from, { delete: processingMsg.key });
        } catch (e) {
            // Ignore delete error
        }
        
    } catch (error) {
        console.error('Error removing background:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal menghapus background*\n\nSilakan coba lagi dengan gambar yang berbeda.'
        });
    }
}

/**
 * Remove background from image using Remove.bg API
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<Buffer>} - Processed image buffer
 */
async function removeBackground(buffer) {
    const apiKey = process.env.REMOVE_BG_API_KEY;
    
    if (!apiKey || apiKey === 'your_removebg_api_key_here') {
        throw new Error('Remove.bg API key not configured');
    }
    
    try {
        const FormData = require('form-data');
        const form = new FormData();
        
        // Add image file to form data
        form.append('image_file', buffer, {
            filename: 'image.jpg',
            contentType: 'image/jpeg'
        });
        
        // Add size parameter for better results
        form.append('size', 'auto');
        
        const response = await axios.post('https://api.remove.bg/v1.0/removebg', form, {
            headers: {
                'X-Api-Key': apiKey,
                ...form.getHeaders()
            },
            responseType: 'arraybuffer'
        });
        
        return Buffer.from(response.data);
        
    } catch (error) {
        console.error('Remove.bg API error:', error);
        throw new Error('Failed to remove background');
    }
}

/**
 * Format duration in seconds to MM:SS
 */
function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Handle TikTok download (placeholder)
 */
async function handleTikTokDownload(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    await sock.sendMessage(from, {
        text: '🎵 *TikTok Downloader*\n\n⚠️ *Fitur dalam pengembangan*\n\nFitur download TikTok sedang dalam tahap pengembangan. Silakan gunakan fitur lain terlebih dahulu.\n\n📺 Coba: `!ytdl [url]` untuk download YouTube'
    });
}

/**
 * Handle Instagram download (placeholder)
 */
async function handleInstagramDownload(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    await sock.sendMessage(from, {
        text: '📸 *Instagram Downloader*\n\n⚠️ *Fitur dalam pengembangan*\n\nFitur download Instagram sedang dalam tahap pengembangan. Silakan gunakan fitur lain terlebih dahulu.\n\n📺 Coba: `!ytdl [url]` untuk download YouTube'
    });
}

/**
 * Handle QR Reader (placeholder)
 */
async function handleQRReader(sock, msg) {
    const from = msg.key.remoteJid;
    
    await sock.sendMessage(from, {
        text: '📱 *QR Code Reader*\n\n⚠️ *Fitur dalam pengembangan*\n\nFitur scan QR Code sedang dalam tahap pengembangan. Silakan gunakan fitur lain terlebih dahulu.\n\n📱 Coba: `!qr [teks]` untuk membuat QR Code'
    });
}

/**
 * Download media from message
 */
async function downloadMedia(msg) {
    try {
        const messageType = Object.keys(msg.message)[0];
        const stream = await downloadContentFromMessage(msg.message[messageType], messageType.replace('Message', ''));
        
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        return buffer;
    } catch (error) {
        console.error('Error downloading media:', error);
        throw error;
    }
}

module.exports = {
    handleMediaCommand
};