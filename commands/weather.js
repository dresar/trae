const axios = require('axios');
const { capitalize } = require('../utils/helpers');

/**
 * Handle weather commands
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {string} command - Command name
 * @param {Array} args - Command arguments
 */
async function handleWeatherCommand(sock, msg, command, args) {
    const from = msg.key.remoteJid;
    
    try {
        switch (command) {
            case 'cuaca':
            case 'weather':
                await handleWeatherInfo(sock, msg, args);
                break;
                
            case 'forecast':
            case 'ramalan':
                await handleWeatherForecast(sock, msg, args);
                break;
                
            default:
                await sock.sendMessage(from, {
                    text: '❓ *Command cuaca tidak ditemukan*\n\nGunakan: cuaca, weather, forecast, ramalan'
                });
        }
    } catch (error) {
        console.error('Error in weather command:', error);
        await sock.sendMessage(from, {
            text: '❌ *Terjadi kesalahan pada layanan cuaca*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle current weather info
 */
async function handleWeatherInfo(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '🌤️ *Informasi Cuaca*\n\n📝 *Cara penggunaan:*\n`!cuaca [nama kota]`\n\n📋 *Contoh:*\n`!cuaca Jakarta`\n`!cuaca Yogyakarta`\n`!cuaca Surabaya`\n\n💡 *Tips:* Gunakan nama kota dalam bahasa Indonesia atau Inggris'
        });
        return;
    }
    
    const city = args.join(' ');
    
    try {
        const weatherData = await getCurrentWeather(city);
        
        if (!weatherData) {
            await sock.sendMessage(from, {
                text: `❌ *Kota "${city}" tidak ditemukan*\n\nPastikan nama kota sudah benar atau coba dengan nama yang lebih spesifik.`
            });
            return;
        }
        
        const message = formatCurrentWeather(weatherData);
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error getting weather:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal mendapatkan informasi cuaca*\n\nSilakan coba lagi nanti atau periksa koneksi internet.'
        });
    }
}

/**
 * Handle weather forecast
 */
async function handleWeatherForecast(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '🌦️ *Ramalan Cuaca*\n\n📝 *Cara penggunaan:*\n`!forecast [nama kota]`\n\n📋 *Contoh:*\n`!forecast Jakarta`\n`!forecast Bandung`\n\n💡 *Info:* Menampilkan ramalan cuaca 5 hari ke depan'
        });
        return;
    }
    
    const city = args.join(' ');
    
    try {
        const forecastData = await getWeatherForecast(city);
        
        if (!forecastData) {
            await sock.sendMessage(from, {
                text: `❌ *Kota "${city}" tidak ditemukan*\n\nPastikan nama kota sudah benar atau coba dengan nama yang lebih spesifik.`
            });
            return;
        }
        
        const message = formatWeatherForecast(forecastData);
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error getting forecast:', error);
        await sock.sendMessage(from, {
            text: '❌ *Gagal mendapatkan ramalan cuaca*\n\nSilakan coba lagi nanti atau periksa koneksi internet.'
        });
    }
}

/**
 * Get current weather from OpenWeatherMap API
 */
async function getCurrentWeather(city) {
    const apiKey = process.env.WEATHER_API_KEY;
    
    if (!apiKey || apiKey === 'your_weather_api_key_here') {
        throw new Error('Weather API key not configured');
    }
    
    try {
        const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
            params: {
                q: city,
                appid: apiKey,
                units: 'metric',
                lang: 'id'
            },
            timeout: 10000
        });
        
        return response.data;
        
    } catch (error) {
        if (error.response?.status === 404) {
            return null; // City not found
        }
        throw error;
    }
}

/**
 * Get weather forecast from OpenWeatherMap API
 */
async function getWeatherForecast(city) {
    const apiKey = process.env.WEATHER_API_KEY;
    
    if (!apiKey || apiKey === 'your_weather_api_key_here') {
        throw new Error('Weather API key not configured');
    }
    
    try {
        const response = await axios.get(`https://api.openweathermap.org/data/2.5/forecast`, {
            params: {
                q: city,
                appid: apiKey,
                units: 'metric',
                lang: 'id'
            },
            timeout: 10000
        });
        
        return response.data;
        
    } catch (error) {
        if (error.response?.status === 404) {
            return null; // City not found
        }
        throw error;
    }
}

