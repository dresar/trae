const GroupManager = require('../utils/groupManager');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

class GroupEntertainmentCommands {
    constructor() {
        this.groupManager = new GroupManager();
        this.activeGames = new Map();
        this.triviaQuestions = [
            {
                question: "Apa ibu kota Indonesia?",
                options: ["Jakarta", "Surabaya", "Bandung", "Medan"],
                correct: 0,
                category: "Geografi"
            },
            {
                question: "Siapa presiden pertama Indonesia?",
                options: ["Suharto", "Soekarno", "Habibie", "Megawati"],
                correct: 1,
                category: "Sejarah"
            },
            {
                question: "Berapa hasil dari 15 x 8?",
                options: ["120", "125", "130", "115"],
                correct: 0,
                category: "Matematika"
            },
            {
                question: "Planet terdekat dengan matahari adalah?",
                options: ["Venus", "Mars", "Merkurius", "Bumi"],
                correct: 2,
                category: "Sains"
            },
            {
                question: "Bahasa pemrograman yang dibuat oleh Guido van Rossum?",
                options: ["Java", "Python", "JavaScript", "C++"],
                correct: 1,
                category: "Teknologi"
            }
        ];
        
        this.jokes = [
            "Kenapa programmer suka kopi? Karena tanpa kopi, code-nya jadi bug! ☕",
            "Apa bedanya HTML dan kamu? HTML punya closing tag, kamu enggak! 😂",
            "Kenapa WiFi lemot? Karena lagi diet bandwidth! 📶",
            "Programmer itu kayak dukun, sama-sama bisa bikin yang error jadi bener! 🧙‍♂️",
            "Kenapa komputer dingin? Karena lupa tutup Windows! 🪟",
            "Apa persamaan antara bug dan nyamuk? Sama-sama bikin susah tidur! 🦟",
            "Kenapa server down? Karena kecapean ngangkat data! 💪",
            "Programmer sejati itu yang bisa debug sambil tidur! 😴"
        ];
        
        this.quotes = [
            "Kesuksesan adalah kemampuan untuk bangkit dari kegagalan tanpa kehilangan semangat. - Winston Churchill",
            "Jangan takut bermimpi besar, karena mimpi adalah awal dari semua pencapaian. - Walt Disney",
            "Hidup itu seperti coding, kadang error tapi harus tetap debug sampai berhasil. - Anonymous",
            "Kegagalan adalah kesempatan untuk memulai lagi dengan lebih cerdas. - Henry Ford",
            "Tidak ada yang tidak mungkin, yang ada hanya belum dicoba. - Anonymous",
            "Belajar dari kemarin, hidup untuk hari ini, berharap untuk besok. - Albert Einstein",
            "Perubahan adalah satu-satunya konstanta dalam hidup. - Heraclitus",
            "Kesabaran adalah kunci dari semua pintu kesuksesan. - Anonymous"
        ];
        
        this.wordGuessWords = [
            { word: "KOMPUTER", hint: "Alat elektronik untuk mengolah data" },
            { word: "INTERNET", hint: "Jaringan global yang menghubungkan komputer" },
            { word: "PROGRAMMING", hint: "Proses menulis kode untuk membuat software" },
            { word: "JAVASCRIPT", hint: "Bahasa pemrograman untuk web development" },
            { word: "DATABASE", hint: "Tempat penyimpanan data terstruktur" },
            { word: "ALGORITHM", hint: "Langkah-langkah untuk menyelesaikan masalah" },
            { word: "FRAMEWORK", hint: "Kerangka kerja untuk development" },
            { word: "DEBUGGING", hint: "Proses mencari dan memperbaiki error" }
        ];
    }

    // Start trivia game
    async handleTrivia(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = msg.key.participant || msg.key.remoteJid;
        
        const group = this.groupManager.getGroup(groupId);
        if (!group || !group.entertainment.games.settings.triviaEnabled) {
            return await sock.sendMessage(groupId, {
                text: '❌ Game trivia tidak diaktifkan di grup ini.'
            });
        }

        // Check if there's already an active game
        if (this.activeGames.has(groupId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Sudah ada game yang sedang berlangsung. Tunggu sampai selesai!'
            });
        }

