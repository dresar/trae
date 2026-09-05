const moment = require('moment');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

// Admin settings cache to avoid reading file repeatedly
let adminSettingsCache = null;
const adminSettingsPath = path.join(__dirname, '../database/admin_settings.json');

/**
 * Load admin settings from JSON file
 * @returns {Object} Admin settings
 */
function loadAdminSettings() {
    try {
        if (!adminSettingsCache) {
            if (fs.existsSync(adminSettingsPath)) {
                const data = fs.readFileSync(adminSettingsPath, 'utf8');
                adminSettingsCache = JSON.parse(data);
            } else {
                // Create default settings if file doesn't exist
                adminSettingsCache = {
                    global_admins: ["6282392115909"],
                    owner: "6282392115909",
                    settings: {
                        allow_multiple_admins: true,
                        admin_permissions: {
                            manage_groups: true,
                            manage_users: true,
                            manage_files: true,
                            manage_finance: true,
                            view_logs: true,
                            manage_settings: true
                        }
                    }
                };
                fs.writeFileSync(adminSettingsPath, JSON.stringify(adminSettingsCache, null, 2));
            }
        }
        return adminSettingsCache;
    } catch (error) {
        console.error('Error loading admin settings:', error);
        // Fallback to default settings
        return {
            global_admins: ["6282392115909"],
            owner: "6282392115909",
            settings: {
                allow_multiple_admins: true,
                admin_permissions: {}
            }
        };
    }
}

/**
 * Save admin settings to JSON file
 * @param {Object} settings - Admin settings to save
 */
