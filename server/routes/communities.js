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
            permissions: { editSettings: true, sendMessages: true, addMembers: true }
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

        // Only creator can add members for now (simple rule)
        if (String(community.creator) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Only community owner can add members' });
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
        }

        const updated = await Community.findById(communityId)
            .populate('creator', 'name mobile countryCode _id')
            .populate('members', 'name mobile countryCode _id about')
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
            idsToAdd.forEach(id => {
                req.io.to(String(id)).emit('community_member_added', {
                    community: {
                        ...updated,
                        id: updated._id,
                        is_community: true,
                        announcements: updated.announcements ? { ...updated.announcements, lastMessage: lastMsg } : updated.announcements
                    }
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

        // Only creator can remove members
        if (String(community.creator) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Only community owner can remove members' });
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
            const targetUser = await User.findById(memberId);
            const userName = targetUser ? targetUser.name : 'User';

            const sysMsg = await GroupMessage.create({
                group_id: community.announcements,
                sender_id: req.user.id, // Admin who removed them
                type: 'system',
                is_system: true,
                content: `You removed ${userName}`
            });

            // Handle Announcements Group
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
                        ...sysMsg.toObject(),
                        _id: sysMsg._id,
                        is_system: true
                    });
                });

                // Also emit a specific removal event to trigger UI refresh for the removed user
                req.io.to(memberId).emit('community_member_removed', {
                    communityId,
                    message: `You were removed from ${community.name}`
                });
            }
        }

        res.json({ status: 'removed', memberId });
    } catch (err) {
        console.error('[COMMUNITY REMOVE MEMBER ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