        try {
            const randomQuestion = this.triviaQuestions[Math.floor(Math.random() * this.triviaQuestions.length)];
            const gameId = uuidv4().substring(0, 8);
            
            const game = {
                id: gameId,
                type: 'trivia',
                question: randomQuestion,
                startedBy: senderId,
                startedAt: moment().toISOString(),
                participants: {},
                isActive: true,
                timeLimit: 30000 // 30 seconds
            };
            
            this.activeGames.set(groupId, game);
            
            let triviaText = `🧠 *TRIVIA GAME*\n\n` +
                           `📚 *Kategori:* ${randomQuestion.category}\n` +
                           `❓ *Pertanyaan:*\n${randomQuestion.question}\n\n` +
                           `📋 *Pilihan:*\n`;
            
            randomQuestion.options.forEach((option, index) => {
                triviaText += `${String.fromCharCode(65 + index)}. ${option}\n`;
            });
            
            triviaText += `\n⏰ *Waktu:* 30 detik\n` +
                         `🎯 *Cara jawab:* Ketik huruf pilihan (A/B/C/D)\n` +
                         `🆔 *Game ID:* \`${gameId}\`\n\n` +
                         `🎮 *Dimulai oleh:* @${senderId.split('@')[0]}`;
            
            await sock.sendMessage(groupId, {
                text: triviaText,
                mentions: [senderId]
            });
            
            // Set timeout for game
            setTimeout(async () => {
                await this.endTriviaGame(sock, groupId, gameId);
            }, game.timeLimit);
            
        } catch (error) {
            console.error('Error starting trivia:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat memulai trivia.'
            });
        }
    }

    // Handle trivia answer
    async handleTriviaAnswer(sock, groupId, userId, answer) {
        const game = this.activeGames.get(groupId);
        if (!game || game.type !== 'trivia' || !game.isActive) return;
        
        const answerIndex = answer.toUpperCase().charCodeAt(0) - 65; // Convert A-D to 0-3
        if (answerIndex < 0 || answerIndex > 3) return;
        
        // Check if user already answered
        if (game.participants[userId]) return;
        
        game.participants[userId] = {
            answer: answerIndex,
            answeredAt: moment().toISOString(),
            isCorrect: answerIndex === game.question.correct
        };
        
        const username = userId.split('@')[0];
        
        if (answerIndex === game.question.correct) {
            // Correct answer - end game immediately
            await this.endTriviaGame(sock, groupId, game.id, userId);
        } else {
            // Wrong answer
            await sock.sendMessage(groupId, {
                text: `❌ @${username} salah! Game masih berlanjut...`,
                mentions: [userId]
            });
        }
    }

    // End trivia game
    async endTriviaGame(sock, groupId, gameId, winnerId = null) {
        const game = this.activeGames.get(groupId);
        if (!game || game.id !== gameId) return;
        
        game.isActive = false;
        const correctAnswer = game.question.options[game.question.correct];
        
        let resultText = `🏁 *TRIVIA SELESAI*\n\n` +
                        `❓ *Pertanyaan:* ${game.question.question}\n` +
                        `✅ *Jawaban benar:* ${correctAnswer}\n\n`;
        
        if (winnerId) {
            const winner = game.participants[winnerId];
            const responseTime = moment(winner.answeredAt).diff(moment(game.startedAt), 'seconds');
            
            resultText += `🏆 *PEMENANG:* @${winnerId.split('@')[0]}\n` +
                         `⏱️ *Waktu respons:* ${responseTime} detik\n\n`;
            
            // Update leaderboard
            await this.updateGameLeaderboard(groupId, winnerId, 'trivia', 10);
        } else {
            resultText += `😔 *Tidak ada yang menjawab benar*\n\n`;
        }
        
        // Show all participants
        const participants = Object.keys(game.participants);
        if (participants.length > 0) {
            resultText += `👥 *Peserta:*\n`;
            participants.forEach(userId => {
                const participant = game.participants[userId];
                const status = participant.isCorrect ? '✅' : '❌';
                resultText += `${status} @${userId.split('@')[0]}\n`;
            });
        }
        
        const mentions = winnerId ? [winnerId, ...participants] : participants;
        
        await sock.sendMessage(groupId, {
            text: resultText,
            mentions: mentions
        });
        
        this.activeGames.delete(groupId);
    }

    // Start word guess game
    async handleWordGuess(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = msg.key.participant || msg.key.remoteJid;
        
        const group = this.groupManager.getGroup(groupId);
        if (!group || !group.entertainment.games.settings.wordGuessEnabled) {
            return await sock.sendMessage(groupId, {
                text: '❌ Game tebak kata tidak diaktifkan di grup ini.'
            });
        }

        // Check if there's already an active game
        if (this.activeGames.has(groupId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Sudah ada game yang sedang berlangsung. Tunggu sampai selesai!'
            });
        }

        try {
            const randomWord = this.wordGuessWords[Math.floor(Math.random() * this.wordGuessWords.length)];
            const gameId = uuidv4().substring(0, 8);
            
            // Create masked word
            const maskedWord = randomWord.word.split('').map((char, index) => {
                // Show first and last letter, hide others
                if (index === 0 || index === randomWord.word.length - 1) {
                    return char;
                }
                return '_';
            }).join(' ');
            
            const game = {
                id: gameId,
                type: 'wordguess',
                word: randomWord.word,
                hint: randomWord.hint,
                maskedWord: maskedWord,
                startedBy: senderId,
                startedAt: moment().toISOString(),
                participants: {},
                isActive: true,
                timeLimit: 60000 // 60 seconds
            };
            
            this.activeGames.set(groupId, game);
            
            const gameText = `🔤 *TEBAK KATA*\n\n` +
                           `💡 *Hint:* ${randomWord.hint}\n` +
                           `📝 *Kata:* \`${maskedWord}\`\n` +
                           `📏 *Panjang:* ${randomWord.word.length} huruf\n\n` +
                           `⏰ *Waktu:* 60 detik\n` +
                           `🎯 *Cara main:* Ketik kata yang Anda tebak\n` +
                           `🆔 *Game ID:* \`${gameId}\`\n\n` +
                           `🎮 *Dimulai oleh:* @${senderId.split('@')[0]}`;
            
            await sock.sendMessage(groupId, {
                text: gameText,
                mentions: [senderId]
            });
            
            // Set timeout for game
            setTimeout(async () => {
                await this.endWordGuessGame(sock, groupId, gameId);
            }, game.timeLimit);
            
        } catch (error) {
            console.error('Error starting word guess:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat memulai tebak kata.'
            });
        }
    }

    // Handle word guess answer
    async handleWordGuessAnswer(sock, groupId, userId, guess) {
        const game = this.activeGames.get(groupId);
        if (!game || game.type !== 'wordguess' || !game.isActive) return;
        
        const cleanGuess = guess.toUpperCase().replace(/[^A-Z]/g, '');
        if (cleanGuess.length === 0) return;
        
        // Check if user already answered correctly
        if (game.participants[userId] && game.participants[userId].isCorrect) return;
        
        game.participants[userId] = {
            guess: cleanGuess,
            guessedAt: moment().toISOString(),
            isCorrect: cleanGuess === game.word
        };
        
        const username = userId.split('@')[0];
        
        if (cleanGuess === game.word) {
            // Correct answer - end game immediately
            await this.endWordGuessGame(sock, groupId, game.id, userId);
        } else {
            // Wrong answer - give feedback
            const similarity = this.calculateSimilarity(cleanGuess, game.word);
            let feedback = '';
            
            if (similarity > 0.7) {
                feedback = 'Sangat dekat! 🔥';
            } else if (similarity > 0.5) {
                feedback = 'Lumayan dekat! 👍';
            } else if (similarity > 0.3) {
                feedback = 'Masih jauh... 🤔';
            } else {
                feedback = 'Salah total! 😅';
            }
            
            await sock.sendMessage(groupId, {
                text: `❌ @${username}: "${cleanGuess}" - ${feedback}`,
                mentions: [userId]
            });
        }
    }

    // End word guess game
    async endWordGuessGame(sock, groupId, gameId, winnerId = null) {
        const game = this.activeGames.get(groupId);
        if (!game || game.id !== gameId) return;
        
        game.isActive = false;
        
        let resultText = `🏁 *TEBAK KATA SELESAI*\n\n` +
                        `💡 *Hint:* ${game.hint}\n` +
                        `✅ *Jawaban:* ${game.word}\n\n`;
        
        if (winnerId) {
            const winner = game.participants[winnerId];
            const responseTime = moment(winner.guessedAt).diff(moment(game.startedAt), 'seconds');
            
            resultText += `🏆 *PEMENANG:* @${winnerId.split('@')[0]}\n` +
                         `⏱️ *Waktu:* ${responseTime} detik\n\n`;
            
            // Update leaderboard
            await this.updateGameLeaderboard(groupId, winnerId, 'wordguess', 15);
        } else {
            resultText += `😔 *Tidak ada yang berhasil menebak*\n\n`;
        }
        
        // Show all participants
        const participants = Object.keys(game.participants);
        if (participants.length > 0) {
            resultText += `👥 *Peserta yang mencoba:*\n`;
            participants.forEach(userId => {
                const participant = game.participants[userId];
                const status = participant.isCorrect ? '✅' : '❌';
                resultText += `${status} @${userId.split('@')[0]}: "${participant.guess}"\n`;
            });
        }
        
        const mentions = winnerId ? [winnerId, ...participants] : participants;
        
        await sock.sendMessage(groupId, {
            text: resultText,
            mentions: mentions
        });
        
        this.activeGames.delete(groupId);
    }

    // Calculate word similarity
    calculateSimilarity(word1, word2) {
        const longer = word1.length > word2.length ? word1 : word2;
        const shorter = word1.length > word2.length ? word2 : word1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    // Calculate Levenshtein distance
    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    // Update game leaderboard
    async updateGameLeaderboard(groupId, userId, gameType, points) {
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                if (!group.entertainment.games.leaderboard[userId]) {
                    group.entertainment.games.leaderboard[userId] = {
                        totalPoints: 0,
                        gamesWon: 0,
                        gameStats: {}
                    };
                }
                
                const userStats = group.entertainment.games.leaderboard[userId];
                userStats.totalPoints += points;
                userStats.gamesWon += 1;
                
                if (!userStats.gameStats[gameType]) {
                    userStats.gameStats[gameType] = {
                        wins: 0,
                        points: 0
                    };
                }
                
                userStats.gameStats[gameType].wins += 1;
                userStats.gameStats[gameType].points += points;
                
                await this.groupManager.updateGroup(groupId, group);
            }
        } catch (error) {
            console.error('Error updating leaderboard:', error);
        }
    }

    // Show game leaderboard
    async handleLeaderboard(sock, msg) {
        const groupId = msg.key.remoteJid;
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                const leaderboard = group.entertainment.games.leaderboard;
                const sortedUsers = Object.entries(leaderboard)
                    .sort(([,a], [,b]) => b.totalPoints - a.totalPoints)
                    .slice(0, 10); // Top 10
                
                if (sortedUsers.length === 0) {
                    return await sock.sendMessage(groupId, {
                        text: '🏆 *LEADERBOARD GAMES*\n\nBelum ada data permainan.\n\nMainkan trivia atau tebak kata untuk masuk leaderboard!'
                    });
                }
                
                let leaderboardText = `🏆 *LEADERBOARD GAMES*\n\n`;
                
                sortedUsers.forEach(([userId, stats], index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                    leaderboardText += `${medal} @${userId.split('@')[0]}\n`;
                    leaderboardText += `   💎 Poin: ${stats.totalPoints}\n`;
                    leaderboardText += `   🏅 Menang: ${stats.gamesWon} kali\n\n`;
                });
                
                const mentions = sortedUsers.map(([userId]) => userId);
                
                await sock.sendMessage(groupId, {
                    text: leaderboardText,
                    mentions: mentions
                });
            }
        } catch (error) {
            console.error('Error showing leaderboard:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat menampilkan leaderboard.'
            });
        }
    }

    // Random joke
    async handleJoke(sock, msg) {
        const groupId = msg.key.remoteJid;
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (!group || !group.entertainment.jokes.enabled) {
                return await sock.sendMessage(groupId, {
                    text: '❌ Fitur joke tidak diaktifkan di grup ini.'
                });
            }

            // Combine default jokes with custom jokes
            const allJokes = [...this.jokes, ...group.entertainment.jokes.custom];
            const randomJoke = allJokes[Math.floor(Math.random() * allJokes.length)];
            
            await sock.sendMessage(groupId, {
                text: `😂 *JOKE OF THE DAY*\n\n${randomJoke}`
            });
        } catch (error) {
            console.error('Error sending joke:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat mengirim joke.'
            });
        }
    }

    // Random quote
    async handleQuote(sock, msg) {
        const groupId = msg.key.remoteJid;
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                // Combine default quotes with custom quotes
                const allQuotes = [...this.quotes, ...group.entertainment.quotes.custom];
                const randomQuote = allQuotes[Math.floor(Math.random() * allQuotes.length)];
                
                await sock.sendMessage(groupId, {
                    text: `💭 *QUOTE OF THE DAY*\n\n"${randomQuote}"`
                });
            }
        } catch (error) {
            console.error('Error sending quote:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat mengirim quote.'
            });
        }
    }

    // Add custom joke
    async handleAddJoke(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat menambah joke custom.'
            });
        }

        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format: `.addjoke [joke]`\n\nContoh: `.addjoke Kenapa ayam menyeberang jalan? Karena mau ke seberang!`'
            });
        }

        try {
            const joke = args.join(' ');
            const group = this.groupManager.getGroup(groupId);
            
            if (group) {
                group.entertainment.jokes.custom.push(joke);
                await this.groupManager.updateGroup(groupId, group);
                
                await sock.sendMessage(groupId, {
                    text: `✅ *Joke berhasil ditambahkan!*\n\n😂 "${joke}"\n\n👤 *Ditambahkan oleh:* @${senderId.split('@')[0]}`,
                    mentions: [senderId]
                });
            }
        } catch (error) {
            console.error('Error adding joke:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat menambah joke.'
            });
        }
    }

    // Add custom quote
    async handleAddQuote(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat menambah quote custom.'
            });
        }

        if (args.length < 1) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format: `.addquote [quote]`\n\nContoh: `.addquote Hidup itu indah jika kita tahu cara menikmatinya - Anonymous`'
            });
        }

        try {
            const quote = args.join(' ');
            const group = this.groupManager.getGroup(groupId);
            
            if (group) {
                group.entertainment.quotes.custom.push(quote);
                await this.groupManager.updateGroup(groupId, group);
                
                await sock.sendMessage(groupId, {
                    text: `✅ *Quote berhasil ditambahkan!*\n\n💭 "${quote}"\n\n👤 *Ditambahkan oleh:* @${senderId.split('@')[0]}`,
                    mentions: [senderId]
                });
            }
        } catch (error) {
            console.error('Error adding quote:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat menambah quote.'
            });
        }
    }

    // Configure games
    async handleConfigGames(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat mengkonfigurasi games.'
            });
        }

        if (args.length < 2) {
            return await sock.sendMessage(groupId, {
                text: '❌ Format:\n' +
                      '• `.games trivia on/off` - Aktifkan/matikan trivia\n' +
                      '• `.games wordguess on/off` - Aktifkan/matikan tebak kata\n' +
                      '• `.games quiz on/off` - Aktifkan/matikan quiz\n' +
                      '• `.games status` - Lihat status games'
            });
        }

        const [gameType, status] = args;
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                if (status.toLowerCase() === 'status') {
                    const settings = group.entertainment.games.settings;
                    const statusText = `🎮 *STATUS GAMES*\n\n` +
                                     `🧠 Trivia: ${settings.triviaEnabled ? '✅ Aktif' : '❌ Nonaktif'}\n` +
                                     `🔤 Tebak Kata: ${settings.wordGuessEnabled ? '✅ Aktif' : '❌ Nonaktif'}\n` +
                                     `📝 Quiz: ${settings.quizEnabled ? '✅ Aktif' : '❌ Nonaktif'}`;
                    
                    return await sock.sendMessage(groupId, {
                        text: statusText
                    });
                }
                
                const isEnabled = status.toLowerCase() === 'on';
                
                switch (gameType.toLowerCase()) {
                    case 'trivia':
                        group.entertainment.games.settings.triviaEnabled = isEnabled;
                        break;
                    case 'wordguess':
                        group.entertainment.games.settings.wordGuessEnabled = isEnabled;
                        break;
                    case 'quiz':
                        group.entertainment.games.settings.quizEnabled = isEnabled;
                        break;
                    default:
                        return await sock.sendMessage(groupId, {
                            text: '❌ Tipe game tidak valid. Gunakan: trivia, wordguess, quiz'
                        });
                }
                
                await this.groupManager.updateGroup(groupId, group);
                
                await sock.sendMessage(groupId, {
                    text: `✅ *Game ${gameType} ${isEnabled ? 'diaktifkan' : 'dimatikan'}*\n\n👤 *Oleh:* @${senderId.split('@')[0]}`,
                    mentions: [senderId]
                });
            }
        } catch (error) {
            console.error('Error configuring games:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat mengkonfigurasi games.'
            });
        }
    }

    // Process game messages
    async processGameMessage(sock, msg) {
        try {
            const groupId = msg.key.remoteJid;
            const userId = msg.key.participant || msg.key.remoteJid;
            const messageText = msg.message?.conversation || 
                               msg.message?.extendedTextMessage?.text || '';
            
            // Skip if not a group message
            if (!groupId.endsWith('@g.us')) return;
            
            const game = this.activeGames.get(groupId);
            if (!game || !game.isActive) return;
            
            if (game.type === 'trivia') {
                // Check if message is a single letter (A, B, C, D)
                if (/^[ABCD]$/i.test(messageText.trim())) {
                    await this.handleTriviaAnswer(sock, groupId, userId, messageText.trim());
                }
            } else if (game.type === 'wordguess') {
                // Check if message could be a word guess
                if (/^[A-Za-z]+$/.test(messageText.trim()) && messageText.trim().length > 2) {
                    await this.handleWordGuessAnswer(sock, groupId, userId, messageText.trim());
                }
            }
        } catch (error) {
            console.error('Error processing game message:', error);
        }
    }

    // Stop active game
    async handleStopGame(sock, msg) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat menghentikan game.'
            });
        }

        const game = this.activeGames.get(groupId);
        if (!game || !game.isActive) {
            return await sock.sendMessage(groupId, {
                text: '❌ Tidak ada game yang sedang berlangsung.'
            });
        }

        game.isActive = false;
        this.activeGames.delete(groupId);
        
        await sock.sendMessage(groupId, {
            text: `🛑 *Game dihentikan*\n\n🎮 *Tipe:* ${game.type}\n👤 *Dihentikan oleh:* @${senderId.split('@')[0]}`,
            mentions: [senderId]
        });
    }
}

module.exports = GroupEntertainmentCommands;