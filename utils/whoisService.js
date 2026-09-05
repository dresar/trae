const axios = require('axios');
const fs = require('fs');
const path = require('path');
const apiKeyManager = require('./apiKeyManager');

/**
 * Whois Service Utility
 * Supports domain and IP whois lookup
 */
class WhoisService {
    constructor() {
        this.cacheFile = path.join(__dirname, '../database/whois_cache.json');
        this.cache = this.loadCache();
        this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
        
        // API Key manager
        this.apiKeyManager = apiKeyManager;
        
        // Rate limiting
        this.rateLimits = {
            whoisapi: { requests: 0, resetTime: 0, limit: 1000 }, // Free: 1000/month
            whoisjson: { requests: 0, resetTime: 0, limit: 1000 } // Free: 1000/month
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
            console.error('Error loading whois cache:', error);
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
            console.error('Error saving whois cache:', error);
        }
    }

    /**
     * Check if domain is cached and not expired
     */
    getCachedResult(domain) {
        const cached = this.cache[domain.toLowerCase()];
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
            return cached.data;
        }
        return null;
    }

    /**
     * Cache whois result
     */
    cacheResult(domain, data) {
        this.cache[domain.toLowerCase()] = {
            data: data,
            timestamp: Date.now()
        };
        this.saveCache();
    }

    /**
     * Validate domain name
     */
    isValidDomain(domain) {
        const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(xn--[a-zA-Z0-9]+|[a-zA-Z]{2,})$/;
        return domainRegex.test(domain) && domain.length <= 253;
    }

    /**
     * Check rate limit for provider
     */
    checkRateLimit(provider) {
        const limit = this.rateLimits[provider];
        const now = Date.now();
        
        // Reset counter if it's a new month
        if (now > limit.resetTime) {
            limit.requests = 0;
            limit.resetTime = now + (30 * 24 * 60 * 60 * 1000); // 30 days
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
     * Get whois info from whoisapi.com (Free tier: 1000 requests/month)
     */
    async getFromWhoisAPI(domain) {
        if (!this.checkRateLimit('whoisapi')) {
            throw new Error('Rate limit exceeded for whoisapi.com');
        }

        const apiKey = this.apiKeyManager.getWhoisAPIKey();
        if (!apiKey) {
            throw new Error('Whois API key not configured');
        }

        try {
            const response = await axios.get(`https://www.whoisapi.com/whoisserver/WhoisService`, {
                params: {
                    apiKey: apiKey,
                    domainName: domain,
                    outputFormat: 'json'
                },
                timeout: 15000
            });
            this.incrementRateLimit('whoisapi');
            
            const data = response.data;
            return this.parseWhoisData(data, 'whoisapi.com');
            
        } catch (error) {
            console.error('WhoisAPI error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get whois info from free whois service (fallback)
     */
    async getFromFreeWhois(domain) {
        try {
            // Using whois.com free API (limited)
            const response = await axios.get(`https://www.whois.com/whois/${domain}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 15000
            });
            
            // This would require HTML parsing, simplified for demo
            return {
                domain: domain,
                registrar: 'Unknown',
                registrationDate: 'Unknown',
                expirationDate: 'Unknown',
                status: 'Unknown',
                nameServers: [],
                provider: 'free-whois'
            };
            
        } catch (error) {
            console.error('Free Whois error:', error.message);
            throw error;
        }
    }

    /**
     * Parse whois data from API response
     */
    parseWhoisData(data, provider) {
        const result = {
            domain: data.domainName || data.domain,
            registrar: data.registrarName || data.registrar,
            registrationDate: this.formatDate(data.createdDate || data.created),
            expirationDate: this.formatDate(data.expiresDate || data.expires),
            updatedDate: this.formatDate(data.updatedDate || data.updated),
            status: Array.isArray(data.status) ? data.status.join(', ') : (data.status || 'Unknown'),
            nameServers: data.nameServers || [],
            provider: provider
        };

        // Add registrant info if available
        if (data.registrant) {
            result.registrant = {
                name: data.registrant.name,
                organization: data.registrant.organization,
                country: data.registrant.country,
                email: data.registrant.email
            };
        }

        // Add admin contact if available
        if (data.administrativeContact) {
            result.adminContact = {
                name: data.administrativeContact.name,
                organization: data.administrativeContact.organization,
                email: data.administrativeContact.email
            };
        }

        return result;
    }

    /**
     * Format date string
     */
    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('id-ID', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch (error) {
            return dateString;
        }
    }

    /**
     * Get comprehensive whois information
     */
    async getWhoisInfo(domain) {
        // Clean and validate domain
        domain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        
        if (!this.isValidDomain(domain)) {
            throw new Error('Invalid domain name format');
        }

        // Check cache first
        const cached = this.getCachedResult(domain);
        if (cached) {
            return { ...cached, fromCache: true };
        }

        // Cek apakah API key tersedia
        const apiKey = this.apiKeyManager.getWhoisAPIKey();
        const providers = [];
        
        if (apiKey) {
            providers.push({ name: 'whoisapi', method: this.getFromWhoisAPI.bind(this) });
        }
        providers.push({ name: 'free-whois', method: this.getFromFreeWhois.bind(this) });

        let lastError = null;
        
        for (const provider of providers) {
            try {
                console.log(`Trying ${provider.name} for domain: ${domain}`);
                const result = await provider.method(domain);
                
                // Cache successful result
                this.cacheResult(domain, result);
                return result;
                
            } catch (error) {
                console.log(`${provider.name} failed:`, error.message);
                lastError = error;
                continue;
            }
        }

        throw new Error(`All whois providers failed. Last error: ${lastError?.message}`);
    }

    /**
     * Format whois info for display
     */
    formatWhoisInfo(data) {
        let message = `🌐 *WHOIS DOMAIN LOOKUP*\n\n`;
        message += `📍 *Domain:* \`${data.domain}\`\n`;
        message += `🏢 *Registrar:* ${data.registrar || 'Unknown'}\n`;
        message += `📅 *Terdaftar:* ${data.registrationDate || 'Unknown'}\n`;
        message += `⏰ *Kadaluarsa:* ${data.expirationDate || 'Unknown'}\n`;
        
        if (data.updatedDate && data.updatedDate !== 'Unknown') {
            message += `🔄 *Diperbarui:* ${data.updatedDate}\n`;
        }
        
        message += `📊 *Status:* ${data.status || 'Unknown'}\n`;
        
        if (data.nameServers && data.nameServers.length > 0) {
            message += `\n🌐 *Name Servers:*\n`;
            data.nameServers.slice(0, 4).forEach((ns, index) => {
                message += `${index + 1}. \`${ns}\`\n`;
            });
            if (data.nameServers.length > 4) {
                message += `... dan ${data.nameServers.length - 4} lainnya\n`;
            }
        }
        
        if (data.registrant) {
            message += `\n👤 *Registrant:*\n`;
            if (data.registrant.name) message += `• Nama: ${data.registrant.name}\n`;
            if (data.registrant.organization) message += `• Organisasi: ${data.registrant.organization}\n`;
            if (data.registrant.country) message += `• Negara: ${data.registrant.country}\n`;
        }
        
        // Calculate days until expiration
        if (data.expirationDate && data.expirationDate !== 'Unknown') {
            try {
                const expDate = new Date(data.expirationDate);
                const now = new Date();
                const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
                
                if (daysLeft > 0) {
                    message += `\n⏳ *Sisa Waktu:* ${daysLeft} hari`;
                    if (daysLeft <= 30) {
                        message += ` ⚠️ *Segera Kadaluarsa!*`;
                    }
                } else if (daysLeft < 0) {
                    message += `\n❌ *Domain Kadaluarsa:* ${Math.abs(daysLeft)} hari yang lalu`;
                }
            } catch (error) {
                // Ignore date parsing errors
            }
        }
        
        message += `\n\n📡 *Provider:* ${data.provider}`;
        
        if (data.fromCache) {
            message += ` (cached)`;
        }
        
        return message;
    }

    /**
     * Get domain age in days
     */
    getDomainAge(registrationDate) {
        if (!registrationDate || registrationDate === 'Unknown') {
            return null;
        }
        
        try {
            const regDate = new Date(registrationDate);
            const now = new Date();
            return Math.floor((now - regDate) / (1000 * 60 * 60 * 24));
        } catch (error) {
            return null;
        }
    }

    /**
     * Check if domain is expired
     */
    isDomainExpired(expirationDate) {
        if (!expirationDate || expirationDate === 'Unknown') {
            return false;
        }
        
        try {
            const expDate = new Date(expirationDate);
            return expDate < new Date();
        } catch (error) {
            return false;
        }
    }
}

// Singleton instance
const whoisService = new WhoisService();

module.exports = whoisService;