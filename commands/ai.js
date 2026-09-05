const axios = require('axios');
const { truncateText } = require('../utils/helpers');
const apiKeyManager = require('../utils/apiKeyManager');

/**
 * Handle AI commands
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {string} command - Command name
 * @param {Array} args - Command arguments
 */
async function handleAICommand(sock, msg, command, args) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    const senderNumber = sender.replace('@s.whatsapp.net', '');
    
    try {
        switch (command) {
            case 'ai':
            case 'chat':
            case 'ask':
                await handleAIChat(sock, msg, args, senderNumber);
                break;
            case 'generate':
            case 'create':
                await handleAIGenerate(sock, msg, args, senderNumber);
                break;
            case 'analyze':
            case 'analisis':
                await handleAIAnalyze(sock, msg, args, senderNumber);
                break;
            case 'translate':
            case 'terjemah':
                await handleAITranslate(sock, msg, args, senderNumber);
                break;
            case 'summarize':
            case 'ringkas':
                await handleAISummarize(sock, msg, args, senderNumber);
                break;
            case 'explain':
            case 'jelaskan':
                await handleAIExplain(sock, msg, args, senderNumber);
                break;
                
            default:
                await sock.sendMessage(from, {
                    text: '🤖 *AI Commands Available:*\n\n' +
                          '💬 `!ai [question]` - Chat dengan AI\n' +
                          '🎨 `!generate [prompt]` - Generate konten\n' +
                          '🔍 `!analyze [text]` - Analisis teks\n' +
                          '🌐 `!translate [text]` - Terjemahkan\n' +
                          '📝 `!summarize [text]` - Ringkas teks\n' +
                          '💡 `!explain [topic]` - Jelaskan topik'
                });
        }
    } catch (error) {
        console.error('Error in AI command:', error);
        await sock.sendMessage(from, {
            text: '❌ *Terjadi kesalahan pada AI*\n\nSilakan coba lagi nanti.'
        });
    }
}

/**
 * Handle AI chat
 */
async function handleAIChat(sock, msg, args, senderNumber) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '❓ *Apa yang ingin kamu tanyakan?*\n\n📝 *Cara penggunaan:*\n`!ai [pertanyaan]`\n\n📋 *Contoh:*\n`!ai Apa itu KKN?`\n`!ai Bagaimana cara membuat laporan yang baik?`\n`!ai Jelaskan tentang manajemen keuangan`'
        });
        return;
    }
    
    const question = args.join(' ');
    
    // Send typing indicator
    await sock.sendPresenceUpdate('composing', from);
    
    try {
        // Try Groq first (very fast alternative)
        let response = await getGroqResponse(question, senderNumber);
        
        if (!response) {
            // Fallback to regular Gemini
            response = await getGeminiResponse(question, senderNumber);
        }
        
        if (!response) {
            // Final fallback to local AI responses
            response = getLocalAIResponse(question);
        }
        
        // Stop typing
        await sock.sendPresenceUpdate('available', from);
        
        // Format response
        let message = `🤖 *AI Assistant*\n\n`;
        message += `❓ *Pertanyaan:* ${truncateText(question, 100)}\n\n`;
        message += `💬 *Jawaban:*\n${response}\n\n`;
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
        console.error('Error getting AI response:', error);
        await sock.sendPresenceUpdate('available', from);
        
        await sock.sendMessage(from, {
            text: '❌ *AI sedang tidak tersedia*\n\nSilakan coba lagi nanti atau hubungi admin.'
        });
    }
}

/**
 * Get response from OpenAI
 */
async function getOpenAIResponse(question, senderNumber) {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey || apiKey === 'your_openai_api_key_here') {
        return null;
    }
    
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: `Kamu adalah asisten AI untuk program KKN (Kuliah Kerja Nyata). Kamu membantu mahasiswa KKN dengan:
                    - Informasi tentang KKN
                    - Manajemen keuangan
                    - Pembuatan laporan
                    - Kegiatan kemasyarakatan
                    - Tips dan saran untuk KKN
                    
                    Jawab dalam bahasa Indonesia dengan ramah dan informatif. Berikan jawaban yang praktis dan mudah dipahami.`
                },
                {
                    role: 'user',
                    content: question
                }
            ],
            max_tokens: 1000,
            temperature: 0.7,
            user: senderNumber
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        return response.data.choices[0].message.content.trim();
        
    } catch (error) {
        console.error('OpenAI API error:', error.response?.data || error.message);
        return null;
    }
}



/**
 * Get response from Groq (Fast Alternative AI)
 */
