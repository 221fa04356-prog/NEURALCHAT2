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
            admins: [creatorObjId], // Creator is also the first admin
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

        // Strictly add to members array and clean up removedMembers AND ghost admins. 
        // Community admins are managed separately.
        await Community.updateOne(
            { _id: community._id },
            { 
                $addToSet: { members: { $each: idsToAdd } },
                $pull: { 
                    removedMembers: { $in: idsToAdd },
                    admins: { $in: idsToAdd } // Ensure they don't join as "ghost admins"
                }
            }
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

        // 1. Move member to removedMembers in Community and CLEAN UP ADMINS
        await Community.updateOne(
            { _id: communityId },
            {
                $pull: { members: memberObjId, admins: memberObjId },
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
        // NOTE: We only add them to the 'members' array. 
        // Even if they are admins in their respective groups, 
        // they become normal community members until promoted by an owner/admin.
        await Community.updateOne(
            { _id: communityId },
            { 
                $addToSet: { 
                    groups: { $each: idsToAdd },
                    members: { $each: membersToAddToCommunityObj }
                },
                $pull: { 
                    removedMembers: { $in: membersToAddToCommunityObj },
                    admins: { $in: membersToAddToCommunityObj } // Prevent group admins from becoming ghost community admins
                }
            }
        );

        // 3. Add members to the announcements group
        if (community.announcements) {
            await Group.updateOne(
                { _id: community.announcements },
                { 
                    $addToSet: { members: { $each: membersToAddToCommunityObj } },
                    $pull: { removedMembers: { $in: membersToAddToCommunityObj } }
                }
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
            const newOwnerUser = await User.findById(newOwnerId);
            const adminName = adminUser ? adminUser.name : 'Owner';
            const newOwnerName = newOwnerUser ? newOwnerUser.name : 'User';

            const sysMsg = await GroupMessage.create({
                group_id: community.announcements,
                sender_id: currentUserId,
                type: 'system',
                is_system: true,
                content: `${adminName} assigned ${newOwnerName} as the new owner`
            });

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
            .populate('creator', 'name mobile countryCode _id')
            .populate('members', 'name mobile countryCode _id about')
            .populate('admins', 'name mobile countryCode _id about')
            .populate('announcements', 'name icon _id members admin')
            .populate('groups')
            .lean();

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
            .populate('creator', 'name mobile countryCode _id')
            .populate('members', 'name mobile countryCode _id about')
            .populate('admins', 'name mobile countryCode _id about')
            .populate('announcements', 'name icon _id members admin')
            .populate('groups')
            .lean();

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

        // Remove from members and admins
        await Community.updateOne(
            { _id: communityId },
            {
                $pull: { members: userObjId, admins: userObjId },
                $addToSet: { removedMembers: userObjId }
            }
        );

        // Also remove from announcements
        if (community.announcements) {
            await Group.updateOne(
                { _id: community.announcements },
                {
                    $pull: { members: userObjId },
                    $addToSet: { removedMembers: userObjId }
                }
            );
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

