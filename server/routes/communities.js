const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const Community = require('../models/Community');
const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');

const JWT_SECRET = process.env.JWT_SECRET;
const { handleMembershipJoin, handleMembershipExit } = require('../utils/membership');
const { applyNameOverrides } = require('../utils/nameOverrides');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

const toObjectId = (id) => {
    try {
        return new mongoose.Types.ObjectId(id);
    } catch {
        return null;
    }
};

// GET /api/communities/my-communities - communities visible for current user
router.get('/my-communities', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const userObjId = toObjectId(userId);
        if (!userObjId) return res.status(400).json({ error: 'Invalid user id' });

        const communities = await Community.find({
            $or: [{ creator: userObjId }, { members: userObjId }, { removedMembers: userObjId }]
        })
            .populate('creator', 'name mobile countryCode _id __enc_name __enc_mobile')
            .populate('members', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate('admins', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate({
                path: 'announcements',
                select: 'name icon _id members admin admins removedMembers isAnnouncementGroup userHistory',
                populate: {
                    path: 'members',
                    select: 'name about mobile image __enc_name __enc_about __enc_mobile _id'
                }
            })
            .populate({
                path: 'groups',
                select: 'name icon _id members admin admins removedMembers community_id userHistory',
                populate: {
                    path: 'members',
                    select: 'name about mobile image __enc_name __enc_about __enc_mobile _id'
                }
            })
            .sort({ created_at: -1 })
            .then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

        const enriched = await Promise.all((communities || []).map(async (c) => {
            // Apply overrides to community metadata
            if (c.creator) await applyNameOverrides(c.creator, userId);
            if (c.members) await applyNameOverrides(c.members, userId);
            if (c.admins) await applyNameOverrides(c.admins, userId);
            if (c.announcements && c.announcements.members) await applyNameOverrides(c.announcements.members, userId);
            if (c.groups) {
                for (const g of c.groups) {
                    if (g.members) await applyNameOverrides(g.members, userId);
                }
            }

            let lastMsg = null;
            let unreadCount = 0;

            // Check if the current user is a member/admin/creator of this community
            const isCommMember = (c.members || []).some(m => String(m._id || m) === String(userId));
            const isCommAdmin = (c.admins || []).some(a => String(a?._id || a) === String(userId));
            const isCommCreator = String(c.creator?._id || c.creator) === String(userId);
            const isStillInComm = isCommMember || isCommAdmin || isCommCreator;

            if (c.announcements?._id && isStillInComm) {
                lastMsg = await GroupMessage.findOne({ group_id: c.announcements._id })
                    .sort({ created_at: -1 })
                    .populate('sender_id', 'name _id __enc_name')
                    .then(r => r ? (typeof r.toObject === 'function' ? r.toObject() : r) : null);

                // Find user's visibleFrom for this group
                const history = (c.userHistory || []).find(h => String(h.user) === String(userId));
                const visibleFrom = history?.visibleFrom || new Date(0);

                // Calculate unread count for current user in the announcements group
                unreadCount = await GroupMessage.countDocuments({
                    group_id: c.announcements._id,
                    sender_id: { $ne: userObjId },
                    read_by: { $ne: userObjId },
                    is_system: { $ne: true },
                    created_at: { $gte: visibleFrom }
                });
            }

            // Enrich individual groups
            const enrichedGroups = await Promise.all((c.groups || []).map(async (g) => {
                // Check if the current user is a member/admin/creator of this group
                const isMember = (g.members || []).some(m => String(m._id || m) === String(userId));
                const isAdmin = (g.admins || []).some(a => String(a?._id || a) === String(userId));
                const isCreatorMatch = String(g.admin?._id || g.admin) === String(userId);
                
                // A user is only active if they are in the members array.
                // Admins/Creators who left the group should not see unread counts.
                const isJoined = isMember || isAdmin || (isCreatorMatch && isMember);

                // If not a joined member, don't show unread counts or last messages
                if (!isJoined) {
                    return {
                        ...g,
                        lastMessage: null,
                        unreadCount: 0
                    };
                }

                const history = (g.userHistory || []).find(h => String(h.user) === String(userId));
                const visibleFrom = history?.visibleFrom || new Date(0);
                
                const lastMsg = await GroupMessage.findOne({
                    group_id: g._id,
                    deleted_for: { $ne: userId }
                })
                    .sort({ created_at: -1 })
                    .populate('sender_id', 'name __enc_name')
                    .then(r => r ? (typeof r.toObject === 'function' ? r.toObject() : r) : null);

                const gUnreadCount = await GroupMessage.countDocuments({
                    group_id: g._id,
                    sender_id: { $ne: userObjId },
                    read_by: { $ne: userObjId },
                    is_system: { $ne: true },
                    created_at: { $gte: visibleFrom }
                });

                return {
                    ...g,
                    lastMessage: lastMsg,
                    unreadCount: gUnreadCount
                };
            }));

            return {
                ...c,
                id: c._id,
                is_community: true,
                unreadCount,
                groups: enrichedGroups,
                announcements: c.announcements ? { ...c.announcements, lastMessage: lastMsg } : c.announcements
            };
        }));

        res.json(enriched);
    } catch (err) {
        console.error('[MY COMMUNITIES ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/communities/create - create community + announcements group
router.post('/create', authenticateToken, async (req, res) => {
    try {
        const { name, description, icon } = req.body || {};
        const creatorId = req.user.id;
        const creatorObjId = toObjectId(creatorId);
        if (!creatorObjId) return res.status(400).json({ error: 'Invalid creator id' });
        if (!name || !String(name).trim()) return res.status(400).json({ error: 'Community name is required' });

        const announcementsGroup = await Group.create({
            name: 'Announcements',
            icon: null,
            members: [creatorObjId],
            admin: creatorObjId,
            permissions: { editSettings: true, sendMessages: true, addMembers: true },
            isAnnouncementGroup: true
        });

        await GroupMessage.create({
            group_id: announcementsGroup._id,
            sender_id: creatorObjId,
            type: 'system',
            is_system: true,
            content: 'Welcome to your community!'
        });

        const community = new Community({
            name: String(name).trim(),
            description: description || '',
            icon: icon || null,
            creator: creatorObjId,
            members: [creatorObjId],
            admins: [creatorObjId],
            announcements: announcementsGroup._id,
            groups: []
        });

        handleMembershipJoin(community, creatorObjId);
        await community.save();

        // Also add creator to announcement group history properly
        handleMembershipJoin(announcementsGroup, creatorObjId);
        await announcementsGroup.save();

        const populated = await Community.findById(community._id)
            .populate('creator', 'name mobile countryCode _id __enc_name __enc_mobile')
            .populate('members', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate('admins', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate('announcements', 'name icon _id members admin removedMembers')
            .then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

        const lastMsg = await GroupMessage.findOne({ group_id: announcementsGroup._id })
            .sort({ created_at: -1 })
            .populate('sender_id', 'name _id __enc_name')
            .then(r => r ? (typeof r.toObject === 'function' ? r.toObject() : r) : null);

        res.json({
            status: 'created',
            community: {
                ...populated,
                id: populated._id,
                is_community: true,
                announcements: populated.announcements ? { ...populated.announcements, lastMessage: lastMsg } : populated.announcements
            }
        });
    } catch (err) {
        console.error('[COMMUNITY CREATE ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/communities/:communityId/members - add members (persists for all users)
router.patch('/:communityId/members', authenticateToken, async (req, res) => {
    try {
        const { communityId } = req.params;
        const { memberIds } = req.body || {};
        if (!Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({ error: 'memberIds is required' });
        }

        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ error: 'Community not found' });

        const idsToAdd = memberIds.map(toObjectId).filter(Boolean);
        if (idsToAdd.length === 0) return res.status(400).json({ error: 'No valid memberIds' });

        // Only creator or admins can add members
        const isCommAdmin = (community.admins || []).some(id => String(id) === String(req.user.id));
        if (community.creator.toString() !== req.user.id.toString() && !isCommAdmin) {
            return res.status(403).json({ error: 'Only community owner and admins can add members' });
        }

        if (!community) return res.status(404).json({ error: 'Community not found' });

        // Update Community
        handleMembershipJoin(community, idsToAdd);
        await community.save();

        if (community.announcements) {
            const annGroup = await Group.findById(community.announcements);
            if (annGroup) {
                handleMembershipJoin(annGroup, idsToAdd);
                await annGroup.save();
            }

            // Log announcement
            const User = require('../models/User');
            const adminUser = await User.findById(req.user.id);
            const addedUsers = await User.find({ _id: { $in: idsToAdd } }).select('name __enc_name');
            
            if (adminUser && adminUser.decryptFieldsSync) adminUser.decryptFieldsSync();
            addedUsers.forEach(u => u.decryptFieldsSync && u.decryptFieldsSync());

            const names = addedUsers.map(u => u.name);
            const adminName = adminUser ? adminUser.name : 'Admin';
            
            let content = '';
            if (names.length === 1) content = `${adminName} added ${names[0]}`;
            else if (names.length === 2) content = `${adminName} added ${names[0]} & ${names[1]}`;
            else {
                const last = names.pop();
                content = `${adminName} added ${names.join(', ')} & ${last}`;
            }

            const newSysMsg = await GroupMessage.create({
                group_id: community.announcements,
                sender_id: req.user.id,
                type: 'system',
                is_system: true,
                content
            });

            // Re-fetch for live emission
            const sysMsg = await GroupMessage.findById(newSysMsg._id)
                .populate('sender_id', 'name _id __enc_name');
            if (sysMsg && sysMsg.decryptFieldsSync) sysMsg.decryptFieldsSync();

            if (req.io) {
                // Emit to members so it shows up in their chat real-time
                const group = await Group.findById(community.announcements);
                const toNotify = group.members || [];
                toNotify.forEach(uid => {
                    req.io.to(String(uid)).emit('group_message', {
                        groupId: community.announcements.toString(),
                        message: sysMsg
                    });
                });
            }
        }

        const updated = await Community.findById(communityId)
            .populate('creator', 'name mobile countryCode _id __enc_name __enc_mobile')
            .populate('members', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate('admins', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate({
                path: 'announcements',
                select: 'name icon _id members admin admins removedMembers isAnnouncementGroup',
                populate: {
                    path: 'members',
                    select: 'name about mobile image __enc_name __enc_about __enc_mobile'
                }
            })
            .populate({
                path: 'groups',
                select: 'name icon _id members admin admins removedMembers',
                populate: {
                    path: 'members',
                    select: 'name about mobile image __enc_name __enc_about __enc_mobile'
                }
            })
            .then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

        let lastMsg = null;
        if (updated.announcements?._id) {
            lastMsg = await GroupMessage.findOne({ group_id: updated.announcements._id })
                .sort({ created_at: -1 })
                .populate('sender_id', 'name _id __enc_name')
                .then(r => r ? (typeof r.toObject === 'function' ? r.toObject() : r) : null);
        }

        // Notify all members that they have been added to the community
        if (req.io) {
            const communityData = {
                ...updated,
                id: updated._id,
                is_community: true,
                announcements: updated.announcements ? { ...updated.announcements, lastMessage: lastMsg } : updated.announcements
            };

            // Notify added members
            idsToAdd.forEach(id => {
                req.io.to(String(id)).emit('community_member_added', {
                    community: communityData
                });
            });

            // Notify everyone else in the community to refresh their member list
            const allMembers = [
                updated.creator?._id || updated.creator, 
                ...(updated.members || []).map(m => m._id || m)
            ];
            allMembers.forEach(uid => {
                req.io.to(uid.toString()).emit('community_updated', {
                    community: communityData
                });
            });
        }

        res.json({
            status: 'updated',
            community: {
                ...updated,
                id: updated._id,
                is_community: true,
                announcements: updated.announcements ? { ...updated.announcements, lastMessage: lastMsg } : updated.announcements
            }
        });
    } catch (err) {
        console.error('[COMMUNITY ADD MEMBERS ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/communities/:communityId/members/:memberId - remove member (move to removedMembers)
router.delete('/:communityId/members/:memberId', authenticateToken, async (req, res) => {
    try {
        const { communityId, memberId } = req.params;
        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ error: 'Community not found' });

        // Only creator or admins can remove members
        const isCommAdmin = (community.admins || []).some(id => String(id) === String(req.user.id));
        if (String(community.creator) !== String(req.user.id) && !isCommAdmin) {
            return res.status(403).json({ error: 'Only community owner and admins can remove members' });
        }

        const memberObjId = toObjectId(memberId);
        if (!memberObjId) return res.status(400).json({ error: 'Invalid memberId' });

        // 1. Move member to removedMembers in Community and CLEAN UP ADMINS
        const comm = await Community.findById(communityId);
        if (comm) {
            handleMembershipExit(comm, memberObjId);
            await comm.save();
        }

            // 2. Add system message to announcements
            if (community.announcements) {
                // ... (system message logic continues below)
                const User = require('../models/User');
                const adminUser = await User.findById(req.user.id);
                const targetUser = await User.findById(memberId);
                
                // Force decryption to avoid hashing in logs
                if (adminUser && adminUser.decryptFieldsSync) adminUser.decryptFieldsSync();
                if (targetUser && targetUser.decryptFieldsSync) targetUser.decryptFieldsSync();

                const userName = targetUser ? targetUser.name : 'User';
                const adminName = adminUser ? adminUser.name : 'Admin';

                const newSysMsg = await GroupMessage.create({
                    group_id: community.announcements,
                    sender_id: req.user.id,
                    type: 'system',
                    is_system: true,
                    content: `${adminName} removed ${userName}`
                });

                // Re-fetch with population and decryption for socket emission
                const sysMsg = await GroupMessage.findById(newSysMsg._id)
                    .populate('sender_id', 'name _id __enc_name');
                if (sysMsg && sysMsg.decryptFieldsSync) sysMsg.decryptFieldsSync();

                // Handle Announcements Group (removal)
                const annGroup = await Group.findById(community.announcements);
                if (annGroup) {
                    handleMembershipExit(annGroup, memberObjId);
                    await annGroup.save();
                }

                // Notify everyone in the group including the removed user (so they see the system msg)
                if (req.io) {
                    const allToNotify = [...(annGroup.members || []), memberObjId];
                    allToNotify.forEach(uid => {
                        req.io.to(String(uid)).emit('group_message', {
                            groupId: community.announcements.toString(),
                            message: sysMsg
                        });
                    });

                // Also emit a specific removal event to trigger UI refresh for the removed user
                req.io.to(memberId).emit('community_member_removed', {
                    communityId,
                    memberId,
                    message: `You were removed from ${community.name}`
                });

                // Notify remaining members to refresh their list
                const remainingMembers = [
                    community.creator, 
                    ...(community.members || [])
                ];
                remainingMembers.forEach(uid => {
                    req.io.to(uid.toString()).emit('community_updated', {
                        communityId
                    });
                });
            }
        }

        res.json({ status: 'removed', memberId });
    } catch (err) {
        console.error('[COMMUNITY REMOVE MEMBER ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/communities/:communityId/groups - add groups to community
router.patch('/:communityId/groups', authenticateToken, async (req, res) => {
    try {
        const { communityId } = req.params;
        const { groupIds } = req.body || {};
        if (!Array.isArray(groupIds) || groupIds.length === 0) {
            return res.status(400).json({ error: 'groupIds is required' });
        }

        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ error: 'Community not found' });

        const isCommAdmin = (community.admins || []).some(id => String(id) === String(req.user.id));
        if (String(community.creator) !== String(req.user.id) && !isCommAdmin) {
            return res.status(403).json({ error: 'Only community owner and admins can add groups' });
        }

        const idsToAdd = groupIds.map(toObjectId).filter(Boolean);
        if (idsToAdd.length === 0) return res.status(400).json({ error: 'No valid groupIds' });

        // 1. Collect all members from the added groups
        const groupsData = await Group.find({ _id: { $in: idsToAdd } }).select('members admin admins');
        let allNewMemberIdsStr = new Set();
        groupsData.forEach(g => {
            if (g.members) g.members.forEach(m => allNewMemberIdsStr.add(m.toString()));
            if (g.admin) allNewMemberIdsStr.add(g.admin.toString());
            if (g.admins) g.admins.forEach(a => allNewMemberIdsStr.add(a.toString()));
        });
        const membersToAddToCommunityStr = Array.from(allNewMemberIdsStr);
        const membersToAddToCommunityObj = membersToAddToCommunityStr.map(id => toObjectId(id)).filter(Boolean);

        // 2. Add groups and members to the community
        const comm = await Community.findById(communityId);
        if (comm) {
            // Add groups
            idsToAdd.forEach(gId => {
                if (!comm.groups.some(existing => existing.toString() === gId.toString())) {
                    comm.groups.push(gId);
                }
            });
            // Add members with history
            handleMembershipJoin(comm, membersToAddToCommunityObj);
            await comm.save();
        }

        // 3. Add members to the announcements group
        if (community.announcements) {
            const annGroup = await Group.findById(community.announcements);
            if (annGroup) {
                handleMembershipJoin(annGroup, membersToAddToCommunityObj);
                await annGroup.save();
            }

            for (const gId of idsToAdd) {
                const group = await Group.findById(gId);
                if (group) {
                    // Log in Announcements Group
                    const annMsg = await GroupMessage.create({
                        group_id: community.announcements,
                        sender_id: req.user.id,
                        type: 'community_link',
                        is_system: true,
                        content: `Group "${group.name}" was added`,
                        metadata: {
                            kind: 'community_group_update',
                            action: 'added',
                            communityId: community._id,
                            communityName: community.name,
                            groupId: group._id,
                            groupName: group.name
                        }
                    });

                    // Log in the Group itself (Special Card)
                    const groupMsg = await GroupMessage.create({
                        group_id: gId,
                        sender_id: req.user.id,
                        type: 'community_link',
                        is_system: true,
                        content: `added this group to the community: ${community.name}`,
                        metadata: {
                            kind: 'community_group_update',
                            action: 'added',
                            communityId: community._id,
                            communityName: community.name,
                            groupId: group._id,
                            groupName: group.name
                        }
                    });

                    // Populate for socket emission
                    const populatedAnnMsg = await GroupMessage.findById(annMsg._id).populate('sender_id', 'name _id __enc_name');
                    const populatedGroupMsg = await GroupMessage.findById(groupMsg._id).populate('sender_id', 'name _id __enc_name');

                    if (req.io) {
                        // Notify announcements group
                        const annGroup = await Group.findById(community.announcements);
                        (annGroup.members || []).forEach(uid => {
                            req.io.to(String(uid)).emit('group_message', {
                                groupId: community.announcements.toString(),
                                message: populatedAnnMsg
                            });
                        });

                        // Notify the group itself
                        (group.members || []).forEach(uid => {
                            req.io.to(String(uid)).emit('group_message', {
                                groupId: gId.toString(),
                                message: populatedGroupMsg
                            });
                        });
                    }
                }
            }
        }

        const updated = await Community.findById(communityId)
            .populate('creator', 'name mobile countryCode _id __enc_name __enc_mobile')
            .populate('members', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate('admins', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate({
                path: 'announcements',
                select: 'name icon _id members admin admins removedMembers isAnnouncementGroup',
                populate: {
                    path: 'members',
                    select: 'name about mobile image __enc_name __enc_about __enc_mobile'
                }
            })
            .populate({
                path: 'groups',
                select: 'name icon _id members admin admins removedMembers',
                populate: {
                    path: 'members',
                    select: 'name about mobile image __enc_name __enc_about __enc_mobile'
                }
            })
            .then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

        // Enrich groups with last message and unread count
        if (updated) {
            const userId = req.user.id;
            const userObjId = toObjectId(userId);
            
            updated.groups = await Promise.all((updated.groups || []).map(async (g) => {
                const history = (g.userHistory || []).find(h => String(h.user) === String(userId));
                const visibleFrom = history?.visibleFrom || new Date(0);

                const lastMsg = await GroupMessage.findOne({
                    group_id: g._id,
                    deleted_for: { $ne: userId }
                })
                    .sort({ created_at: -1 })
                    .populate('sender_id', 'name __enc_name')
                    .then(r => r ? (typeof r.toObject === 'function' ? r.toObject() : r) : null);

                const gUnreadCount = await GroupMessage.countDocuments({
                    group_id: g._id,
                    sender_id: { $ne: userObjId },
                    read_by: { $ne: userObjId },
                    is_system: { $ne: true },
                    created_at: { $gte: visibleFrom }
                });

                return {
                    ...g,
                    lastMessage: lastMsg,
                    unreadCount: gUnreadCount
                };
            }));
            
            // Enrich announcements
            if (updated.announcements) {
                const lastMsg = await GroupMessage.findOne({ group_id: updated.announcements._id })
                    .sort({ created_at: -1 })
                    .populate('sender_id', 'name _id __enc_name')
                    .then(r => r ? (typeof r.toObject === 'function' ? r.toObject() : r) : null);

                const history = (updated.userHistory || []).find(h => String(h.user) === String(userId));
                const visibleFrom = history?.visibleFrom || new Date(0);

                const unreadCount = await GroupMessage.countDocuments({
                    group_id: updated.announcements._id,
                    sender_id: { $ne: userObjId },
                    read_by: { $ne: userObjId },
                    is_system: { $ne: true },
                    created_at: { $gte: visibleFrom }
                });

                updated.announcements = {
                    ...updated.announcements,
                    lastMessage: lastMsg
                };
                updated.unreadCount = unreadCount;
            }
        }

        // Notify added members and everyone else
        if (req.io) {
            const communityData = {
                ...updated,
                id: updated._id,
                is_community: true
            };
            
            // 1. Specifically notify new members so it appears in their sidebar
            membersToAddToCommunityObj.forEach(id => {
                req.io.to(id.toString()).emit('community_member_added', {
                    community: communityData
                });
            });

            // 2. Notify everyone currently in the community to refresh
            const allCommMembers = [
                updated.creator?._id || updated.creator,
                ...(updated.members || []).map(m => m._id || m)
            ];
            allCommMembers.forEach(uid => {
                req.io.to(uid.toString()).emit('community_updated', {
                    community: communityData
                });
            });
        }

        res.json({ status: 'updated', community: updated });
    } catch (err) {
        console.error('[COMMUNITY ADD GROUPS ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/communities/:communityId/groups/:groupId - remove group from community
router.delete('/:communityId/groups/:groupId', authenticateToken, async (req, res) => {
    try {
        const { communityId, groupId } = req.params;
        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ error: 'Community not found' });

        const isCommAdmin = (community.admins || []).some(id => String(id) === String(req.user.id));
        if (String(community.creator) !== String(req.user.id) && !isCommAdmin) {
            return res.status(403).json({ error: 'Only community Owners and Admins can delete the groups' });
        }

        const groupObjId = toObjectId(groupId);
        if (!groupObjId) return res.status(400).json({ error: 'Invalid groupId' });

        await Community.updateOne(
            { _id: communityId },
            { $pull: { groups: groupObjId } }
        );

        if (community.announcements) {
            const group = await Group.findById(groupId);
            const groupName = group ? group.name : 'Group';

            const annMsg = await GroupMessage.create({
                group_id: community.announcements,
                sender_id: req.user.id,
                type: 'community_link',
                is_system: true,
                content: `Group "${groupName}" was removed`,
                metadata: {
                    kind: 'community_group_update',
                    action: 'removed',
                    communityId: community._id,
                    communityName: community.name,
                    groupId: groupId,
                    groupName
                }
            });

            const populatedAnnMsg = await GroupMessage.findById(annMsg._id).populate('sender_id', 'name _id __enc_name');

            let populatedGroupMsg = null;
            if (group) {
                const groupMsg = await GroupMessage.create({
                    group_id: groupId,
                    sender_id: req.user.id,
                    type: 'community_link',
                    is_system: true,
                    content: `removed this group from the community: ${community.name}`,
                    metadata: {
                        kind: 'community_group_update',
                        action: 'removed',
                        communityId: community._id,
                        communityName: community.name,
                        groupId: group._id,
                        groupName
                    }
                });
                populatedGroupMsg = await GroupMessage.findById(groupMsg._id).populate('sender_id', 'name _id __enc_name');
            }

            if (req.io) {
                const annGroup = await Group.findById(community.announcements);
                const toNotify = annGroup.members || [];
                toNotify.forEach(uid => {
                    req.io.to(String(uid)).emit('group_message', {
                        groupId: community.announcements.toString(),
                        message: populatedAnnMsg
                    });
                });

                if (group && populatedGroupMsg) {
                    (group.members || []).forEach(uid => {
                        req.io.to(String(uid)).emit('group_message', {
                            groupId: groupId.toString(),
                            message: populatedGroupMsg
                        });
                    });
                }
            }
        }

        const updated = await Community.findById(communityId)
            .populate('creator', 'name mobile countryCode _id')
            .populate('members', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate('admins', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate('announcements', 'name icon _id members admin removedMembers')
            .populate('groups')
            .then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

        res.json({ status: 'removed', community: updated });
    } catch (err) {
        console.error('[COMMUNITY REMOVE GROUP ERROR]', err);
        const errorMsg = err.response?.data?.error || err.message;
        res.status(500).json({ error: errorMsg });
    }
});

// POST /api/communities/:communityId/admins/toggle - promote/demote community admin
router.post('/:communityId/admins/toggle', authenticateToken, async (req, res) => {
    try {
        const { communityId } = req.params;
        const { userId } = req.body;
        const currentUserId = req.user.id;

        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ error: 'Community not found' });

        // Only owner or admin can toggle admins
        const isCommAdmin = (community.admins || []).some(id => String(id) === String(currentUserId));
        if (String(community.creator) !== String(currentUserId) && !isCommAdmin) {
            return res.status(403).json({ error: 'Only community owner and admins can manage admins' });
        }

        const userToToggle = toObjectId(userId);
        if (!userToToggle) return res.status(400).json({ error: 'Invalid user id' });

        // Cannot toggle the owner
        if (String(community.creator) === String(userId)) {
            return res.status(403).json({ error: 'Cannot manage the community owner status' });
        }

        const isAdmin = (community.admins || []).some(id => String(id) === String(userId));

        if (isAdmin) {
            // Remove from admins
            await Community.updateOne({ _id: communityId }, { $pull: { admins: userToToggle } });
        } else {
            // Add to admins
            await Community.updateOne({ _id: communityId }, { $addToSet: { admins: userToToggle } });
        }

        const updated = await Community.findById(communityId)
            .populate('creator', 'name mobile countryCode _id __enc_name __enc_mobile')
            .populate('members', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate('admins', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate('announcements', 'name icon _id members admin removedMembers')
            .populate('groups')
            .then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

        // Notify everyone
        if (req.io) {
            const allMembers = [
                updated.creator?._id || updated.creator,
                ...(updated.members || []).map(m => m._id || m)
            ];
            allMembers.forEach(uid => {
                req.io.to(uid.toString()).emit('community_updated', {
                    community: { ...updated, id: updated._id, is_community: true }
                });
            });
        }

        res.json({ status: 'updated', community: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/communities/:communityId/transfer-ownership - transfer community ownership
router.post('/:communityId/transfer-ownership', authenticateToken, async (req, res) => {
    try {
        const { communityId } = req.params;
        const { newOwnerId } = req.body;
        const currentUserId = req.user.id;

        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ error: 'Community not found' });

        // Only owner can transfer ownership
        if (String(community.creator) !== String(currentUserId)) {
            return res.status(403).json({ error: 'Only the community owner can transfer ownership' });
        }

        const newOwnerObjId = toObjectId(newOwnerId);
        if (!newOwnerObjId) return res.status(400).json({ error: 'Invalid user id' });

        // Check if new owner is a member
        const memberIds = community.members.map(m => String(m._id || m));
        const isMember = memberIds.includes(String(newOwnerId));
        if (!isMember) {
            console.error('[TRANSFER OWNERSHIP] Target user is not a member of the community');
            return res.status(400).json({ error: 'New owner must be a member of the community' });
        }

        // 1. Update Community: change creator, add old owner to admins, ensure new owner is admin
        await Community.updateOne(
            { _id: communityId },
            { 
                $set: { creator: newOwnerObjId },
                $addToSet: { admins: { $each: [toObjectId(currentUserId), newOwnerObjId] } }
            }
        );

        // Update Announcement Group owner as well
        if (community.announcements) {
            await Group.updateOne(
                { _id: community.announcements },
                { $set: { admin: newOwnerObjId } }
            );
        }

        // 2. Add system message to announcements
        if (community.announcements) {
            const User = require('../models/User');
            const adminUser = await User.findById(currentUserId);
            const newOwnerUser = await User.findById(newOwnerId).select('name __enc_name');

            if (adminUser && adminUser.decryptFieldsSync) adminUser.decryptFieldsSync();
            if (newOwnerUser && newOwnerUser.decryptFieldsSync) newOwnerUser.decryptFieldsSync();

            const adminName = adminUser ? adminUser.name : 'Owner';
            const newOwnerName = newOwnerUser ? newOwnerUser.name : 'User';

            const newSysMsg = await GroupMessage.create({
                group_id: community.announcements,
                sender_id: currentUserId,
                type: 'system',
                is_system: true,
                content: `${adminName} assigned ${newOwnerName} as the new owner`
            });

            // Re-fetch for live emission
            const sysMsg = await GroupMessage.findById(newSysMsg._id)
                .populate('sender_id', 'name _id __enc_name');
            if (sysMsg && sysMsg.decryptFieldsSync) sysMsg.decryptFieldsSync();

            // Notify everyone in the group
            if (req.io) {
                const group = await Group.findById(community.announcements);
                (group.members || []).forEach(uid => {
                    req.io.to(String(uid)).emit('group_message', {
                        groupId: community.announcements.toString(),
                        message: sysMsg
                    });
                });
            }
        }

        const updated = await Community.findById(communityId)
            .populate('creator', 'name mobile countryCode _id __enc_name __enc_mobile')
            .populate('members', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate('admins', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate('announcements', 'name icon _id members admin removedMembers')
            .populate('groups')
            .then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

        // Notify everyone to refresh
        if (req.io) {
            const allMembers = [
                updated.creator?._id || updated.creator,
                ...(updated.members || []).map(m => m._id || m)
            ];
            const communityData = { ...updated, id: updated._id, is_community: true };
            allMembers.forEach(uid => {
                req.io.to(uid.toString()).emit('community_updated', { community: communityData });
            });
        }

        res.json({ status: 'success', community: updated });
    } catch (err) {
        console.error('[TRANSFER OWNERSHIP ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/communities/:communityId - generic update for settings
router.patch('/:communityId', authenticateToken, async (req, res) => {
    try {
        const { communityId } = req.params;
        const { name, description, whoCanAddGroups } = req.body;
        const userId = req.user.id;

        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ error: 'Community not found' });

        // Only owner or admin can update settings
        const isCommAdmin = (community.admins || []).some(id => String(id) === String(userId));
        if (String(community.creator) !== String(userId) && !isCommAdmin) {
            return res.status(403).json({ error: 'Only community owner and admins can update settings' });
        }

        if (name !== undefined) community.name = name;
        if (description !== undefined) community.description = description;
        if (whoCanAddGroups !== undefined) community.whoCanAddGroups = whoCanAddGroups;

        await community.save();

        const updated = await Community.findById(communityId)
            .populate('creator', 'name mobile countryCode _id __enc_name __enc_mobile')
            .populate('members', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate('admins', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate('announcements', 'name icon _id members admin removedMembers')
            .populate('groups')
            .then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

        if (req.io) {
            const allMembers = [
                updated.creator?._id || updated.creator,
                ...(updated.members || []).map(m => m._id || m)
            ];
            const communityData = { ...updated, id: updated._id, is_community: true };
            allMembers.forEach(uid => {
                req.io.to(uid.toString()).emit('community_updated', { community: communityData });
            });
        }

        res.json({ status: 'updated', community: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/communities/:communityId - deactivated/delete community
router.delete('/:communityId', authenticateToken, async (req, res) => {
    try {
        const { communityId } = req.params;
        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ error: 'Community not found' });

        // Only creator can deactivate the community? 
        // User said: "admins can perform these actions... deactivating communities"
        const isCommAdmin = (community.admins || []).some(id => String(id) === String(req.user.id));
        if (String(community.creator) !== String(req.user.id) && !isCommAdmin) {
            return res.status(403).json({ error: 'Only community owner and admins can deactivate community' });
        }

        // Notify members before deletion
        if (req.io) {
            const allMembers = [
                community.creator,
                ...(community.members || [])
            ];
            allMembers.forEach(uid => {
                req.io.to(String(uid)).emit('community_deactivated', { communityId });
            });
        }

        await Community.deleteOne({ _id: communityId });
        // Optionally delete announcement group too
        if (community.announcements) {
            await Group.deleteOne({ _id: community.announcements });
            await GroupMessage.deleteMany({ group_id: community.announcements });
        }

        res.json({ status: 'success', message: 'Community deactivated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/communities/:communityId/transfer-ownership - transfer community ownership
router.post('/:communityId/transfer-ownership', authenticateToken, async (req, res) => {
    try {
        const { communityId } = req.params;
        const { newOwnerId } = req.body;
        const currentUserId = req.user.id;

        if (!newOwnerId) return res.status(400).json({ error: 'newOwnerId is required' });

        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ error: 'Community not found' });

        // Only the current owner can transfer
        if (String(community.creator) !== String(currentUserId)) {
            return res.status(403).json({ error: 'Only the community owner can transfer ownership' });
        }

        const newOwnerObjId = toObjectId(newOwnerId);
        if (!newOwnerObjId) return res.status(400).json({ error: 'Invalid newOwnerId' });

        // New owner must be an existing member or admin
        const isMember = (community.members || []).some(id => String(id) === String(newOwnerId));
        const isAdmin = (community.admins || []).some(id => String(id) === String(newOwnerId));
        if (!isMember && !isAdmin) {
            return res.status(400).json({ error: 'New owner must be an existing community member or admin' });
        }

        // Transfer: set new creator, add old owner to members if not already there, remove new owner from admins if was admin
        await Community.updateOne(
            { _id: communityId },
            {
                $set: { creator: newOwnerObjId },
                $addToSet: { members: toObjectId(currentUserId) }, // old owner becomes member
                $pull: { admins: newOwnerObjId } // new owner should not be in admins too
            }
        );

        const updated = await Community.findById(communityId)
            .populate('creator', 'name mobile countryCode _id __enc_name __enc_mobile')
            .populate('members', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate('admins', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
            .populate('announcements', 'name icon _id members admin removedMembers')
            .populate('groups')
            .then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

        // Notify all members
        if (req.io) {
            const communityData = { ...updated, id: updated._id, is_community: true };
            const allMembers = [
                updated.creator?._id || updated.creator,
                ...(updated.members || []).map(m => m._id || m)
            ];
            allMembers.forEach(uid => {
                req.io.to(String(uid)).emit('community_updated', { community: communityData });
            });
        }

        res.json({ status: 'success', message: 'Ownership transferred', community: updated });
    } catch (err) {
        console.error('[TRANSFER OWNERSHIP ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/communities/:communityId/exit - exit from community
router.post('/:communityId/exit', authenticateToken, async (req, res) => {
    try {
        const { communityId } = req.params;
        const userId = req.user.id;
        const userObjId = toObjectId(userId);

        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ error: 'Community not found' });

        // Cannot exit if owner
        if (String(community.creator) === String(userId)) {
            return res.status(400).json({ error: 'Owner cannot exit community. Transfer ownership or deactivate instead.' });
        }

        const { deleteForMe } = req.body;

        // Remove from members and admins
        const comm = await Community.findById(communityId);
        if (comm) {
            if (deleteForMe) {
                // Completely remove
                comm.members = comm.members.filter(m => m.toString() !== userId);
                comm.admins = comm.admins.filter(a => a.toString() !== userId);
                comm.removedMembers = comm.removedMembers.filter(r => r.toString() !== userId);
                comm.userHistory = comm.userHistory.filter(h => h.user.toString() !== userId);
            } else {
                handleMembershipExit(comm, userObjId);
            }
            await comm.save();
        }

        // Also remove from announcements
        if (community.announcements) {
            const annGroup = await Group.findById(community.announcements);
            if (annGroup) {
                if (deleteForMe) {
                    annGroup.members = annGroup.members.filter(m => m.toString() !== userId);
                    annGroup.removedMembers = annGroup.removedMembers.filter(r => r.toString() !== userId);
                    annGroup.userHistory = annGroup.userHistory.filter(h => h.user.toString() !== userId);
                } else {
                    handleMembershipExit(annGroup, userObjId);
                }
                await annGroup.save();
            }
        }

        // Notify others
        if (req.io) {
            const allMembers = [
                community.creator,
                ...(community.members || [])
            ];
            allMembers.forEach(uid => {
                req.io.to(uid.toString()).emit('community_updated', { communityId });
            });
        }

        res.json({ status: 'success', message: 'Exited from community' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