async function getGroqResponse(question, senderNumber) {
    const apiKey = apiKeyManager.getCurrentAPIKey('groq', senderNumber);
    
    if (!apiKey || apiKey.includes('your_') || apiKey.includes('_here')) {
        return null;
    }
    
    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama3-70b-8192', // Fast and capable model
            messages: [
                {
                    role: 'system',
                    content: `Eh gue AI yang kece abis buat KKN nih! 😎 Gue tau banget soal:

🎓 AKADEMIK:
- Riset KKN yang gak bikin pusing
- Bikin proposal yang mantul
- Evaluasi yang gak ribet
- Best practice KKN se-Indonesia

🤝 SOSIAL:
- Gimana caranya akrab sama warga
- Berdayain masyarakat dengan asik
- Damaiin konflik kayak diplomat
- Peka budaya biar gak salah tingkah

💼 MANAJEMEN:
- Manage project kayak bos
- Jadi leader yang keren
- Atur resource biar hemat
- Antisipasi masalah sebelum kejadian

Gue bakal jawab dengan gaya:
✅ Santai tapi tetep informatif
✅ Pake contoh yang relate banget
✅ Bisa langsung dipraktekin
✅ Sesuai kultur Indonesia
✅ Bahasa gaul tapi tetep sopan 😄`
                },
                {
                    role: 'user',
                    content: question
                }
            ],
            max_tokens: 2048,
            temperature: 0.7,
            top_p: 0.9,
            stream: false
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 25000
        });
        
        return response.data.choices[0].message.content.trim();
        
    } catch (error) {
        console.error('Groq API error:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Get response from Google Gemini (Fallback)
 */
async function getGeminiResponse(question, senderNumber) {
    const apiKey = apiKeyManager.getCurrentAPIKey('gemini', senderNumber);
    
    if (!apiKey || apiKey.includes('your_') || apiKey.includes('_here')) {
        return null;
    }
    
    try {
        const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
            contents: [{
                parts: [{
                    text: `Yo! Gue AI kece yang siap bantuin lo soal KKN! 😎 Gue bakal jawab pertanyaan lo dengan gaya santai tapi tetep informatif. Siap-siap dapet jawaban yang asik dan gampang dipahami ya! 🚀\n\n${question}`
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1000,
            }
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        return response.data.candidates[0].content.parts[0].text.trim();
        
    } catch (error) {
        console.error('Gemini API error:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Get local AI response (fallback)
 */
function getLocalAIResponse(question) {
    const lowerQuestion = question.toLowerCase();
    
    // KKN related responses
    if (lowerQuestion.includes('kkn') || lowerQuestion.includes('kuliah kerja nyata')) {
        return `KKN (Kuliah Kerja Nyata) adalah program wajib bagi mahasiswa untuk mengaplikasikan ilmu yang telah dipelajari di masyarakat. Program ini bertujuan untuk:\n\n1. 🎓 Mengembangkan kepribadian mahasiswa\n2. 🤝 Meningkatkan kepekaan sosial\n3. 💡 Mengaplikasikan ilmu pengetahuan\n4. 🌟 Memberikan pengalaman belajar di masyarakat\n\nDurasi KKN biasanya 1-2 bulan dengan berbagai kegiatan seperti penyuluhan, pemberdayaan masyarakat, dan pengabdian sosial.`;
    }
    
    // Finance related responses
    if (lowerQuestion.includes('keuangan') || lowerQuestion.includes('uang') || lowerQuestion.includes('dana')) {
        return `Manajemen keuangan KKN sangat penting untuk kelancaran program. Berikut tips mengelola keuangan KKN:\n\n💰 **Perencanaan:**\n- Buat anggaran detail sebelum berangkat\n- Alokasikan dana untuk konsumsi, transport, dan kegiatan\n- Siapkan dana darurat 10-20% dari total budget\n\n📊 **Pencatatan:**\n- Catat setiap pemasukan dan pengeluaran\n- Gunakan aplikasi atau buku kas\n- Buat laporan keuangan berkala\n\n🤝 **Transparansi:**\n- Laporkan keuangan secara terbuka ke anggota\n- Simpan semua bukti transaksi\n- Buat laporan akhir yang detail`;
    }
    
    // Report related responses
    if (lowerQuestion.includes('laporan') || lowerQuestion.includes('report')) {
        return `Tips membuat laporan KKN yang baik:\n\n📝 **Struktur Laporan:**\n1. Cover dan halaman pengesahan\n2. Kata pengantar\n3. Daftar isi\n4. BAB I: Pendahuluan (latar belakang, tujuan, manfaat)\n5. BAB II: Gambaran umum lokasi\n6. BAB III: Pelaksanaan kegiatan\n7. BAB IV: Hasil dan pembahasan\n8. BAB V: Penutup (kesimpulan dan saran)\n9. Lampiran (dokumentasi, surat, dll)\n\n✅ **Tips Penulisan:**\n- Gunakan bahasa formal dan baku\n- Sertakan data dan fakta yang akurat\n- Tambahkan foto dokumentasi kegiatan\n- Proofread sebelum submit`;
    }
    
    // Activity related responses
    if (lowerQuestion.includes('kegiatan') || lowerQuestion.includes('program') || lowerQuestion.includes('aktivitas')) {
        return `Contoh kegiatan KKN yang bermanfaat:\n\n🏫 **Bidang Pendidikan:**\n- Mengajar di sekolah/TPA\n- Bimbingan belajar gratis\n- Pelatihan komputer dasar\n- Literasi untuk anak-anak\n\n🏥 **Bidang Kesehatan:**\n- Penyuluhan kesehatan\n- Posyandu balita\n- Senam sehat bersama\n- Pemeriksaan kesehatan gratis\n\n🌱 **Bidang Lingkungan:**\n- Gotong royong kebersihan\n- Penanaman pohon\n- Pengelolaan sampah\n- Pembuatan kompos\n\n💼 **Bidang Ekonomi:**\n- Pelatihan kewirausahaan\n- Pemberdayaan UMKM\n- Pemasaran online\n- Manajemen keuangan`;
    }
    
    // General responses
    const generalResponses = [
        `Terima kasih atas pertanyaannya! Sebagai asisten KKN, saya siap membantu dengan informasi seputar:\n\n🎓 Program KKN\n💰 Manajemen keuangan\n📝 Pembuatan laporan\n🤝 Kegiatan kemasyarakatan\n\nSilakan ajukan pertanyaan yang lebih spesifik agar saya bisa memberikan jawaban yang lebih tepat!`,
        
        `Halo! Saya adalah asisten AI untuk program KKN. Saya dapat membantu Anda dengan:\n\n✅ Informasi tentang KKN\n✅ Tips manajemen keuangan\n✅ Panduan membuat laporan\n✅ Ide kegiatan kemasyarakatan\n✅ Solusi masalah umum KKN\n\nAda yang bisa saya bantu hari ini?`,
        
        `Pertanyaan yang menarik! Untuk memberikan jawaban yang lebih akurat, bisa Anda berikan konteks yang lebih spesifik? Misalnya:\n\n🔍 Tentang aspek apa dari KKN?\n🔍 Masalah apa yang sedang dihadapi?\n🔍 Informasi apa yang dibutuhkan?\n\nSemakin spesifik pertanyaan, semakin tepat jawaban yang bisa saya berikan!`
    ];
    
    return generalResponses[Math.floor(Math.random() * generalResponses.length)];
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
 * Get AI response for specific topics
 */
function getTopicResponse(topic) {
    const responses = {
        greeting: [
            'Halo! Selamat datang di Bot KKN! 👋\n\nSaya siap membantu Anda dengan berbagai informasi seputar KKN. Ada yang bisa saya bantu?',
            'Hai! Saya adalah asisten AI untuk program KKN. Silakan tanyakan apa saja yang ingin Anda ketahui! 😊',
            'Selamat datang! Saya di sini untuk membantu perjalanan KKN Anda. Apa yang ingin Anda ketahui hari ini? 🎓'
        ],
        
        thanks: [
            'Sama-sama! Senang bisa membantu program KKN Anda. Jangan ragu untuk bertanya lagi ya! 😊',
            'Terima kasih kembali! Semoga informasinya bermanfaat untuk KKN Anda. Sukses selalu! 🌟',
            'You\'re welcome! Saya selalu siap membantu. Semoga KKN Anda berjalan lancar! 👍'
        ],
        
        motivation: [
            'Semangat untuk KKN-nya! 💪\n\nIngat, KKN adalah kesempatan emas untuk:\n🌟 Mengaplikasikan ilmu\n🤝 Membantu masyarakat\n📈 Mengembangkan diri\n🎯 Membangun networking\n\nKamu pasti bisa!',
            'KKN memang menantang, tapi itulah yang membuatnya berharga! 🔥\n\nSetiap tantangan adalah kesempatan untuk tumbuh. Tetap semangat dan nikmati prosesnya!',
            'Percaya diri dengan kemampuan yang kamu miliki! 🌈\n\nKKN akan memberikan pengalaman tak terlupakan dan pembelajaran yang sangat berharga. Go for it!'
        ]
    };
    
    return responses[topic] ? responses[topic][Math.floor(Math.random() * responses[topic].length)] : null;
}

/**
 * Handle AI Generate - Create content
 */
async function handleAIGenerate(sock, msg, args, senderNumber) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '🎨 *AI Content Generator*\n\n📝 *Cara penggunaan:*\n`!generate [prompt]`\n\n📋 *Contoh:*\n`!generate Buatkan proposal kegiatan KKN bidang pendidikan`\n`!generate Rancang jadwal kegiatan KKN selama 1 bulan`\n`!generate Buat surat undangan rapat koordinasi KKN`'
        });
        return;
    }
    
    const prompt = args.join(' ');
    await sock.sendPresenceUpdate('composing', from);
    
    try {
        const enhancedPrompt = `Sebagai AI generator konten untuk KKN, buatkan: ${prompt}\n\nPastikan hasil yang dibuat:\n✅ Profesional dan terstruktur\n✅ Sesuai standar akademik\n✅ Praktis dan dapat diimplementasikan\n✅ Dilengkapi detail yang diperlukan`;
        
        let response = await getGroqResponse(enhancedPrompt, senderNumber);
        if (!response) response = await getGeminiResponse(enhancedPrompt, senderNumber);
        if (!response) response = "Maaf, layanan AI generator sedang tidak tersedia. Silakan coba lagi nanti.";
        
        await sock.sendPresenceUpdate('available', from);
        
        const message = `🎨 *AI Content Generator*\n\n📝 *Request:* ${truncateText(prompt, 100)}\n\n✨ *Generated Content:*\n${response}\n\n⏰ ${new Date().toLocaleString('id-ID')}`;
        
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
        console.error('Error in AI generate:', error);
        await sock.sendPresenceUpdate('available', from);
        await sock.sendMessage(from, { text: '❌ *AI Generator error*\n\nSilakan coba lagi nanti.' });
    }
}

/**
 * Handle AI Analyze - Analyze text/data
 */
async function handleAIAnalyze(sock, msg, args, senderNumber) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '🔍 *AI Text Analyzer*\n\n📝 *Cara penggunaan:*\n`!analyze [text/data]`\n\n📋 *Contoh:*\n`!analyze Data keuangan KKN bulan ini: pemasukan 5jt, pengeluaran 4.2jt`\n`!analyze Laporan kegiatan minggu ini kurang optimal karena cuaca buruk`'
        });
        return;
    }
    
    const text = args.join(' ');
    await sock.sendPresenceUpdate('composing', from);
    
    try {
        const analysisPrompt = `Sebagai AI analyst untuk KKN, lakukan analisis mendalam terhadap: ${text}\n\nBerikan analisis yang mencakup:\n🔍 Insight utama\n📊 Pola dan trend\n⚠️ Potensi masalah\n💡 Rekomendasi actionable\n📈 Langkah perbaikan`;
        
        let response = await getGroqResponse(analysisPrompt, senderNumber);
        if (!response) response = await getGeminiResponse(analysisPrompt, senderNumber);
        if (!response) response = "Maaf, layanan AI analyzer sedang tidak tersedia. Silakan coba lagi nanti.";
        
        await sock.sendPresenceUpdate('available', from);
        
        const message = `🔍 *AI Analysis Report*\n\n📄 *Data:* ${truncateText(text, 100)}\n\n📊 *Analysis:*\n${response}\n\n⏰ ${new Date().toLocaleString('id-ID')}`;
        
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
        console.error('Error in AI analyze:', error);
        await sock.sendPresenceUpdate('available', from);
        await sock.sendMessage(from, { text: '❌ *AI Analyzer error*\n\nSilakan coba lagi nanti.' });
    }
}

/**
 * Handle AI Translate - Smart translation
 */
async function handleAITranslate(sock, msg, args, senderNumber) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '🌐 *AI Smart Translator*\n\n📝 *Cara penggunaan:*\n`!translate [text]`\n`!translate [bahasa] [text]`\n\n📋 *Contoh:*\n`!translate Hello, how are you?`\n`!translate english Selamat pagi, apa kabar?`\n`!translate japanese Terima kasih atas bantuannya`'
        });
        return;
    }
    
    const input = args.join(' ');
    await sock.sendPresenceUpdate('composing', from);
    
    try {
        const translatePrompt = `Sebagai AI translator yang cerdas, terjemahkan teks berikut dengan akurat dan natural: ${input}\n\nJika tidak ada bahasa target yang disebutkan, deteksi bahasa sumber dan terjemahkan ke bahasa yang paling sesuai (Indonesia/English).\n\nBerikan:\n🔤 Bahasa sumber\n🌐 Terjemahan\n💡 Konteks/penjelasan jika diperlukan`;
        
        let response = await getGroqResponse(translatePrompt, senderNumber);
        if (!response) response = await getGeminiResponse(translatePrompt, senderNumber);
        if (!response) response = "Maaf, layanan AI translator sedang tidak tersedia. Silakan coba lagi nanti.";
        
        await sock.sendPresenceUpdate('available', from);
        
        const message = `🌐 *AI Smart Translator*\n\n📝 *Input:* ${truncateText(input, 100)}\n\n🔄 *Translation:*\n${response}\n\n⏰ ${new Date().toLocaleString('id-ID')}`;
        
        await sock.sendMessage(from, { text: message });
        
    } catch (error) {
        console.error('Error in AI translate:', error);
        await sock.sendPresenceUpdate('available', from);
        await sock.sendMessage(from, { text: '❌ *AI Translator error*\n\nSilakan coba lagi nanti.' });
    }
}