/**
 * Format current weather data
 */
function formatCurrentWeather(data) {
    const weather = data.weather[0];
    const main = data.main;
    const wind = data.wind;
    const clouds = data.clouds;
    const sys = data.sys;
    
    // Weather emoji mapping
    const weatherEmoji = {
        'clear sky': '☀️',
        'few clouds': '🌤️',
        'scattered clouds': '⛅',
        'broken clouds': '☁️',
        'shower rain': '🌦️',
        'rain': '🌧️',
        'thunderstorm': '⛈️',
        'snow': '❄️',
        'mist': '🌫️',
        'fog': '🌫️',
        'haze': '🌫️'
    };
    
    const emoji = weatherEmoji[weather.description] || '🌤️';
    
    let message = `${emoji} *Cuaca Saat Ini*\n\n`;
    message += `📍 *Lokasi:* ${data.name}, ${sys.country}\n`;
    message += `🌡️ *Suhu:* ${Math.round(main.temp)}°C\n`;
    message += `🌡️ *Terasa seperti:* ${Math.round(main.feels_like)}°C\n`;
    message += `📊 *Kondisi:* ${capitalize(weather.description)}\n`;
    message += `💧 *Kelembaban:* ${main.humidity}%\n`;
    message += `🌬️ *Angin:* ${wind.speed} m/s`;
    
    if (wind.deg) {
        message += ` (${getWindDirection(wind.deg)})`;
    }
    
    message += `\n☁️ *Awan:* ${clouds.all}%\n`;
    message += `🔽 *Tekanan:* ${main.pressure} hPa\n`;
    
    if (main.temp_min !== main.temp_max) {
        message += `📈 *Suhu Min/Max:* ${Math.round(main.temp_min)}°C / ${Math.round(main.temp_max)}°C\n`;
    }
    
    if (data.visibility) {
        message += `👁️ *Jarak pandang:* ${(data.visibility / 1000).toFixed(1)} km\n`;
    }
    
    // Sunrise and sunset
    const sunrise = new Date(sys.sunrise * 1000).toLocaleTimeString('id-ID', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Asia/Jakarta'
    });
    const sunset = new Date(sys.sunset * 1000).toLocaleTimeString('id-ID', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Asia/Jakarta'
    });
    
    message += `🌅 *Matahari terbit:* ${sunrise}\n`;
    message += `🌇 *Matahari terbenam:* ${sunset}\n\n`;
    
    message += `⏰ *Diperbarui:* ${new Date().toLocaleString('id-ID')}\n`;
    message += `📡 *Sumber:* OpenWeatherMap`;
    
    return message;
}

/**
 * Format weather forecast data
 */
function formatWeatherForecast(data) {
    const city = data.city;
    const forecasts = data.list;
    
    let message = `🌦️ *Ramalan Cuaca 5 Hari*\n\n`;
    message += `📍 *Lokasi:* ${city.name}, ${city.country}\n\n`;
    
    // Group forecasts by date
    const dailyForecasts = {};
    
    forecasts.forEach(forecast => {
        const date = new Date(forecast.dt * 1000);
        const dateKey = date.toISOString().split('T')[0];
        
        if (!dailyForecasts[dateKey]) {
            dailyForecasts[dateKey] = [];
        }
        
        dailyForecasts[dateKey].push(forecast);
    });
    
    // Format each day
    let dayCount = 0;
    for (const [dateKey, dayForecasts] of Object.entries(dailyForecasts)) {
        if (dayCount >= 5) break;
        
        const date = new Date(dateKey);
        const dayName = date.toLocaleDateString('id-ID', { weekday: 'long' });
        const dateStr = date.toLocaleDateString('id-ID', { 
            day: 'numeric', 
            month: 'short' 
        });
        
        // Get min/max temp for the day
        const temps = dayForecasts.map(f => f.main.temp);
        const minTemp = Math.round(Math.min(...temps));
        const maxTemp = Math.round(Math.max(...temps));
        
        // Get most common weather condition
        const weatherCounts = {};
        dayForecasts.forEach(f => {
            const desc = f.weather[0].description;
            weatherCounts[desc] = (weatherCounts[desc] || 0) + 1;
        });
        
        const mostCommonWeather = Object.keys(weatherCounts).reduce((a, b) => 
            weatherCounts[a] > weatherCounts[b] ? a : b
        );
        
        const weatherEmoji = getWeatherEmoji(mostCommonWeather);
        
        message += `${weatherEmoji} *${dayName}, ${dateStr}*\n`;
        message += `🌡️ ${minTemp}°C - ${maxTemp}°C\n`;
        message += `📊 ${capitalize(mostCommonWeather)}\n\n`;
        
        dayCount++;
    }
    
    message += `⏰ *Diperbarui:* ${new Date().toLocaleString('id-ID')}\n`;
    message += `📡 *Sumber:* OpenWeatherMap`;
    
    return message;
}

