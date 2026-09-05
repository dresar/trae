const axios = require('axios');
const fs = require('fs');
const path = require('path');
const apiKeyManager = require('./apiKeyManager');

/**
 * IP Geolocation Utility
 * Supports multiple providers with fallback system
 */
class IPGeolocationService {
    constructor() {
        this.cacheFile = path.join(__dirname, '../database/ip_cache.json');
        this.cache = this.loadCache();
        this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
        
        // API Keys dari apiKeyManager
        this.apiKeyManager = apiKeyManager;
        
        // Rate limiting
        this.rateLimits = {
            ipapi: { requests: 0, resetTime: 0, limit: 1000 }, // Free: 1000/month
            ipinfo: { requests: 0, resetTime: 0, limit: 50000 }, // Free: 50k/month
            ipgeolocation: { requests: 0, resetTime: 0, limit: 1000 }, // Free: 1000/month
            abuseipdb: { requests: 0, resetTime: 0, limit: 1000 } // Free: 1000/day
        };
    }

    /**
     * Load cache from file
     */
    loadCache() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                return JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
            }
        } catch (error) {
            console.error('Error loading IP cache:', error);
        }
        return {};
    }

    /**
     * Save cache to file
     */
    saveCache() {
        try {
            const dir = path.dirname(this.cacheFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
        } catch (error) {
            console.error('Error saving IP cache:', error);
        }
    }

    /**
     * Check if IP is cached and not expired
     */
    getCachedResult(ip) {
        const cached = this.cache[ip];
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
            return cached.data;
        }
        return null;
    }

    /**
     * Cache IP result
     */
    cacheResult(ip, data) {
        this.cache[ip] = {
            data: data,
            timestamp: Date.now()
        };
        this.saveCache();
    }

    /**
     * Validate IP address
     */
    isValidIP(ip) {
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        return ipv4Regex.test(ip) || ipv6Regex.test(ip);
    }

    /**
     * Check rate limit for provider
     */
    checkRateLimit(provider) {
        const limit = this.rateLimits[provider];
        const now = Date.now();
        
        // Reset counter if it's a new day/month
        if (now > limit.resetTime) {
            limit.requests = 0;
            limit.resetTime = now + (provider === 'abuseipdb' ? 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000);
        }
        
        return limit.requests < limit.limit;
    }

    /**
     * Increment rate limit counter
     */
    incrementRateLimit(provider) {
        this.rateLimits[provider].requests++;
    }

    /**
     * Get IP info from ipapi.co (Free tier: 1000 requests/month)
     */
    async getFromIPAPI(ip) {
        if (!this.checkRateLimit('ipapi')) {
            throw new Error('Rate limit exceeded for ipapi.co');
        }

        const apiKey = this.apiKeyManager.getIPGeolocationAPIKey('ipapi');
        const url = apiKey ? 
            `https://ipapi.co/${ip}/json/?key=${apiKey}` : 
            `https://ipapi.co/${ip}/json/`;

        try {
            const response = await axios.get(url, { timeout: 10000 });
            this.incrementRateLimit('ipapi');
            
            const data = response.data;
            return {
                ip: data.ip,
                country: data.country_name,
                countryCode: data.country_code,
                region: data.region,
                city: data.city,
                latitude: data.latitude,
                longitude: data.longitude,
                timezone: data.timezone,
                isp: data.org,
                asn: data.asn,
                postal: data.postal,
                currency: data.currency,
                languages: data.languages,
                provider: 'ipapi.co'
            };
        } catch (error) {
            console.error('IPAPI error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get IP info from ipinfo.io (Free tier: 50k requests/month)
     */
    async getFromIPInfo(ip) {
        if (!this.checkRateLimit('ipinfo')) {
            throw new Error('Rate limit exceeded for ipinfo.io');
        }

        const apiKey = this.apiKeyManager.getIPGeolocationAPIKey('ipinfo');
        const url = apiKey ? 
            `https://ipinfo.io/${ip}?token=${apiKey}` : 
            `https://ipinfo.io/${ip}`;

        try {
            const response = await axios.get(url, { timeout: 10000 });
            this.incrementRateLimit('ipinfo');
            
            const data = response.data;
            const [lat, lng] = (data.loc || '0,0').split(',');
            
            return {
                ip: data.ip,
                country: data.country,
                countryCode: data.country,
                region: data.region,
                city: data.city,
                latitude: parseFloat(lat),
                longitude: parseFloat(lng),
                timezone: data.timezone,
                isp: data.org,
                postal: data.postal,
                provider: 'ipinfo.io'
            };
        } catch (error) {
            console.error('IPInfo error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get IP info from ip-geolocation.io (Free tier: 1000 requests/month)
     */
    async getFromIPGeolocation(ip) {
        if (!this.checkRateLimit('ipgeolocation')) {
            throw new Error('Rate limit exceeded for ip-geolocation.io');
        }

        const apiKey = this.apiKeyManager.getIPGeolocationAPIKey('ipgeolocation');
        if (!apiKey) {
            throw new Error('IP Geolocation API key not configured');
        }

        try {
            const response = await axios.get(`https://api.ipgeolocation.io/ipgeo`, {
                params: { apiKey, ip },
                timeout: 10000
            });
            this.incrementRateLimit('ipgeolocation');
            
            const data = response.data;
            return {
                ip: data.ip,
                country: data.country_name,
                countryCode: data.country_code2,
                region: data.state_prov,
                city: data.city,
                latitude: parseFloat(data.latitude),
                longitude: parseFloat(data.longitude),
                timezone: data.time_zone?.name,
                isp: data.isp,
                postal: data.zipcode,
                provider: 'ip-geolocation.io'
            };
        } catch (error) {
            console.error('IP Geolocation error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Check if IP is malicious using AbuseIPDB
     */
    async checkAbuseIPDB(ip) {
        if (!this.checkRateLimit('abuseipdb')) {
            return null;
        }

        const apiKey = this.apiKeyManager.getIPGeolocationAPIKey('abuseipdb');
        if (!apiKey) {
            return null;
        }

        try {
            const response = await axios.get('https://api.abuseipdb.com/api/v2/check', {
                headers: {
                    'Key': apiKey,
                    'Accept': 'application/json'
                },
                params: {
                    ipAddress: ip,
                    maxAgeInDays: 90,
                    verbose: ''
                },
                timeout: 10000
            });
            this.incrementRateLimit('abuseipdb');
            
            const data = response.data.data;
            return {
                isWhitelisted: data.isWhitelisted,
                abuseConfidence: data.abuseConfidencePercentage,
                countryMatch: data.countryMatch,
                usageType: data.usageType,
                totalReports: data.totalReports,
                numDistinctUsers: data.numDistinctUsers,
                lastReportedAt: data.lastReportedAt
            };
        } catch (error) {
            console.error('AbuseIPDB error:', error.response?.data || error.message);
            return null;
        }
    }

    /**
     * Get comprehensive IP information with fallback
     */
    async getIPInfo(ip) {
        // Validate IP
        if (!this.isValidIP(ip)) {
            throw new Error('Invalid IP address format');
        }

        // Check cache first
        const cached = this.getCachedResult(ip);
        if (cached) {
            return { ...cached, fromCache: true };
        }

        const providers = [
            { name: 'ipinfo', method: this.getFromIPInfo.bind(this) },
            { name: 'ipapi', method: this.getFromIPAPI.bind(this) },
            { name: 'ipgeolocation', method: this.getFromIPGeolocation.bind(this) }
        ];

        let lastError = null;
        
        for (const provider of providers) {
            try {
                console.log(`Trying ${provider.name} for IP: ${ip}`);
                const result = await provider.method(ip);
                
                // Get abuse info if available
                try {
                    const abuseInfo = await this.checkAbuseIPDB(ip);
                    if (abuseInfo) {
                        result.security = abuseInfo;
                    }
                } catch (abuseError) {
                    console.log('AbuseIPDB check failed:', abuseError.message);
                }
                
                // Cache successful result
                this.cacheResult(ip, result);
                return result;
                
            } catch (error) {
                console.log(`${provider.name} failed:`, error.message);
                lastError = error;
                continue;
            }
        }

        throw new Error(`All IP geolocation providers failed. Last error: ${lastError?.message}`);
    }

    /**
     * Format IP info for display
     */
    formatIPInfo(data) {
        const flagEmoji = this.getCountryFlag(data.countryCode);
        const securityStatus = this.getSecurityStatus(data.security);
        
        let message = `🌐 *INFORMASI IP ADDRESS*\n\n`;
        message += `📍 *IP:* \`${data.ip}\`\n`;
        message += `${flagEmoji} *Negara:* ${data.country || 'Unknown'}\n`;
        message += `🏙️ *Kota:* ${data.city || 'Unknown'}\n`;
        message += `📍 *Region:* ${data.region || 'Unknown'}\n`;
        
        if (data.latitude && data.longitude) {
            message += `🗺️ *Koordinat:* ${data.latitude}, ${data.longitude}\n`;
        }
        
        if (data.timezone) {
            message += `🕐 *Timezone:* ${data.timezone}\n`;
        }
        
        if (data.isp) {
            message += `🌐 *ISP:* ${data.isp}\n`;
        }
        
        if (data.postal) {
            message += `📮 *Kode Pos:* ${data.postal}\n`;
        }
        
        if (data.security) {
            message += `\n🔒 *KEAMANAN:*\n`;
            message += `${securityStatus.emoji} *Status:* ${securityStatus.text}\n`;
            message += `⚠️ *Confidence:* ${data.security.abuseConfidence}%\n`;
            
            if (data.security.totalReports > 0) {
                message += `📊 *Total Reports:* ${data.security.totalReports}\n`;
            }
        }
        
        message += `\n📡 *Provider:* ${data.provider}`;
        
        if (data.fromCache) {
            message += ` (cached)`;
        }
        
        return message;
    }

    /**
     * Get country flag emoji
     */
    getCountryFlag(countryCode) {
        if (!countryCode || countryCode.length !== 2) return '🏳️';
        
        const flagMap = {
            'ID': '🇮🇩', 'US': '🇺🇸', 'GB': '🇬🇧', 'CN': '🇨🇳', 'JP': '🇯🇵',
            'KR': '🇰🇷', 'SG': '🇸🇬', 'MY': '🇲🇾', 'TH': '🇹🇭', 'VN': '🇻🇳',
            'PH': '🇵🇭', 'IN': '🇮🇳', 'AU': '🇦🇺', 'CA': '🇨🇦', 'DE': '🇩🇪',
            'FR': '🇫🇷', 'IT': '🇮🇹', 'ES': '🇪🇸', 'BR': '🇧🇷', 'RU': '🇷🇺'
        };
        
        return flagMap[countryCode.toUpperCase()] || '🏳️';
    }

    /**
     * Get security status
     */
    getSecurityStatus(security) {
        if (!security) {
            return { emoji: '❓', text: 'Unknown' };
        }
        
        if (security.isWhitelisted) {
            return { emoji: '✅', text: 'Whitelisted' };
        }
        
        if (security.abuseConfidence >= 75) {
            return { emoji: '🚨', text: 'High Risk' };
        } else if (security.abuseConfidence >= 25) {
            return { emoji: '⚠️', text: 'Medium Risk' };
        } else {
            return { emoji: '✅', text: 'Low Risk' };
        }
    }
}

// Singleton instance
const ipGeolocationService = new IPGeolocationService();

module.exports = ipGeolocationService;