/**
 * Handle AI Summarize - Intelligent summarization
 */
async function handleAISummarize(sock, msg, args, senderNumber) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '📝 *AI Smart Summarizer*\n\n📝 *Cara penggunaan:*\n`!summarize [long text]`\n\n📋 *Contoh:*\n`!summarize [paste artikel/dokumen panjang]`\n`!summarize [laporan kegiatan detail]`'
        });
        return;
    }
    
    const text = args.join(' ');
    await sock.sendPresenceUpdate('composing', from);
    
    try {
        const summarizePrompt = `Sebagai AI summarizer yang expert, buatkan ringkasan yang komprehensif dari teks berikut: ${text}\n\nBuat ringkasan yang:\n📋 Mencakup poin-poin utama\n🎯 Fokus pada informasi penting\n📊 Terstruktur dan mudah dipahami\n💡 Dilengkapi insight key takeaways\n⚡ Singkat namun informatif`;
        
        let response = await getGroqResponse(summarizePrompt, senderNumber);
        if (!response) response = await getGeminiResponse(summarizePrompt, senderNumber);
        if (!response) response = "Maaf, layanan AI summarizer sedang tidak tersedia. Silakan coba lagi nanti.";
        
        await sock.sendPresenceUpdate('available', from);
        
        const message = `📝 *AI Smart Summary*\n\n📄 *Original:* ${truncateText(text, 100)}\n\n📋 *Summary:*\n${response}\n\n⏰ ${new Date().toLocaleString('id-ID')}`;
        
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
        console.error('Error in AI summarize:', error);
        await sock.sendPresenceUpdate('available', from);
        await sock.sendMessage(from, { text: '❌ *AI Summarizer error*\n\nSilakan coba lagi nanti.' });
    }
}