/**
 * Get weather emoji based on description
 */
function getWeatherEmoji(description) {
    const weatherEmoji = {
        'clear sky': '☀️',
        'cerah': '☀️',
        'few clouds': '🌤️',
        'berawan sebagian': '🌤️',
        'scattered clouds': '⛅',
        'berawan': '⛅',
        'broken clouds': '☁️',
        'mendung': '☁️',
        'overcast clouds': '☁️',
        'shower rain': '🌦️',
        'hujan ringan': '🌦️',
        'rain': '🌧️',
        'hujan': '🌧️',
        'heavy rain': '🌧️',
        'hujan lebat': '🌧️',
        'thunderstorm': '⛈️',
        'badai petir': '⛈️',
        'snow': '❄️',
        'salju': '❄️',
        'mist': '🌫️',
        'kabut': '🌫️',
        'fog': '🌫️',
        'haze': '🌫️',
        'berkabut': '🌫️'
    };
    
    return weatherEmoji[description.toLowerCase()] || '🌤️';
}

/**
 * Get wind direction from degrees
 */
function getWindDirection(degrees) {
    const directions = [
        'Utara', 'Timur Laut', 'Timur', 'Tenggara',
        'Selatan', 'Barat Daya', 'Barat', 'Barat Laut'
    ];
    
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
}

/**
 * Get weather advice based on conditions
 */
function getWeatherAdvice(weatherData) {
    const weather = weatherData.weather[0];
    const temp = weatherData.main.temp;
    const humidity = weatherData.main.humidity;
    const windSpeed = weatherData.wind.speed;
    
    let advice = [];
    
    // Temperature advice
    if (temp > 35) {
        advice.push('🔥 Cuaca sangat panas! Hindari aktivitas outdoor dan minum banyak air');
    } else if (temp > 30) {
        advice.push('☀️ Cuaca panas, gunakan topi dan sunscreen jika keluar rumah');
    } else if (temp < 20) {
        advice.push('🧥 Cuaca sejuk, sebaiknya pakai jaket atau sweater');
    }
    
    // Weather condition advice
    if (weather.main === 'Rain') {
        advice.push('☔ Jangan lupa bawa payung atau jas hujan!');
    } else if (weather.main === 'Thunderstorm') {
        advice.push('⛈️ Ada badai petir, sebaiknya tetap di dalam ruangan');
    } else if (weather.main === 'Snow') {
        advice.push('❄️ Bersalju! Pakai pakaian hangat dan hati-hati di jalan');
    }
    
    // Humidity advice
    if (humidity > 80) {
        advice.push('💧 Kelembaban tinggi, mungkin terasa gerah');
    }
    
    // Wind advice
    if (windSpeed > 10) {
        advice.push('🌬️ Angin kencang, hati-hati jika berkendara');
    }
    
    return advice.length > 0 ? `\n💡 *Saran:*\n${advice.join('\n')}` : '';
}

module.exports = {
    handleWeatherCommand
};