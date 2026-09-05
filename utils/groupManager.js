const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

class GroupManager {
    constructor() {
        this.dbPath = path.join(__dirname, '../database/groups_advanced.json');
        this.data = null;
        this.loadDatabase();
    }

    async loadDatabase() {
        try {
            if (await fs.pathExists(this.dbPath)) {
                this.data = await fs.readJson(this.dbPath);
            } else {
                // Create default database structure
                this.data = {
                    groups: {},
                    templates: {
                        defaultGroupSettings: {
                            basic: {
                                language: 'id',
                                timezone: 'Asia/Jakarta',
                                prefix: '.',
                                description: '',
                                createdAt: null
                            },
                            moderation: {
                                admins: [],
                                moderators: [],
                                bannedUsers: {},
                                mutedUsers: {},
                                warnings: {},
                                antiSpam: {
                                    enabled: false,
                                    maxMessages: 5,
                                    timeWindow: 60,
                                    action: 'warn'
                                },
                                wordFilter: {
                                    enabled: false,
                                    blacklist: [],
                                    action: 'delete'
                                },
                                autoDelete: {
                                    enabled: false,
                                    types: [],
                                    delay: 300
                                },
                                linkControl: {
                                    enabled: false,
                                    whitelist: [],
                                    action: 'delete'
                                },
                                logs: []
                            },
                            features: {
                                welcome: {
                                    enabled: false,
                                    message: 'Selamat datang {user} di grup {group}! 👋',
                                    media: null,
                                    autoRole: null
                                },
                                goodbye: {
                                    enabled: false,
                                    message: 'Selamat tinggal {user}! 👋'
                                },
                                rules: {
                                    content: '',
                                    lastUpdated: null,
                                    updatedBy: null
                                },
                                polls: {
                                    active: {},
                                    history: []
                                },
                                reminders: {},
                                todoList: {
                                    tasks: {}
                                },
                                events: {}
                            },
                            entertainment: {
                                games: {
                                    active: {},
                                    leaderboard: {},
                                    settings: {
                                        triviaEnabled: true,
                                        wordGuessEnabled: true,
                                        quizEnabled: true
                                    }
                                },
                                quotes: {
                                    daily: '',
                                    custom: [],
                                    lastUpdated: null
                                },
                                jokes: {
                                    enabled: true,
                                    custom: []
                                },
                                achievements: {},
                                celebrations: {
                                    birthdays: {},
                                    anniversaries: {}
                                },
                                music: {
                                    enabled: false,
                                    queue: []
                                }
                            },
                            analytics: {
                                messageCount: 0,
                                commandCount: 0,
                                activeUsers: {},
                                dailyStats: {},
                                weeklyStats: {},
                                monthlyStats: {}
                            }
                        }
                    },
                    globalSettings: {
                        version: '1.0.0',
                        lastBackup: null,
                        totalGroups: 0,
                        totalUsers: 0
                    }
                };
                await this.saveDatabase();
            }
        } catch (error) {
            console.error('Error loading group database:', error);
            throw error;
        }
    }

    async saveDatabase() {
        try {
            await fs.writeJson(this.dbPath, this.data, { spaces: 2 });
        } catch (error) {
            console.error('Error saving group database:', error);
            throw error;
        }
    }

    // Group Management
    async initializeGroup(groupId, groupName, createdBy) {
        if (!this.data.groups[groupId]) {
            const template = JSON.parse(JSON.stringify(this.data.templates.defaultGroupSettings));
            template.basic.createdAt = moment().toISOString();
            template.basic.name = groupName;
            template.moderation.admins = [createdBy];
            
            this.data.groups[groupId] = template;
            this.data.globalSettings.totalGroups++;
            
            await this.saveDatabase();
            return true;
        }
        return false;
    }

    getGroup(groupId) {
        return this.data.groups[groupId] || null;
    }

    async updateGroup(groupId, updates) {
        if (this.data.groups[groupId]) {
            // Deep merge updates
            this.data.groups[groupId] = this.deepMerge(this.data.groups[groupId], updates);
            await this.saveDatabase();
            return true;
        }
        return false;
    }

    // User Management
    async addUser(groupId, userId) {
        const group = this.getGroup(groupId);
        if (group) {
            if (!group.analytics.activeUsers[userId]) {
                group.analytics.activeUsers[userId] = {
                    messageCount: 0,
                    lastActive: moment().toISOString(),
                    joinedAt: moment().toISOString()
                };
                await this.saveDatabase();
            }
            return true;
        }
        return false;
    }

    async updateUserActivity(groupId, userId) {
        const group = this.getGroup(groupId);
        if (group && group.analytics.activeUsers[userId]) {
            group.analytics.activeUsers[userId].messageCount++;
            group.analytics.activeUsers[userId].lastActive = moment().toISOString();
            group.analytics.messageCount++;
            
            // Update daily stats
            const today = moment().format('YYYY-MM-DD');
            if (!group.analytics.dailyStats[today]) {
                group.analytics.dailyStats[today] = {
                    messages: 0,
                    commands: 0,
                    activeUsers: new Set()
                };
            }
            group.analytics.dailyStats[today].messages++;
            group.analytics.dailyStats[today].activeUsers.add(userId);
            
            await this.saveDatabase();
            return true;
        }
        return false;
    }

