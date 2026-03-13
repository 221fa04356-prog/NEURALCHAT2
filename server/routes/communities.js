const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const Community = require('../models/Community');
const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');

const JWT_SECRET = process.env.JWT_SECRET || 'neural_secret_77';

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
            .populate('creator', 'name mobile countryCode _id')
            .populate('members', 'name mobile countryCode _id about')
            .populate('admins', 'name mobile countryCode _id about')
            .populate('announcements', 'name icon _id members admin')
            .sort({ created_at: -1 })
            .lean();

        const enriched = await Promise.all((communities || []).map(async (c) => {
            let lastMsg = null;
            if (c.announcements?._id) {
                lastMsg = await GroupMessage.findOne({ group_id: c.announcements._id })
                    .sort({ created_at: -1 })
                    .populate('sender_id', 'name _id')
                    .lean();
            }

            return {
                ...c,
                id: c._id,
                is_community: true,
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

        const community = await Community.create({
            name: String(name).trim(),
            description: description || '',
            icon: icon || null,
            creator: creatorObjId,
            members: [creatorObjId],
            announcements: announcementsGroup._id,
            groups: []
        });

        const populated = await Community.findById(community._id)
            .populate('creator', 'name mobile countryCode _id')
            .populate('members', 'name mobile countryCode _id about')
            .populate('admins', 'name mobile countryCode _id about')
            .populate('announcements', 'name icon _id members admin')
            .lean();

        const lastMsg = await GroupMessage.findOne({ group_id: announcementsGroup._id })
            .sort({ created_at: -1 })
            .populate('sender_id', 'name _id')
            .lean();

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

        await Community.updateOne(
            { _id: community._id },
            { $addToSet: { members: { $each: idsToAdd } } }
        );

        if (community.announcements) {
            await Group.updateOne(
                { _id: community.announcements },
                { $addToSet: { members: { $each: idsToAdd } } }
            );

            // Log announcement
            const User = require('../models/User');
            const adminUser = await User.findById(req.user.id);
            const addedUsers = await User.find({ _id: { $in: idsToAdd } }).select('name');
            const names = addedUsers.map(u => u.name);
            const adminName = adminUser ? adminUser.name : 'Admin';
            
            let content = '';
            if (names.length === 1) content = `${adminName} added ${names[0]}`;
            else if (names.length === 2) content = `${adminName} added ${names[0]} & ${names[1]}`;
            else {
                const last = names.pop();
                content = `${adminName} added ${names.join(', ')} & ${last}`;
            }

            const sysMsg = await GroupMessage.create({
                group_id: community.announcements,
                sender_id: req.user.id,
                type: 'system',
                is_system: true,
                content
            });

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
            .populate('creator', 'name mobile countryCode _id')
            .populate('members', 'name mobile countryCode _id about')
            .populate('admins', 'name mobile countryCode _id about')
            .populate('announcements', 'name icon _id members admin')
            .lean();

        let lastMsg = null;
        if (updated.announcements?._id) {
            lastMsg = await GroupMessage.findOne({ group_id: updated.announcements._id })
                .sort({ created_at: -1 })
                .populate('sender_id', 'name _id')
                .lean();
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

        // 1. Move member to removedMembers in Community
        await Community.updateOne(
            { _id: communityId },
            {
                $pull: { members: memberObjId },
                $addToSet: { removedMembers: memberObjId }
            }
        );

        // 2. Add system message to announcements
        if (community.announcements) {
            const User = require('../models/User');
            const adminUser = await User.findById(req.user.id);
            const targetUser = await User.findById(memberId);
            const userName = targetUser ? targetUser.name : 'User';
            const adminName = adminUser ? adminUser.name : 'Admin';

            const sysMsg = await GroupMessage.create({
                group_id: community.announcements,
                sender_id: req.user.id,
                type: 'system',
                is_system: true,
                content: `${adminName} removed ${userName}`
            });

            // Handle Announcements Group (only remove from here)
            await Group.updateOne(
                { _id: community.announcements },
                {
                    $pull: { members: memberObjId },
                    $addToSet: { removedMembers: memberObjId }
                }
            );

            // Notify everyone in the group including the removed user (so they see the system msg)
            if (req.io) {
                // Fetch members to notify. We should also notify the removed user.
                const group = await Group.findById(community.announcements);
                const allToNotify = [...(group.members || []), memberObjId];

                allToNotify.forEach(uid => {
                    req.io.to(String(uid)).emit('group_message', {
                        groupId: community.announcements.toString(),
                        message: sysMsg
                    });
                });

                // Also emit a specific removal event to trigger UI refresh for the removed user
                req.io.to(memberId).emit('community_member_removed', {
                    communityId,
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
        const groupsData = await Group.find({ _id: { $in: idsToAdd } }).select('members');
        let allNewMemberIds = new Set();
        groupsData.forEach(g => {
            if (g.members) {
                g.members.forEach(m => allNewMemberIds.add(m.toString()));
            }
        });
        const membersToAddToCommunity = Array.from(allNewMemberIds);

        // 2. Add groups and members to the community
        await Community.updateOne(
            { _id: communityId },
            { 
                $addToSet: { 
                    groups: { $each: idsToAdd },
                    members: { $each: membersToAddToCommunity }
                } 
            }
        );

        // 3. Add members to the announcements group
        if (community.announcements) {
            await Group.updateOne(
                { _id: community.announcements },
                { $addToSet: { members: { $each: membersToAddToCommunity } } }
            );

            for (const gId of idsToAdd) {
                const group = await Group.findById(gId);
                if (group) {
                    // Log in Announcements Group
                    const annMsg = await GroupMessage.create({
                        group_id: community.announcements,
                        sender_id: req.user.id,
                        type: 'system',
                        is_system: true,
                        content: `Group "${group.name}" was added`
                    });

                    // Log in the Group itself (Special Card)
                    const groupMsg = await GroupMessage.create({
                        group_id: gId,
                        sender_id: req.user.id,
                        type: 'community_link',
                        is_system: true,
                        content: `added this group to the community: ${community.name}`,
                        metadata: {
                            communityId: community._id,
                            communityName: community.name
                        }
                    });

                    // Populate for socket emission
                    const populatedAnnMsg = await GroupMessage.findById(annMsg._id).populate('sender_id', 'name _id');
                    const populatedGroupMsg = await GroupMessage.findById(groupMsg._id).populate('sender_id', 'name _id');

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
            .populate('creator', 'name mobile countryCode _id')
            .populate('members', 'name mobile countryCode _id about')
            .populate('admins', 'name mobile countryCode _id about')
            .populate('announcements', 'name icon _id members admin')
            .populate('groups')
            .lean();

        // Notify added members and everyone else
        if (req.io) {
            const communityData = {
                ...updated,
                id: updated._id,
                is_community: true
            };
            
            // 1. Specifically notify new members so it appears in their sidebar
            membersToAddToCommunity.forEach(id => {
                req.io.to(String(id)).emit('community_member_added', {
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

            const sysMsg = await GroupMessage.create({
                group_id: community.announcements,
                sender_id: req.user.id,
                type: 'system',
                is_system: true,
                content: `Group "${groupName}" was removed`
            });

            if (req.io) {
                const annGroup = await Group.findById(community.announcements);
                const toNotify = annGroup.members || [];
                toNotify.forEach(uid => {
                    req.io.to(String(uid)).emit('group_message', {
                        groupId: community.announcements.toString(),
                        message: sysMsg
                    });
                });
            }
        }

        const updated = await Community.findById(communityId)
            .populate('creator', 'name mobile countryCode _id')
            .populate('members', 'name mobile countryCode _id about')
            .populate('admins', 'name mobile countryCode _id about')
            .populate('announcements', 'name icon _id members admin')
            .populate('groups')
            .lean();

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

        // Only owner can toggle admins
        if (String(community.creator) !== String(currentUserId)) {
            return res.status(403).json({ error: 'Only community owner can manage admins' });
        }

        const userToToggle = toObjectId(userId);
        if (!userToToggle) return res.status(400).json({ error: 'Invalid user id' });

        const isAdmin = (community.admins || []).some(id => String(id) === String(userId));

        if (isAdmin) {
            // Remove from admins
            await Community.updateOne({ _id: communityId }, { $pull: { admins: userToToggle } });
        } else {
            // Add to admins
            await Community.updateOne({ _id: communityId }, { $addToSet: { admins: userToToggle } });
        }

        const updated = await Community.findById(communityId)
            .populate('creator', 'name mobile countryCode _id')
            .populate('members', 'name mobile countryCode _id about')
            .populate('admins', 'name mobile countryCode _id about')
            .populate('announcements', 'name icon _id members admin')
            .populate('groups')
            .lean();

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

module.exports = router;

