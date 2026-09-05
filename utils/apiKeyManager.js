const fs = require('fs');
const path = require('path');

/**
 * API Key Manager untuk mengelola multiple API keys
 */
class APIKeyManager {
    constructor() {
        this.configPath = path.join(__dirname, '..', '.env');
        this.loadConfig();
        this.loadDatabase();
    }

    /**
     * Load konfigurasi dari file .env
     */
    loadConfig() {
        try {
            // Reload environment variables
            require('dotenv').config({ path: this.configPath });
            
            // Initialize API keys storage
            this.apiKeys = {
                gemini: {},
                groq: {},
                ipapi: {},
                ipinfo: {},
                ipgeolocation: {},
                abuseipdb: {},
                whoisapi: {}
            };
            
            // Load Gemini API keys
            for (let i = 1; i <= 5; i++) {
                const key = process.env[`GEMINI_API_KEY_${i}`];
                if (key && key !== `your_gemini_api_key_${i}_here`) {
                    this.apiKeys.gemini[i] = key;
                }
            }
            
            // Load Groq API keys
            for (let i = 1; i <= 5; i++) {
                const key = process.env[`GROQ_API_KEY_${i}`];
                if (key && key !== `your_groq_api_key_${i}_here`) {
                    this.apiKeys.groq[i] = key;
                }
            }
            
            // Load IP Geolocation API keys
            const ipApiKey = process.env.IPAPI_API_KEY;
            if (ipApiKey && ipApiKey !== 'your_ipapi_key_here') {
                this.apiKeys.ipapi[1] = ipApiKey;
            }
            
            const ipInfoKey = process.env.IPINFO_API_KEY;
            if (ipInfoKey && ipInfoKey !== 'your_ipinfo_key_here') {
                this.apiKeys.ipinfo[1] = ipInfoKey;
            }
            
            const ipGeoKey = process.env.IP_GEOLOCATION_API_KEY;
            if (ipGeoKey && ipGeoKey !== 'your_ip_geolocation_key_here') {
                this.apiKeys.ipgeolocation[1] = ipGeoKey;
            }
            
            const abuseIpKey = process.env.ABUSEIPDB_API_KEY;
            if (abuseIpKey && abuseIpKey !== 'your_abuseipdb_key_here') {
                this.apiKeys.abuseipdb[1] = abuseIpKey;
            }
            
            // Load Whois API keys
            const whoisKey = process.env.WHOISAPI_KEY;
            if (whoisKey && whoisKey !== 'your_whoisapi_key_here') {
                this.apiKeys.whoisapi[1] = whoisKey;
            }
            
            // Load current API key settings
            this.currentKeys = {
                gemini: parseInt(process.env.CURRENT_GEMINI_API_KEY) || 1,
                groq: parseInt(process.env.CURRENT_GROQ_API_KEY) || 1,
                ipapi: 1,
                ipinfo: 1,
                ipgeolocation: 1,
                abuseipdb: 1,
                whoisapi: 1
            };
        } catch (error) {
            console.error('Error loading .env config:', error);
        }
    }