/**
 * Handle AI Explain - Detailed explanations
 */
async function handleAIExplain(sock, msg, args, senderNumber) {
    const from = msg.key.remoteJid;
    
    if (args.length === 0) {
        await sock.sendMessage(from, {
            text: '💡 *AI Smart Explainer*\n\n📝 *Cara penggunaan:*\n`!explain [topic/concept]`\n\n📋 *Contoh:*\n`!explain Metodologi penelitian KKN`\n`!explain Cara membuat proposal yang baik`\n`!explain Strategi pemberdayaan masyarakat`'
        });
        return;
    }
    
    const topic = args.join(' ');
    await sock.sendPresenceUpdate('composing', from);
    
    try {
        const explainPrompt = `Sebagai AI educator yang expert, jelaskan secara detail dan komprehensif tentang: ${topic}\n\nBerikan penjelasan yang:\n📚 Mudah dipahami untuk mahasiswa KKN\n🎯 Dilengkapi contoh praktis\n📊 Terstruktur dengan baik\n💡 Actionable dan implementable\n🔍 Mencakup tips dan best practices`;
        
        let response = await getGroqResponse(explainPrompt, senderNumber);
        if (!response) response = await getGeminiResponse(explainPrompt, senderNumber);
        if (!response) response = "Maaf, layanan AI explainer sedang tidak tersedia. Silakan coba lagi nanti.";
        
        await sock.sendPresenceUpdate('available', from);
        
        const message = `💡 *AI Smart Explanation*\n\n🎯 *Topic:* ${truncateText(topic, 100)}\n\n📚 *Explanation:*\n${response}\n\n⏰ ${new Date().toLocaleString('id-ID')}`;
        
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
        console.error('Error in AI explain:', error);
        await sock.sendPresenceUpdate('available', from);
        await sock.sendMessage(from, { text: '❌ *AI Explainer error*\n\nSilakan coba lagi nanti.' });
    }
}

module.exports = {
    handleAICommand,
    getTopicResponse
};