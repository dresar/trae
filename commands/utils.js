const axios = require('axios');
const { formatCurrency, formatDate, capitalize } = require('../utils/helpers');

/**
 * Handle utility commands
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {string} command - Command name
 * @param {Array} args - Command arguments
 */
async function handleUtilsCommand(sock, msg, command, args) {
    const from = msg.key.remoteJid;
    
    try {
        switch (command) {
            case 'translate':
            case 'tr':
                await handleTranslate(sock, msg, args);
                break;
                
            case 'news':
            case 'berita':
                if (args.length === 0) {
                    await sock.sendMessage(from, {
                        text: '📰 *News Search*\n\n📝 *Cara penggunaan:*\n`!news [keyword]`\n\n📋 *Contoh:*\n`!news teknologi`\n`!news indonesia`\n`!news covid`\n\n💡 *Tip:* Gunakan kata kunci dalam bahasa Indonesia atau Inggris'
                    });
                    return;
                }
                
                const keyword = args.join(' ');
                await sock.sendPresenceUpdate('composing', from);
                
                try {
                    // Try multiple news sources as fallback
                    let newsData = null;
                    
                    // First try: NewsAPI (if configured)
                    const newsApiKey = process.env.NEWS_API_KEY;
                    if (newsApiKey && newsApiKey !== 'your_news_api_key_here') {
                        try {
                            const response = await axios.get(`https://newsapi.org/v2/everything`, {
                                params: {
                                    q: keyword,
                                    language: 'id',
                                    sortBy: 'publishedAt',
                                    pageSize: 5,
                                    apiKey: newsApiKey
                                },
                                timeout: 10000
                            });
                            
                            if (response.data.articles && response.data.articles.length > 0) {
                                newsData = response.data.articles;
                            }
                        } catch (apiError) {
                            console.log('NewsAPI failed, trying alternative sources:', apiError.message);
                        }
                    }
                    
                    // Second try: Alternative free news source
                    if (!newsData) {
                        try {
                            const response = await axios.get(`https://api.rss2json.com/v1/api.json`, {
                                params: {
                                    rss_url: 'https://www.antaranews.com/rss/terkini.xml',
                                    api_key: 'free', // Free tier
                                    count: 5
                                },
                                timeout: 10000
                            });
                            
                            if (response.data.items && response.data.items.length > 0) {
                                // Filter by keyword
                                const filteredItems = response.data.items.filter(item => 
                                    item.title.toLowerCase().includes(keyword.toLowerCase()) ||
                                    (item.description && item.description.toLowerCase().includes(keyword.toLowerCase()))
                                );
                                
                                if (filteredItems.length > 0) {
                                    newsData = filteredItems.slice(0, 5).map(item => ({
                                        title: item.title,
                                        description: item.description?.replace(/<[^>]*>/g, '').substring(0, 200) + '...',
                                        url: item.link,
                                        publishedAt: item.pubDate,
                                        source: { name: 'Antara News' }
                                    }));
                                }
                            }
                        } catch (rssError) {
                            console.log('RSS feed failed:', rssError.message);
                        }
                    }
                    
                    // Third try: Mock news data as ultimate fallback
                    if (!newsData) {
                        newsData = [
                            {
                                title: `Berita terkait "${keyword}" - Layanan berita sedang dalam pemeliharaan`,
                                description: 'Maaf, layanan berita sedang tidak tersedia. Silakan coba lagi nanti atau gunakan sumber berita lainnya.',
                                url: 'https://www.detik.com',
                                publishedAt: new Date().toISOString(),
                                source: { name: 'System' }
                            }
                        ];
                    }
                    
                    if (newsData && newsData.length > 0) {
                        let newsText = `📰 *Berita Terbaru: ${keyword}*\n\n`;
                        
                        newsData.forEach((article, index) => {
                            newsText += `${index + 1}. *${article.title}*\n`;
                            if (article.source?.name) {
                                newsText += `📰 ${article.source.name}\n`;
                            }
                            newsText += `📅 ${new Date(article.publishedAt).toLocaleDateString('id-ID')}\n`;
                            if (article.description) {
                                newsText += `📝 ${article.description}\n`;
                            }
                            newsText += `🔗 ${article.url}\n\n`;
                        });
                        
                        newsText += `⏰ Diperbarui: ${new Date().toLocaleString('id-ID')}`;
                        
                        // Split message if too long
                        if (newsText.length > 4000) {
                            const messages = [];
                            let currentMessage = `📰 *Berita Terbaru: ${keyword}*\n\n`;
                            
                            newsData.forEach((article, index) => {
                                const articleText = `${index + 1}. *${article.title}*\n` +
                                                  (article.source?.name ? `📰 ${article.source.name}\n` : '') +
                                                  `📅 ${new Date(article.publishedAt).toLocaleDateString('id-ID')}\n` +
                                                  (article.description ? `📝 ${article.description}\n` : '') +
                                                  `🔗 ${article.url}\n\n`;
                                
                                if ((currentMessage + articleText).length > 3800) {
                                    messages.push(currentMessage);
                                    currentMessage = articleText;
                                } else {
                                    currentMessage += articleText;
                                }
                            });
                            
                            if (currentMessage.trim()) {
                                currentMessage += `⏰ Diperbarui: ${new Date().toLocaleString('id-ID')}`;
                                messages.push(currentMessage);
                            }
                            
                            for (const msg of messages) {
                                await sock.sendMessage(from, { text: msg });
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            }
                        } else {
                            await sock.sendMessage(from, { text: newsText });
                        }
                    } else {
                        await sock.sendMessage(from, {
                            text: `❌ *Tidak ada berita ditemukan*\n\nTidak ada berita untuk kata kunci: "${keyword}"\n\n💡 *Saran:*\n• Coba kata kunci yang lebih umum\n• Gunakan bahasa Indonesia\n• Periksa ejaan kata kunci`
                        });
                    }
                    
                } catch (error) {
                    console.error('News search error:', error);
                    await sock.sendMessage(from, {
                        text: '❌ *News Search Error*\n\nTerjadi kesalahan saat mencari berita. Silakan coba lagi nanti.\n\n💡 *Alternatif:*\nKunjungi langsung:\n• detik.com\n• kompas.com\n• antaranews.com'
                    });
                } finally {
                    await sock.sendPresenceUpdate('available', from);
                }
                break;
                
            case 'currency':
            case 'kurs':
                await handleCurrency(sock, msg, args);
                break;
                
            case 'calculator':
            case 'calc':
                await handleCalculator(sock, msg, args);
                break;
                
            case 'shorturl':
            case 'short':
                await handleShortURL(sock, msg, args);
                break;
                
            case 'whois':
            case 'domain':
                await handleWhois(sock, msg, args);
                break;
                
            case 'password':
            case 'pass':
                await handlePasswordGenerator(sock, msg, args);
                break;
                
            case 'base64':
                await handleBase64(sock, msg, args);
                break;
                
            case 'hash':
                await handleHash(sock, msg, args);
                break;
                
            case 'color':
            case 'warna':
                await handleColorInfo(sock, msg, args);
                break;
                
            case 'timezone':
            case 'time':
                await handleTimezone(sock, msg, args);
                break;
                
            case 'ip':
            case 'ipinfo':
                await handleIPInfo(sock, msg, args);
                break;
                
            case 'ping':
                await handlePing(sock, msg, args);
                break;
                
            case 'uptime':
                await handleUptime(sock, msg, args);
                break;
                
            case 'info':
                await handleInfo(sock, msg, args);
                break;
                
            case 'stats':
                await handleStats(sock, msg, args);
                break;
                
            default:
                await sock.sendMessage(from, {
                    text: '❓ *Command utils tidak ditemukan*\n\nGunakan: ping, uptime, info, stats, translate, news, currency, calculator, shorturl, whois, password, base64, hash, color, timezone, ip'
                });
        }
    } catch (error) {
        console.error('Error in utils command:', error);
        await sock.sendMessage(from, {
            text: '❌ *Terjadi kesalahan pada utils command*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle translate command
 */
async function handleTranslate(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    if (args.length < 2) {
        await sock.sendMessage(from, {
            text: '🌐 *Google Translate*\n\n📝 *Cara penggunaan:*\n`!translate [bahasa_tujuan] [teks]`\n\n📋 *Contoh:*\n`!translate en Halo dunia`\n`!translate id Hello world`\n`!translate ja こんにちは`\n\n🌍 *Kode bahasa:*\n• en = English\n• id = Indonesia\n• ja = Japanese\n• ko = Korean\n• zh = Chinese\n• ar = Arabic\n• es = Spanish\n• fr = French\n• de = German\n• ru = Russian\n\n💡 *Tips:* Gunakan kode bahasa 2 huruf'
        });
        return;
    }
    
    const targetLang = args[0].toLowerCase();
    const text = args.slice(1).join(' ');
    
    try {
        const translatedText = await translateText(text, targetLang);
        
        if (!translatedText) {
            await sock.sendMessage(from, {
                text: '❌ *Gagal menerjemahkan teks*\n\nPastikan kode bahasa benar dan teks tidak kosong.'
            });
            return;
        }
        
        let message = `🌐 *Google Translate*\n\n`;
        message += `📝 *Teks asli:*\n${text}\n\n`;
        message += `🎯 *Bahasa tujuan:* ${targetLang.toUpperCase()}\n`;
        message += `✅ *Hasil terjemahan:*\n${translatedText}\n\n`;
        message += `⏰ ${new Date().toLocaleString('id-ID')}`;
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error translating:', error);
        await sock.sendMessage(from, {
            text: '❌ *Layanan translate sedang tidak tersedia*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle news command
 */
async function handleNews(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    const category = args[0] || 'general';
    const country = args[1] || 'id';
    
    try {
        const news = await getNews(category, country);
        
        if (!news || news.length === 0) {
            await sock.sendMessage(from, {
                text: '❌ *Tidak ada berita ditemukan*\n\nSilakan coba kategori atau negara yang berbeda.'
            });
            return;
        }
        
        let message = `📰 *Berita Terkini*\n\n`;
        message += `🏷️ *Kategori:* ${capitalize(category)}\n`;
        message += `🌍 *Negara:* ${country.toUpperCase()}\n\n`;
        
        news.slice(0, 5).forEach((article, index) => {
            message += `${index + 1}. **${article.title}**\n`;
            if (article.description) {
                message += `   ${article.description.substring(0, 100)}...\n`;
            }
            message += `   🔗 ${article.url}\n`;
            message += `   📅 ${formatDate(article.publishedAt)}\n\n`;
        });
        
        message += `📊 *Menampilkan 5 dari ${news.length} berita*\n`;
        message += `⏰ ${new Date().toLocaleString('id-ID')}`;
        
        // Split long messages
        if (message.length > 4000) {
            const messages = splitMessage(message, 4000);
            for (const msg of messages) {
                await sock.sendMessage(from, { text: msg });
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } else {
            await sock.sendMessage(from, { text: message });
        }
        
    } catch (error) {
        console.error('Error getting news:', error);
        await sock.sendMessage(from, {
            text: '❌ *Layanan berita sedang tidak tersedia*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle currency command
 */
async function handleCurrency(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '💱 *Kurs Mata Uang*\n\n📝 *Cara penggunaan:*\n`!currency [dari] [ke] [jumlah]`\n\n📋 *Contoh:*\n`!currency USD IDR 100`\n`!currency EUR USD 50`\n`!currency IDR USD 1000000`\n\n💰 *Mata uang populer:*\n• USD = US Dollar\n• EUR = Euro\n• IDR = Indonesian Rupiah\n• JPY = Japanese Yen\n• GBP = British Pound\n• AUD = Australian Dollar\n• SGD = Singapore Dollar\n• MYR = Malaysian Ringgit\n\n💡 *Tips:* Jika tidak ada jumlah, default 1'
        });
        return;
    }
    
    const fromCurrency = args[0]?.toUpperCase() || 'USD';
    const toCurrency = args[1]?.toUpperCase() || 'IDR';
    const amount = parseFloat(args[2]) || 1;
    
    if (isNaN(amount) || amount <= 0) {
        await sock.sendMessage(from, {
            text: '❌ *Jumlah tidak valid*\n\nMasukkan jumlah yang valid (angka positif).'
        });
        return;
    }
    
    try {
        const exchangeRate = await getExchangeRate(fromCurrency, toCurrency);
        
        if (!exchangeRate) {
            await sock.sendMessage(from, {
                text: '❌ *Mata uang tidak ditemukan*\n\nPastikan kode mata uang benar (contoh: USD, EUR, IDR).'
            });
            return;
        }
        
        const convertedAmount = amount * exchangeRate.rate;
        
        let message = `💱 *Konversi Mata Uang*\n\n`;
        message += `💰 *Dari:* ${formatCurrency(amount, fromCurrency)}\n`;
        message += `💰 *Ke:* ${formatCurrency(convertedAmount, toCurrency)}\n\n`;
        message += `📊 *Kurs:* 1 ${fromCurrency} = ${exchangeRate.rate} ${toCurrency}\n`;
        message += `📅 *Update:* ${formatDate(exchangeRate.lastUpdate)}\n\n`;
        message += `⏰ ${new Date().toLocaleString('id-ID')}`;
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error getting exchange rate:', error);
        await sock.sendMessage(from, {
            text: '❌ *Layanan kurs sedang tidak tersedia*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle calculator command
 */
async function handleCalculator(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '🧮 *Kalkulator*\n\n📝 *Cara penggunaan:*\n`!calc [operasi matematika]`\n\n📋 *Contoh:*\n`!calc 2 + 3`\n`!calc 10 * 5`\n`!calc 100 / 4`\n`!calc 2^3`\n`!calc sqrt(16)`\n`!calc sin(30)`\n\n🔢 *Operasi yang didukung:*\n• +, -, *, / (operasi dasar)\n• ^ (pangkat)\n• sqrt() (akar kuadrat)\n• sin(), cos(), tan() (trigonometri)\n• log(), ln() (logaritma)\n• abs() (nilai absolut)\n\n💡 *Tips:* Gunakan spasi untuk memisahkan angka dan operator'
        });
        return;
    }
    
    const expression = args.join(' ');
    
    try {
        const result = calculateExpression(expression);
        
        if (result === null || isNaN(result)) {
            await sock.sendMessage(from, {
                text: '❌ *Operasi matematika tidak valid*\n\nPastikan sintaks benar dan gunakan operasi yang didukung.'
            });
            return;
        }
        
        let message = `🧮 *Hasil Kalkulasi*\n\n`;
        message += `📝 *Operasi:* ${expression}\n`;
        message += `✅ *Hasil:* ${result}\n\n`;
        
        // Add some additional info for certain results
        if (result % 1 === 0 && result > 1) {
            message += `🔢 *Info:* ${result} adalah bilangan ${isPrime(result) ? 'prima' : 'komposit'}\n`;
        }
        
        message += `⏰ ${new Date().toLocaleString('id-ID')}`;
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error calculating:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal menghitung operasi*\n\nPastikan sintaks matematika benar.'
        });
    }
}

/**
 * Handle password generator
 */
async function handlePasswordGenerator(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    const length = parseInt(args[0]) || 12;
    const includeSymbols = args.includes('symbols') || args.includes('symbol');
    const includeNumbers = !args.includes('nonum');
    const includeUppercase = !args.includes('nouppercase');
    const includeLowercase = !args.includes('nolowercase');
    
    if (length < 4 || length > 128) {
        await sock.sendMessage(from, {
            text: '🔐 *Password Generator*\n\n📝 *Cara penggunaan:*\n`!password [panjang] [opsi]`\n\n📋 *Contoh:*\n`!password 12`\n`!password 16 symbols`\n`!password 8 nonum`\n\n⚙️ *Opsi:*\n• symbols - Sertakan simbol (!@#$%^&*)\n• nonum - Tanpa angka\n• nouppercase - Tanpa huruf besar\n• nolowercase - Tanpa huruf kecil\n\n📏 *Panjang:* 4-128 karakter (default: 12)'
        });
        return;
    }
    
    try {
        const password = generatePassword(length, {
            includeSymbols,
            includeNumbers,
            includeUppercase,
            includeLowercase
        });
        
        const strength = getPasswordStrength(password);
        
        let message = `🔐 *Password Generator*\n\n`;
        message += `🔑 *Password:* \`${password}\`\n\n`;
        message += `📏 *Panjang:* ${password.length} karakter\n`;
        message += `💪 *Kekuatan:* ${strength.level} (${strength.score}/5)\n`;
        message += `📊 *Komposisi:*\n`;
        
        if (includeUppercase) message += `• Huruf besar ✅\n`;
        if (includeLowercase) message += `• Huruf kecil ✅\n`;
        if (includeNumbers) message += `• Angka ✅\n`;
        if (includeSymbols) message += `• Simbol ✅\n`;
        
        message += `\n⚠️ *Peringatan:*\n`;
        message += `• Simpan password dengan aman\n`;
        message += `• Jangan bagikan ke orang lain\n`;
        message += `• Gunakan password manager\n\n`;
        message += `⏰ ${new Date().toLocaleString('id-ID')}`;
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error generating password:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal membuat password*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle timezone command
 */
async function handleTimezone(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        // Show current time in major timezones
        const timezones = [
            { name: 'WIB (Jakarta)', tz: 'Asia/Jakarta' },
            { name: 'WITA (Makassar)', tz: 'Asia/Makassar' },
            { name: 'WIT (Jayapura)', tz: 'Asia/Jayapura' },
            { name: 'UTC', tz: 'UTC' },
            { name: 'Tokyo', tz: 'Asia/Tokyo' },
            { name: 'Singapore', tz: 'Asia/Singapore' },
            { name: 'London', tz: 'Europe/London' },
            { name: 'New York', tz: 'America/New_York' }
        ];
        
        let message = `🌍 *Waktu Dunia*\n\n`;
        
        timezones.forEach(tz => {
            const time = new Date().toLocaleString('id-ID', {
                timeZone: tz.tz,
                hour12: false,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            message += `🕐 *${tz.name}:* ${time}\n`;
        });
        
        message += `\n💡 *Tips:* Gunakan \`!time [timezone]\` untuk zona waktu spesifik`;
        
        await sock.sendMessage(from, { text: message });
        return;
    }
    
    const timezone = args.join(' ');
    
    try {
        const time = new Date().toLocaleString('id-ID', {
            timeZone: timezone,
            hour12: false,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        let message = `🌍 *Waktu di ${timezone}*\n\n`;
        message += `🕐 *Waktu saat ini:*\n${time}\n\n`;
        message += `⏰ *Diperbarui:* ${new Date().toLocaleString('id-ID')}`;
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        await sock.sendMessage(from, {
            text: `❌ *Timezone tidak valid*\n\nTimezone: "${timezone}"\n\n📋 *Contoh timezone yang valid:*\n• Asia/Jakarta\n• Asia/Tokyo\n• Europe/London\n• America/New_York\n• UTC\n\nGunakan \`!time\` tanpa parameter untuk melihat waktu di berbagai zona.`
        });
    }
}

/**
 * Translate text using Google Translate API
 */
async function translateText(text, targetLang) {
    const apiKey = process.env.TRANSLATE_API_KEY;
    
    if (!apiKey || apiKey === 'your_translate_api_key_here') {
        // Fallback to free translation service
        return await translateTextFree(text, targetLang);
    }
    
    try {
        const response = await axios.post(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
            q: text,
            target: targetLang,
            format: 'text'
        });
        
        return response.data.data.translations[0].translatedText;
        
    } catch (error) {
        console.error('Google Translate API error:', error);
        return await translateTextFree(text, targetLang);
    }
}

/**
 * Free translation service fallback
 */
async function translateTextFree(text, targetLang) {
    try {
        // Using a free translation API as fallback
        const response = await axios.get(`https://api.mymemory.translated.net/get`, {
            params: {
                q: text,
                langpair: `auto|${targetLang}`
            }
        });
        
        return response.data.responseData.translatedText;
        
    } catch (error) {
        console.error('Free translation error:', error);
        return null;
    }
}

/**
 * Get news from NewsAPI
 */
async function getNews(category, country) {
    const apiKey = process.env.NEWS_API_KEY;
    
    if (!apiKey || apiKey === 'your_news_api_key_here') {
        // Return mock news data
        return [
            {
                title: 'Contoh Berita 1',
                description: 'Ini adalah contoh berita untuk demo bot KKN.',
                url: 'https://example.com/news1',
                publishedAt: new Date().toISOString()
            },
            {
                title: 'Contoh Berita 2',
                description: 'Berita kedua sebagai contoh untuk testing.',
                url: 'https://example.com/news2',
                publishedAt: new Date().toISOString()
            }
        ];
    }
    
    try {
        const response = await axios.get('https://newsapi.org/v2/top-headlines', {
            params: {
                apiKey: apiKey,
                category: category,
                country: country,
                pageSize: 10
            }
        });
        
        return response.data.articles;
        
    } catch (error) {
        console.error('News API error:', error);
        return null;
    }
}

/**
 * Get exchange rate
 */
async function getExchangeRate(from, to) {
    const apiKey = process.env.CURRENCY_API_KEY;
    
    try {
        let response;
        
        if (apiKey && apiKey !== 'your_currency_api_key_here') {
            // Use paid API if available
            response = await axios.get(`https://v6.exchangerate-api.com/v6/${apiKey}/pair/${from}/${to}`);
            
            return {
                rate: response.data.conversion_rate,
                lastUpdate: response.data.time_last_update_utc
            };
        } else {
            // Use free API as fallback
            response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${from}`);
            
            if (!response.data.rates[to]) {
                return null;
            }
            
            return {
                rate: response.data.rates[to],
                lastUpdate: response.data.date
            };
        }
        
    } catch (error) {
        console.error('Exchange rate API error:', error);
        return null;
    }
}

/**
 * Calculate mathematical expression
 */
function calculateExpression(expression) {
    try {
        // Clean and validate expression
        let cleanExpr = expression
            .replace(/\s+/g, '')
            .replace(/\^/g, '**')
            .replace(/sqrt\(/g, 'Math.sqrt(')
            .replace(/sin\(/g, 'Math.sin(')
            .replace(/cos\(/g, 'Math.cos(')
            .replace(/tan\(/g, 'Math.tan(')
            .replace(/log\(/g, 'Math.log10(')
            .replace(/ln\(/g, 'Math.log(')
            .replace(/abs\(/g, 'Math.abs(')
            .replace(/pi/g, 'Math.PI')
            .replace(/e/g, 'Math.E');
        
        // Security check - only allow safe mathematical operations
        if (!/^[0-9+\-*/.()\s\w]+$/.test(cleanExpr)) {
            return null;
        }
        
        // Evaluate expression
        const result = Function('"use strict"; return (' + cleanExpr + ')')();
        
        return Math.round(result * 1000000) / 1000000; // Round to 6 decimal places
        
    } catch (error) {
        return null;
    }
}

/**
 * Generate password
 */
function generatePassword(length, options) {
    const {
        includeSymbols = false,
        includeNumbers = true,
        includeUppercase = true,
        includeLowercase = true
    } = options;
    
    let charset = '';
    
    if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeNumbers) charset += '0123456789';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    if (charset === '') {
        charset = 'abcdefghijklmnopqrstuvwxyz'; // Fallback
    }
    
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
}

/**
 * Get password strength
 */
function getPasswordStrength(password) {
    let score = 0;
    const checks = {
        length: password.length >= 8,
        lowercase: /[a-z]/.test(password),
        uppercase: /[A-Z]/.test(password),
        numbers: /\d/.test(password),
        symbols: /[^\w\s]/.test(password)
    };
    
    Object.values(checks).forEach(check => {
        if (check) score++;
    });
    
    const levels = ['Sangat Lemah', 'Lemah', 'Sedang', 'Kuat', 'Sangat Kuat'];
    
    return {
        score: score,
        level: levels[score - 1] || 'Sangat Lemah'
    };
}

/**
 * Check if number is prime
 */
function isPrime(num) {
    if (num < 2) return false;
    for (let i = 2; i <= Math.sqrt(num); i++) {
        if (num % i === 0) return false;
    }
    return true;
}

/**
 * Split long message into chunks
 */
function splitMessage(message, maxLength) {
    const messages = [];
    let currentMessage = '';
    const lines = message.split('\n');
    
    for (const line of lines) {
        if ((currentMessage + line + '\n').length > maxLength) {
            if (currentMessage) {
                messages.push(currentMessage.trim());
                currentMessage = '';
            }
        }
        currentMessage += line + '\n';
    }
    
    if (currentMessage.trim()) {
        messages.push(currentMessage.trim());
    }
    
    return messages;
}

/**
 * Handle short URL (placeholder)
 */
async function handleShortURL(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    await sock.sendMessage(from, {
        text: '🔗 *URL Shortener*\n\n⚠️ *Fitur dalam pengembangan*\n\nFitur pemendek URL sedang dalam tahap pengembangan. Silakan gunakan fitur lain terlebih dahulu.'
    });
}

/**
 * Handle whois domain lookup
 */
async function handleWhois(sock, msg, args) {
    const from = msg.key.remoteJid;
    const whoisService = require('../utils/whoisService');
    
    try {
        // Show typing indicator
        await sock.sendPresenceUpdate('composing', from);
        
        if (!args || args.trim() === '') {
            await sock.sendMessage(from, {
                text: '🌐 *Domain Whois Lookup*\n\n' +
                      '📝 *Format:* `.whois <domain>`\n\n' +
                      '📋 *Contoh:*\n' +
                      '• `.whois google.com`\n' +
                      '• `.whois github.com`\n' +
                      '• `.whois stackoverflow.com`\n\n' +
                      '💡 *Informasi yang didapat:*\n' +
                      '• Registrar domain\n' +
                      '• Tanggal registrasi & kadaluarsa\n' +
                      '• Name servers\n' +
                      '• Status domain\n' +
                      '• Informasi registrant (jika tersedia)'
            });
            return;
        }
        
        let domain = args.trim();
        
        // Clean domain input
        domain = domain.toLowerCase()
                      .replace(/^https?:\/\//, '')
                      .replace(/^www\./, '')
                      .replace(/\/.*$/, '')
                      .split(':')[0]; // Remove port if present
        
        // Validate domain format
        if (!whoisService.isValidDomain(domain)) {
            await sock.sendMessage(from, {
                text: '❌ *Format Domain Tidak Valid*\n\n' +
                      'Pastikan domain dalam format yang benar:\n\n' +
                      '✅ *Format yang benar:*\n' +
                      '• google.com\n' +
                      '• subdomain.example.org\n' +
                      '• my-site.co.id\n\n' +
                      '❌ *Format yang salah:*\n' +
                      '• http://google.com\n' +
                      '• google\n' +
                      '• .com\n\n' +
                      'Contoh: `.whois google.com`'
            });
            return;
        }
        
        // Show processing message for long operations
        const processingMsg = await sock.sendMessage(from, {
            text: `🔍 *Mencari informasi domain...*\n\n` +
                  `Domain: \`${domain}\`\n` +
                  `⏳ Mohon tunggu sebentar...`
        });
        
        // Get whois information
        const whoisInfo = await whoisService.getWhoisInfo(domain);
        const formattedInfo = whoisService.formatWhoisInfo(whoisInfo);
        
        // Delete processing message and send result
        try {
            await sock.sendMessage(from, { delete: processingMsg.key });
        } catch (deleteError) {
            // Ignore delete errors
        }
        
        await sock.sendMessage(from, { text: formattedInfo });
        
    } catch (error) {
        console.error('Error in handleWhois:', error);
        await sock.sendPresenceUpdate('available', from);
        
        let errorMessage = '❌ *Error Whois Lookup*\n\n';
        
        if (error.message.includes('Rate limit exceeded')) {
            errorMessage += '⏰ *Rate Limit Tercapai*\n\n' +
                           'Batas penggunaan API whois telah tercapai. Silakan coba lagi nanti.\n\n' +
                           '💡 *Tips:* Tunggu beberapa saat atau coba domain yang berbeda.';
        } else if (error.message.includes('Invalid domain')) {
            errorMessage += '🔍 *Format Domain Salah*\n\n' +
                           'Pastikan format domain sudah benar.\n\n' +
                           '📝 Contoh: `.whois google.com`';
        } else if (error.message.includes('not configured')) {
            errorMessage += '🔧 *API Key Belum Dikonfigurasi*\n\n' +
                           'Layanan whois memerlukan API key yang belum dikonfigurasi.\n\n' +
                           'Hubungi admin untuk mengaktifkan fitur ini.';
        } else if (error.message.includes('All whois providers failed')) {
            errorMessage += '🌐 *Semua Provider Gagal*\n\n' +
                           'Tidak dapat mengakses layanan whois saat ini.\n\n' +
                           '🔧 *Kemungkinan penyebab:*\n' +
                           '• Domain tidak terdaftar\n' +
                           '• Koneksi internet bermasalah\n' +
                           '• API key belum dikonfigurasi\n' +
                           '• Rate limit tercapai\n\n' +
                           'Silakan coba lagi nanti.';
        } else {
            errorMessage += `Terjadi kesalahan: ${error.message}\n\n` +
                           'Silakan coba lagi atau hubungi admin jika masalah berlanjut.';
        }
        
        await sock.sendMessage(from, { text: errorMessage });
    }
}

/**
 * Handle base64 (placeholder)
 */
async function handleBase64(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    await sock.sendMessage(from, {
        text: '🔐 *Base64 Encoder/Decoder*\n\n⚠️ *Fitur dalam pengembangan*\n\nFitur encode/decode Base64 sedang dalam tahap pengembangan. Silakan gunakan fitur lain terlebih dahulu.'
    });
}

/**
 * Handle hash (placeholder)
 */
async function handleHash(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    await sock.sendMessage(from, {
        text: '🔐 *Hash Generator*\n\n⚠️ *Fitur dalam pengembangan*\n\nFitur hash generator sedang dalam tahap pengembangan. Silakan gunakan fitur lain terlebih dahulu.'
    });
}

/**
 * Handle color info (placeholder)
 */
async function handleColorInfo(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    await sock.sendMessage(from, {
        text: '🎨 *Color Info*\n\n⚠️ *Fitur dalam pengembangan*\n\nFitur informasi warna sedang dalam tahap pengembangan. Silakan gunakan fitur lain terlebih dahulu.'
    });
}

/**
 * Handle IP info with geolocation
 */
async function handleIPInfo(sock, msg, args) {
    const from = msg.key.remoteJid;
    const ipGeolocationService = require('../utils/ipGeolocation');
    
    try {
        // Show typing indicator
        await sock.sendPresenceUpdate('composing', from);
        
        if (!args || args.trim() === '') {
            await sock.sendMessage(from, {
                text: '🌐 *IP Geolocation Lookup*\n\n' +
                      '📝 *Format:* `.ip <ip_address>`\n\n' +
                      '📋 *Contoh:*\n' +
                      '• `.ip 8.8.8.8`\n' +
                      '• `.ip 1.1.1.1`\n' +
                      '• `.ip 208.67.222.222`\n\n' +
                      '💡 *Fitur:*\n' +
                      '• Lokasi geografis\n' +
                      '• Informasi ISP\n' +
                      '• Timezone\n' +
                      '• Security check\n' +
                      '• Multiple provider fallback'
            });
            return;
        }
        
        const ip = args.trim();
        
        // Validate IP format
        if (!ipGeolocationService.isValidIP(ip)) {
            await sock.sendMessage(from, {
                text: '❌ *Format IP Tidak Valid*\n\n' +
                      'Pastikan IP address dalam format yang benar:\n' +
                      '• IPv4: 192.168.1.1\n' +
                      '• IPv6: 2001:db8::1\n\n' +
                      'Contoh: `.ip 8.8.8.8`'
            });
            return;
        }
        
        // Check for private/local IPs
        if (isPrivateIP(ip)) {
            await sock.sendMessage(from, {
                text: '⚠️ *IP Address Lokal/Private*\n\n' +
                      `IP: \`${ip}\`\n\n` +
                      'IP address ini adalah alamat lokal/private yang tidak dapat dilacak secara geografis.\n\n' +
                      '🏠 *Jenis IP Private:*\n' +
                      '• 10.0.0.0 - 10.255.255.255\n' +
                      '• 172.16.0.0 - 172.31.255.255\n' +
                      '• 192.168.0.0 - 192.168.255.255\n' +
                      '• 127.0.0.1 (localhost)'
            });
            return;
        }
        
        // Get IP information
        const ipInfo = await ipGeolocationService.getIPInfo(ip);
        const formattedInfo = ipGeolocationService.formatIPInfo(ipInfo);
        
        await sock.sendMessage(from, { text: formattedInfo });
        
    } catch (error) {
        console.error('Error in handleIPInfo:', error);
        await sock.sendPresenceUpdate('available', from);
        
        let errorMessage = '❌ *Error IP Lookup*\n\n';
        
        if (error.message.includes('Rate limit exceeded')) {
            errorMessage += '⏰ *Rate Limit Tercapai*\n\n' +
                           'Batas penggunaan API telah tercapai. Silakan coba lagi nanti.\n\n' +
                           '💡 *Tips:* Gunakan IP address yang berbeda atau tunggu beberapa saat.';
        } else if (error.message.includes('Invalid IP')) {
            errorMessage += '🔍 *Format IP Salah*\n\n' +
                           'Pastikan format IP address sudah benar.\n\n' +
                           '📝 Contoh: `.ip 8.8.8.8`';
        } else if (error.message.includes('All IP geolocation providers failed')) {
            errorMessage += '🌐 *Semua Provider Gagal*\n\n' +
                           'Tidak dapat mengakses layanan geolokasi IP saat ini.\n\n' +
                           '🔧 *Kemungkinan penyebab:*\n' +
                           '• Koneksi internet bermasalah\n' +
                           '• API key belum dikonfigurasi\n' +
                           '• Rate limit tercapai\n\n' +
                           'Silakan coba lagi nanti.';
        } else {
            errorMessage += `Terjadi kesalahan: ${error.message}\n\n` +
                           'Silakan coba lagi atau hubungi admin jika masalah berlanjut.';
        }
        
        await sock.sendMessage(from, { text: errorMessage });
    }
}

/**
 * Check if IP is private/local
 */
function isPrivateIP(ip) {
    const parts = ip.split('.').map(Number);
    
    // IPv4 private ranges
    if (parts.length === 4) {
        // 10.0.0.0/8
        if (parts[0] === 10) return true;
        
        // 172.16.0.0/12
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        
        // 192.168.0.0/16
        if (parts[0] === 192 && parts[1] === 168) return true;
        
        // 127.0.0.0/8 (localhost)
        if (parts[0] === 127) return true;
        
        // 169.254.0.0/16 (link-local)
        if (parts[0] === 169 && parts[1] === 254) return true;
    }
    
    return false;
}

/**
 * Handle ping command
 */
async function handlePing(sock, msg, args) {
    const from = msg.key.remoteJid;
    const startTime = Date.now();
    
    try {
        await sock.sendMessage(from, {
            text: '🏓 *Pong!*\n\n📊 *Status Bot:*\n• Status: ✅ Online\n• Response Time: ' + (Date.now() - startTime) + 'ms\n• Server: 🟢 Running'
        });
    } catch (error) {
        console.error('Error in ping command:', error);
    }
}

/**
 * Handle uptime command
 */
async function handleUptime(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    try {
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        
        await sock.sendMessage(from, {
            text: `⏰ *Bot Uptime*\n\n📈 *Waktu Aktif:*\n• ${days} hari, ${hours} jam, ${minutes} menit, ${seconds} detik\n\n🔄 *Status:* ✅ Berjalan Normal\n📅 *Dimulai:* ${new Date(Date.now() - uptime * 1000).toLocaleString('id-ID')}`
        });
    } catch (error) {
        console.error('Error in uptime command:', error);
    }
}

/**
 * Handle info command
 */
async function handleInfo(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    try {
        const memoryUsage = process.memoryUsage();
        const memoryMB = Math.round(memoryUsage.rss / 1024 / 1024);
        
        await sock.sendMessage(from, {
            text: `ℹ️ *Bot Information*\n\n🤖 *Bot Details:*\n• Name: KKN WhatsApp Bot\n• Version: 1.0.0\n• Platform: Node.js ${process.version}\n• Memory Usage: ${memoryMB} MB\n\n⚡ *Features:*\n• 💰 Finance Management\n• 📁 Google Drive Integration\n• 🤖 AI Chatbot\n• 🌤️ Weather Info\n• 🔧 Utility Tools\n• 👥 Group Management\n\n👨‍💻 *Developer:* KKN Team\n📅 *Last Update:* ${new Date().toLocaleDateString('id-ID')}`
        });
    } catch (error) {
        console.error('Error in info command:', error);
    }
}

/**
 * Handle stats command
 */
async function handleStats(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    try {
        // Get basic stats
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        const memoryMB = Math.round(memoryUsage.rss / 1024 / 1024);
        const cpuUsage = process.cpuUsage();
        
        await sock.sendMessage(from, {
            text: `📊 *Bot Statistics*\n\n⚡ *Performance:*\n• Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\n• Memory: ${memoryMB} MB\n• CPU Time: ${Math.round(cpuUsage.user / 1000)}ms\n\n🔄 *System:*\n• Platform: ${process.platform}\n• Node.js: ${process.version}\n• PID: ${process.pid}\n\n📈 *Status:* ✅ Optimal`
        });
    } catch (error) {
        console.error('Error in stats command:', error);
    }
}

module.exports = {
    handleUtilsCommand
};