function saveAdminSettings(settings) {
    try {
        adminSettingsCache = settings;
        fs.writeFileSync(adminSettingsPath, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Error saving admin settings:', error);
    }
}

/**
 * Get admin numbers from JSON instead of ENV
 * @returns {Array} Array of admin numbers
 */
function getAdminNumbers() {
    const settings = loadAdminSettings();
    return settings.global_admins || [];
}

/**
 * Check if user is admin
 * @param {string} userNumber - User phone number
 * @param {Array} adminNumbers - Array of admin numbers
 * @returns {boolean} Is admin
 */
function isAdmin(userNumber, adminNumbersFromCaller) {
    // Normalize incoming identifier to plain phone number using our helper
    const normalized = normalizeSenderToPhone(String(userNumber || ''));
    if (!normalized) return false;

    // Prefer caller-provided list, else load from JSON
    const admins = Array.isArray(adminNumbersFromCaller) && adminNumbersFromCaller.length > 0
        ? adminNumbersFromCaller
        : getAdminNumbers();
    return admins.includes(normalized);
}

/**
 * Format currency (Indonesian Rupiah)
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

/**
 * Format date
 * @param {Date|string} date - Date to format
 * @param {string} format - Date format (default: DD/MM/YYYY HH:mm)
 * @returns {string} Formatted date
 */
function formatDate(date, format = 'DD/MM/YYYY HH:mm') {
    return moment(date).format(format);
}

/**
 * Generate unique ID
 * @param {number} length - ID length (default: 8)
 * @returns {string} Unique ID
 */
function generateId(length = 8) {
    return crypto.randomBytes(length).toString('hex').substring(0, length);
}

/**
 * Parse amount from string
 * @param {string} amountStr - Amount string
 * @returns {number} Parsed amount
 */
function parseAmount(amountStr) {
    if (!amountStr) return 0;
    
    // Remove currency symbols and separators
    const cleaned = amountStr.replace(/[^0-9.-]/g, '');
    const amount = parseFloat(cleaned);
    
    return isNaN(amount) ? 0 : amount;
}

/**
 * Validate phone number
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} Is valid
 */
function isValidPhoneNumber(phoneNumber) {
    const phoneRegex = /^[0-9]{10,15}$/;
    return phoneRegex.test(phoneNumber.replace(/[^0-9]/g, ''));
}

/**
 * Format phone number to WhatsApp format
 * @param {string} phoneNumber - Phone number
 * @returns {string} Formatted phone number
 */
function formatPhoneNumber(phoneNumber) {
    let cleaned = phoneNumber.replace(/[^0-9]/g, '');
    
    // Add country code if not present
    if (cleaned.startsWith('0')) {
        cleaned = '62' + cleaned.substring(1);
    } else if (!cleaned.startsWith('62')) {
        cleaned = '62' + cleaned;
    }
    
    return cleaned + '@s.whatsapp.net';
}

/**
 * Get file size in human readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Human readable size
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get file extension
 * @param {string} filename - File name
 * @returns {string} File extension
 */
function getFileExtension(filename) {
    return path.extname(filename).toLowerCase().substring(1);
}

/**
 * Check if file type is allowed
 * @param {string} filename - File name
 * @param {Array} allowedTypes - Array of allowed types
 * @returns {boolean} Is allowed
 */
function isAllowedFileType(filename, allowedTypes) {
    const ext = getFileExtension(filename);
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    const videoTypes = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', '3gp'];
    const audioTypes = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'];
    const documentTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
    const archiveTypes = ['zip', 'rar', '7z', 'tar', 'gz'];
    
    for (const type of allowedTypes) {
        switch (type) {
            case 'image':
                if (imageTypes.includes(ext)) return true;
                break;
            case 'video':
                if (videoTypes.includes(ext)) return true;
                break;
            case 'audio':
                if (audioTypes.includes(ext)) return true;
                break;
            case 'document':
                if (documentTypes.includes(ext)) return true;
                break;
            case 'archive':
                if (archiveTypes.includes(ext)) return true;
                break;
        }
    }
    
    return false;
}

/**
 * Sleep function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after ms
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Escape markdown characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeMarkdown(text) {
    return text.replace(/[*_`~]/g, '\\$&');
}

/**
 * Generate random string
 * @param {number} length - String length
 * @returns {string} Random string
 */
function generateRandomString(length = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
}

/**
 * Validate email address
 * @param {string} email - Email to validate
 * @returns {boolean} Is valid email
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Get time ago string
 * @param {Date|string} date - Date
 * @returns {string} Time ago string
 */
function getTimeAgo(date) {
    return moment(date).fromNow();
}

/**
 * Capitalize first letter
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Truncate text
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength = 100) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Parse command arguments
 * @param {string} text - Command text
 * @param {string} prefix - Command prefix
 * @returns {Object} Parsed command
 */
function parseCommand(text, prefix = '!') {
    if (!text.startsWith(prefix)) return null;
    
    const args = text.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    return { command, args, full: text };
}

/**
 * Check if string is URL
 * @param {string} str - String to check
 * @returns {boolean} Is URL
 */
function isUrl(str) {
    try {
        new URL(str);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get random element from array
 * @param {Array} array - Array
 * @returns {*} Random element
 */
function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Convert bytes to MB
 * @param {number} bytes - Bytes
 * @returns {number} MB
 */
function bytesToMB(bytes) {
    return bytes / (1024 * 1024);
}

/**
 * Convert MB to bytes
 * @param {number} mb - MB
 * @returns {number} Bytes
 */
function mbToBytes(mb) {
    return mb * 1024 * 1024;
}

/**
 * Check if file exists
 * @param {string} filePath - File path
 * @returns {boolean} File exists
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Create directory if not exists
 * @param {string} dirPath - Directory path
 */
async function ensureDir(dirPath) {
    await fs.ensureDir(dirPath);
}

/**
 * Get system uptime in human readable format
 * @returns {string} Uptime string
 */
function getUptime() {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0) result += `${minutes}m `;
    result += `${seconds}s`;
    
    return result.trim();
}

/**
 * Get memory usage in human readable format
 * @returns {Object} Memory usage
 */
function getMemoryUsage() {
    const usage = process.memoryUsage();
    
    return {
        rss: formatFileSize(usage.rss),
        heapTotal: formatFileSize(usage.heapTotal),
        heapUsed: formatFileSize(usage.heapUsed),
        external: formatFileSize(usage.external)
    };
}

/**
 * Log with timestamp
 * @param {string} message - Message to log
 * @param {string} level - Log level
 */
function log(message, level = 'info') {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    const levelUpper = level.toUpperCase();
    console.log(`[${timestamp}] [${levelUpper}] ${message}`);
}

/**
 * Get the phone number from LID using mapping
 * @param {string} lidNumber - LID number (without @lid)
 * @returns {string} Phone number or original LID if not found
 */
function phoneFromLID(lidNumber) {
    try {
        // Read latest settings directly to avoid stale cache for mapping
        const raw = fs.readFileSync(adminSettingsPath, 'utf8');
        const settings = JSON.parse(raw);
        return settings.lid_to_phone_mapping && settings.lid_to_phone_mapping[lidNumber]
            ? settings.lid_to_phone_mapping[lidNumber]
            : lidNumber;
    } catch (error) {
        console.error('Error getting phone from LID:', error);
        // Fallback to cached settings if available
        try {
            const settings = loadAdminSettings();
            return settings.lid_to_phone_mapping && settings.lid_to_phone_mapping[lidNumber]
                ? settings.lid_to_phone_mapping[lidNumber]
                : lidNumber;
        } catch (_) {
            return lidNumber;
        }
    }
}

/**
 * Get the LID from phone number using mapping
 * @param {string} phoneNumber - Phone number
 * @returns {string} LID number or original phone if not found
 */
function lidFromPhone(phoneNumber) {
    try {
        // Read latest settings directly to avoid stale cache for mapping
        const raw = fs.readFileSync(adminSettingsPath, 'utf8');
        const settings = JSON.parse(raw);
        return settings.phone_to_lid_mapping && settings.phone_to_lid_mapping[phoneNumber]
            ? settings.phone_to_lid_mapping[phoneNumber]
            : phoneNumber;
    } catch (error) {
        console.error('Error getting LID from phone:', error);
        // Fallback to cached settings if available
        try {
            const settings = loadAdminSettings();
            return settings.phone_to_lid_mapping && settings.phone_to_lid_mapping[phoneNumber]
                ? settings.phone_to_lid_mapping[phoneNumber]
                : phoneNumber;
        } catch (_) {
            return phoneNumber;
        }
    }
}

/**
 * Normalize sender ID to phone number for admin checks
 * @param {string} sender - Raw sender ID (@s.whatsapp.net, @lid, @c.us)
 * @returns {string} Normalized phone number
 */
function normalizeSenderToPhone(sender) {
    // Clean basic WhatsApp formats
    let senderNumber = sender.replace('@s.whatsapp.net', '').replace('@c.us', '');
    
    // Handle @lid format specifically
    if (sender.includes('@lid')) {
        // Extract the LID number from @lid format
        const lidMatch = sender.match(/(\d+)@lid/);
        if (lidMatch) {
            const lidNumber = lidMatch[1];
            // Try to map LID to actual phone number
            senderNumber = phoneFromLID(lidNumber);
        } else {
            // Fallback: remove @lid suffix
            senderNumber = sender.replace('@lid', '');
        }
    }
    
    return senderNumber;
}

module.exports = {
    isAdmin,
    formatCurrency,
    formatDate,
    generateId,
    parseAmount,
    isValidPhoneNumber,
    formatPhoneNumber,
    formatFileSize,
    getFileExtension,
    isAllowedFileType,
    sleep,
    escapeMarkdown,
    generateRandomString,
    isValidEmail,
    getTimeAgo,
    capitalize,
    truncateText,
    parseCommand,
    isUrl,
    getRandomElement,
    bytesToMB,
    mbToBytes,
    fileExists,
    ensureDir,
    getUptime,
    getMemoryUsage,
    log,
    // Admin management functions
    loadAdminSettings,
    saveAdminSettings,
    getAdminNumbers,
    // LID/Phone mapping functions
    phoneFromLID,
    lidFromPhone,
    normalizeSenderToPhone
};