    loadDatabase() {
        this.dbPath = path.join(__dirname, '..', 'database', 'api_settings.json');
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                this.database = JSON.parse(data);
            } else {
                this.database = {
                    users: {},
                    global_settings: {
                        default_gemini_key: 1,
                        default_groq_key: 1,
                        default_ipapi_key: 1,
                        default_ipinfo_key: 1,
                        default_ipgeolocation_key: 1,
                        default_abuseipdb_key: 1,
                        default_whoisapi_key: 1
                    },
                    api_usage_stats: {
                        gemini: {},
                        groq: {},
                        ipapi: {},
                        ipinfo: {},
                        ipgeolocation: {},
                        abuseipdb: {},
                        whoisapi: {}
                    }
                };
                this.saveDatabase();
            }
        } catch (error) {
            console.error('Error loading API settings database:', error);
            this.database = {
                users: {},
                global_settings: {
                    default_gemini_key: 1,
                    default_groq_key: 1,
                    default_ipapi_key: 1,
                    default_ipinfo_key: 1,
                    default_ipgeolocation_key: 1,
                    default_abuseipdb_key: 1,
                    default_whoisapi_key: 1
                },
                api_usage_stats: {
                    gemini: {},
                    groq: {},
                    ipapi: {},
                    ipinfo: {},
                    ipgeolocation: {},
                    abuseipdb: {},
                    whoisapi: {}
                }
            };
        }
    }

    saveDatabase() {
        try {
            fs.writeFileSync(this.dbPath, JSON.stringify(this.database, null, 2));
        } catch (error) {
            console.error('Error saving API settings database:', error);
        }
    }

    /**
     * Mendapatkan API key yang sedang aktif untuk user tertentu
     * @param {string} provider - 'gemini' atau 'groq'
     * @param {string} userId - ID user WhatsApp (opsional)
     * @returns {string} API key yang aktif
     */
    getCurrentAPIKey(provider, userId = null) {
        let keyNumber;
        
        if (userId && this.database.users[userId] && this.database.users[userId][`${provider}_key`]) {
            keyNumber = this.database.users[userId][`${provider}_key`];
        } else {
            keyNumber = this.getCurrentKeyNumber(provider);
        }
        
        const keyName = this.getKeyName(provider, keyNumber);
        return process.env[keyName] || null;
    }

    /**
     * Mendapatkan nomor API key yang sedang aktif
     * @param {string} provider - 'gemini' atau 'groq'
     * @returns {number} Nomor API key (1-5)
     */
    getCurrentKeyNumber(provider) {
        const settingName = this.getSettingName(provider);
        return parseInt(process.env[settingName]) || 1;
    }

    /**
     * Mengubah API key yang digunakan
     * @param {string} provider - 'gemini' atau 'groq'
     * @param {number} keyNumber - Nomor API key (1-5)
     * @returns {boolean} Success status
     */
    setCurrentAPIKey(provider, keyNumber) {
        if (keyNumber < 1 || keyNumber > 5) {
            return false;
        }

        try {
            const settingName = this.getSettingName(provider);
            this.updateEnvFile(settingName, keyNumber.toString());
            
            // Update process.env
            process.env[settingName] = keyNumber.toString();
            
            return true;
        } catch (error) {
            console.error('Error setting API key:', error);
            return false;
        }
    }

    /**
     * Mendapatkan nama setting untuk provider
     * @param {string} provider 
     * @returns {string}
     */
    getSettingName(provider) {
        const settingMap = {
            'gemini': 'CURRENT_GEMINI_API_KEY',
            'groq': 'CURRENT_GROQ_API_KEY',
            'ipapi': 'CURRENT_IPAPI_KEY',
            'ipinfo': 'CURRENT_IPINFO_KEY',
            'ipgeolocation': 'CURRENT_IP_GEOLOCATION_KEY',
            'abuseipdb': 'CURRENT_ABUSEIPDB_KEY',
            'whoisapi': 'CURRENT_WHOISAPI_KEY'
        };
        return settingMap[provider];
    }

    /**
     * Mendapatkan nama API key untuk provider dan nomor
     * @param {string} provider 
     * @param {number} keyNumber 
     * @returns {string}
     */
    getKeyName(provider, keyNumber) {
        const keyMap = {
            'gemini': `GEMINI_API_KEY_${keyNumber}`,
            'groq': `GROQ_API_KEY_${keyNumber}`,
            'ipapi': 'IPAPI_API_KEY',
            'ipinfo': 'IPINFO_API_KEY',
            'ipgeolocation': 'IP_GEOLOCATION_API_KEY',
            'abuseipdb': 'ABUSEIPDB_API_KEY',
            'whoisapi': 'WHOISAPI_KEY'
        };
        return keyMap[provider];
    }

    /**
     * Mendapatkan semua API key untuk provider
     * @param {string} provider 
     * @returns {Array} Array of API keys with their status
     */
    getAllAPIKeys(provider) {
        const keys = [];
        const currentKey = this.getCurrentKeyNumber(provider);
        
        // Handle multiple key providers (Gemini, Groq)
        if (['gemini', 'groq'].includes(provider)) {
            for (let i = 1; i <= 5; i++) {
                const keyName = this.getKeyName(provider, i);
                const keyValue = process.env[keyName];
                const isActive = i === currentKey;
                const isConfigured = keyValue && !keyValue.includes('your_') && !keyValue.includes('_here');
                
                keys.push({
                    number: i,
                    name: keyName,
                    value: keyValue,
                    isActive,
                    isConfigured,
                    status: isActive ? '🟢 Active' : (isConfigured ? '⚪ Available' : '🔴 Not Configured')
                });
            }
        } else {
            // Handle single key providers (IP services, Whois)
            const keyName = this.getKeyName(provider, 1);
            const keyValue = process.env[keyName];
            const isConfigured = keyValue && !keyValue.includes('your_') && !keyValue.includes('_here');
            
            keys.push({
                number: 1,
                name: keyName,
                value: keyValue,
                isActive: true, // Single key is always active if configured
                isConfigured,
                status: isConfigured ? '🟢 Active' : '🔴 Not Configured'
            });
        }
        
        return keys;
    }

    /**
     * Update file .env dengan nilai baru
     * @param {string} key 
     * @param {string} value 
     */
    updateEnvFile(key, value) {
        try {
            let envContent = fs.readFileSync(this.configPath, 'utf8');
            const regex = new RegExp(`^${key}=.*$`, 'm');
            
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}=${value}`);
            } else {
                envContent += `\n${key}=${value}`;
            }
            
            fs.writeFileSync(this.configPath, envContent);
        } catch (error) {
            console.error('Error updating .env file:', error);
            throw error;
        }
    }

    /**
     * Mendapatkan statistik API keys
     * @returns {Object} Statistik penggunaan API keys
     */
    getAPIKeyStats() {
        const providers = ['gemini', 'groq', 'ipapi', 'ipinfo', 'ipgeolocation', 'abuseipdb', 'whoisapi'];
        const stats = {};
        
        providers.forEach(provider => {
            const keys = this.getAllAPIKeys(provider);
            const configured = keys.filter(k => k.isConfigured).length;
            const active = keys.find(k => k.isActive);
            
            // For single-key providers (IP services), total is 1
            const totalKeys = ['gemini', 'groq'].includes(provider) ? 5 : 1;
            
            stats[provider] = {
                total: totalKeys,
                configured,
                active: active ? active.number : 1,
                available: Math.max(0, configured - 1) // minus active key
            };
        });
        
        return stats;
    }

    /**
     * Validasi API key
     * @param {string} provider 
     * @param {number} keyNumber 
     * @returns {boolean}
     */
    validateAPIKey(provider, keyNumber) {
        const keyName = this.getKeyName(provider, keyNumber);
        const keyValue = process.env[keyName];
        
        return keyValue && 
               !keyValue.includes('your_') && 
               !keyValue.includes('_here') && 
               keyValue.length > 10;
    }

    /**
     * Rotate ke API key berikutnya yang tersedia
     * @param {string} provider 
     * @returns {number|null} Nomor API key baru atau null jika tidak ada
     */
    rotateToNextKey(provider) {
        const currentKey = this.getCurrentKeyNumber(provider);
        
        for (let i = 1; i <= 5; i++) {
            const nextKey = (currentKey + i - 1) % 5 + 1;
            if (nextKey !== currentKey && this.validateAPIKey(provider, nextKey)) {
                this.setCurrentAPIKey(provider, nextKey);
                return nextKey;
            }
        }
        
        return null;
    }

    /**
     * Mengatur API key untuk user tertentu
     * @param {string} userId - ID user WhatsApp
     * @param {string} provider - 'gemini' atau 'groq'
     * @param {number} keyNumber - Nomor API key (1-5)
     * @returns {boolean} Success status
     */
    setUserAPIKey(userId, provider, keyNumber) {
        if (!this.apiKeys[provider] || !this.apiKeys[provider][keyNumber]) {
            return false;
        }
        
        if (!this.database.users[userId]) {
            this.database.users[userId] = {};
        }
        
        this.database.users[userId][`${provider}_key`] = keyNumber;
        this.saveDatabase();
        return true;
    }

    /**
     * Mendapatkan pengaturan API key user
     * @param {string} userId - ID user WhatsApp
     * @returns {object} Pengaturan API key user
     */
    getUserAPIKeySettings(userId) {
        const userSettings = this.database.users[userId] || {};
        return {
            gemini_key: userSettings.gemini_key || this.database.global_settings.default_gemini_key,
            groq_key: userSettings.groq_key || this.database.global_settings.default_groq_key
        };
    }

    /**
     * Menghapus pengaturan API key user (kembali ke default)
     * @param {string} userId - ID user WhatsApp
     * @param {string} provider - 'gemini', 'groq', atau 'all'
     * @returns {boolean} Success status
     */
    resetUserAPIKey(userId, provider = 'all') {
        if (!this.database.users[userId]) {
            return true;
        }
        
        if (provider === 'all') {
            delete this.database.users[userId];
        } else {
            delete this.database.users[userId][`${provider}_key`];
            if (Object.keys(this.database.users[userId]).length === 0) {
                delete this.database.users[userId];
            }
        }
        
        this.saveDatabase();
        return true;
    }

    /**
     * Mendapatkan daftar API key yang tersedia untuk provider
     * @param {string} provider - 'gemini' atau 'groq'
     * @returns {array} Array nomor API key yang tersedia
     */
    getAvailableKeys(provider) {
        return Object.keys(this.apiKeys[provider] || {}).map(k => parseInt(k)).sort();
    }

    /**
     * Mendapatkan API key untuk layanan IP geolocation
     * @param {string} service - 'ipapi', 'ipinfo', 'ipgeolocation', 'abuseipdb'
     * @returns {string|null} API key atau null jika tidak dikonfigurasi
     */
    getIPGeolocationAPIKey(service) {
        return this.getCurrentAPIKey(service);
    }

    /**
     * Mendapatkan API key untuk layanan Whois
     * @returns {string|null} API key atau null jika tidak dikonfigurasi
     */
    getWhoisAPIKey() {
        return this.getCurrentAPIKey('whoisapi');
    }

    /**
     * Cek apakah API key untuk service tertentu sudah dikonfigurasi
     * @param {string} service - nama service
     * @returns {boolean} true jika dikonfigurasi
     */
    isAPIKeyConfigured(service) {
        const apiKey = this.getCurrentAPIKey(service);
        return apiKey && !apiKey.includes('your_') && !apiKey.includes('_here') && apiKey.length > 5;
    }
}

// Singleton instance
const apiKeyManager = new APIKeyManager();

module.exports = apiKeyManager;