    // Moderation Functions
    async banUser(groupId, userId, reason, bannedBy, duration = null) {
        const group = this.getGroup(groupId);
        if (group) {
            const expiresAt = duration ? moment().add(duration, 'minutes').toISOString() : null;
            
            group.moderation.bannedUsers[userId] = {
                reason: reason || 'No reason provided',
                bannedAt: moment().toISOString(),
                bannedBy: bannedBy,
                expiresAt: expiresAt
            };
            
            // Add to logs
            group.moderation.logs.push({
                action: 'ban',
                target: userId,
                moderator: bannedBy,
                reason: reason,
                timestamp: moment().toISOString(),
                duration: duration
            });
            
            await this.saveDatabase();
            return true;
        }
        return false;
    }

    async unbanUser(groupId, userId, unbannedBy) {
        const group = this.getGroup(groupId);
        if (group && group.moderation.bannedUsers[userId]) {
            delete group.moderation.bannedUsers[userId];
            
            // Add to logs
            group.moderation.logs.push({
                action: 'unban',
                target: userId,
                moderator: unbannedBy,
                timestamp: moment().toISOString()
            });
            
            await this.saveDatabase();
            return true;
        }
        return false;
    }

    async muteUser(groupId, userId, reason, mutedBy, duration = null) {
        const group = this.getGroup(groupId);
        if (group) {
            const expiresAt = duration ? moment().add(duration, 'minutes').toISOString() : null;
            
            group.moderation.mutedUsers[userId] = {
                reason: reason || 'No reason provided',
                mutedAt: moment().toISOString(),
                mutedBy: mutedBy,
                expiresAt: expiresAt
            };
            
            // Add to logs
            group.moderation.logs.push({
                action: 'mute',
                target: userId,
                moderator: mutedBy,
                reason: reason,
                timestamp: moment().toISOString(),
                duration: duration
            });
            
            await this.saveDatabase();
            return true;
        }
        return false;
    }

    async unmuteUser(groupId, userId, unmutedBy) {
        const group = this.getGroup(groupId);
        if (group && group.moderation.mutedUsers[userId]) {
            delete group.moderation.mutedUsers[userId];
            
            // Add to logs
            group.moderation.logs.push({
                action: 'unmute',
                target: userId,
                moderator: unmutedBy,
                timestamp: moment().toISOString()
            });
            
            await this.saveDatabase();
            return true;
        }
        return false;
    }

    async warnUser(groupId, userId, reason, warnedBy) {
        const group = this.getGroup(groupId);
        if (group) {
            if (!group.moderation.warnings[userId]) {
                group.moderation.warnings[userId] = {
                    count: 0,
                    history: []
                };
            }
            
            group.moderation.warnings[userId].count++;
            group.moderation.warnings[userId].history.push({
                reason: reason || 'No reason provided',
                warnedAt: moment().toISOString(),
                warnedBy: warnedBy
            });
            
            // Add to logs
            group.moderation.logs.push({
                action: 'warn',
                target: userId,
                moderator: warnedBy,
                reason: reason,
                timestamp: moment().toISOString()
            });
            
            await this.saveDatabase();
            return group.moderation.warnings[userId].count;
        }
        return 0;
    }

    // Permission Checks
    isAdmin(groupId, userId) {
        // Check global admin numbers from JSON settings
        const { getAdminNumbers, normalizeSenderToPhone } = require('./helpers');
        const adminNumbers = getAdminNumbers();

        // Normalize incoming user identifier (handles @s.whatsapp.net, @lid, leading 0 -> 62, and mappings)
        const normalizedUser = normalizeSenderToPhone(String(userId || ''));
        if (!normalizedUser) return false;

        // Check global admins first
        if (adminNumbers.includes(normalizedUser)) {
            return true;
        }
        
        // Check group-specific admins (normalize stored identifiers too)
        const group = this.getGroup(groupId);
        if (group) {
            const groupAdmins = (group.moderation.admins || []).map(a => normalizeSenderToPhone(String(a || '')));
            return groupAdmins.includes(normalizedUser);
        }
        return false;
    }

    isModerator(groupId, userId) {
        const group = this.getGroup(groupId);
        return group ? (group.moderation.moderators.includes(userId) || group.moderation.admins.includes(userId)) : false;
    }

    isBanned(groupId, userId) {
        const group = this.getGroup(groupId);
        if (group && group.moderation.bannedUsers[userId]) {
            const ban = group.moderation.bannedUsers[userId];
            if (ban.expiresAt && moment().isAfter(ban.expiresAt)) {
                // Ban expired, remove it
                delete group.moderation.bannedUsers[userId];
                this.saveDatabase();
                return false;
            }
            return true;
        }
        return false;
    }

    isMuted(groupId, userId) {
        const group = this.getGroup(groupId);
        if (group && group.moderation.mutedUsers[userId]) {
            const mute = group.moderation.mutedUsers[userId];
            if (mute.expiresAt && moment().isAfter(mute.expiresAt)) {
                // Mute expired, remove it
                delete group.moderation.mutedUsers[userId];
                this.saveDatabase();
                return false;
            }
            return true;
        }
        return false;
    }

    // Utility Functions
    deepMerge(target, source) {
        const output = Object.assign({}, target);
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target))
                        Object.assign(output, { [key]: source[key] });
                    else
                        output[key] = this.deepMerge(target[key], source[key]);
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }

    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    // Backup Functions
    async createBackup() {
        const backupPath = path.join(__dirname, '../database/backups');
        await fs.ensureDir(backupPath);
        
        const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
        const backupFile = path.join(backupPath, `groups_advanced.backup.${timestamp}`);
        
        await fs.copy(this.dbPath, backupFile);
        this.data.globalSettings.lastBackup = moment().toISOString();
        await this.saveDatabase();
        
        return backupFile;
    }
}

module.exports = GroupManager;