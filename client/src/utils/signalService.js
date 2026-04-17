import { 
    KeyHelper, 
    SessionBuilder, 
    SessionCipher, 
    SignalProtocolAddress 
} from 'libsignal-protocol-typescript';
import axios from 'axios';

/**
 * SignalStore: Implementation of libsignal's storage interface.
 * Persists keys and session states in LocalStorage.
 */
class SignalStore {
    constructor(userId) {
        this.userId = userId;
        this.prefix = `signal_store_${userId}_`;
    }

    async put(key, value) {
        // Handle ArrayBuffers by converting to base64 for storage
        let storageValue = value;
        if (value instanceof ArrayBuffer) {
            storageValue = { _type: 'ArrayBuffer', data: btoa(String.fromCharCode(...new Uint8Array(value))) };
        } else if (value instanceof Uint8Array) {
            storageValue = { _type: 'Uint8Array', data: btoa(String.fromCharCode(...value)) };
        } else if (typeof value === 'object' && value !== null) {
            storageValue = this._serialize(value);
        }
        
        localStorage.setItem(this.prefix + key, JSON.stringify(storageValue));
    }

    async get(key, defaultValue) {
        const val = localStorage.getItem(this.prefix + key);
        if (!val) return defaultValue;
        
        try {
            const parsed = JSON.parse(val);
            return this._deserialize(parsed);
        } catch (e) {
            return defaultValue;
        }
    }

    _serialize(obj) {
        const res = {};
        for (const k in obj) {
            if (obj[k] instanceof ArrayBuffer) {
                res[k] = { _type: 'ArrayBuffer', data: btoa(String.fromCharCode(...new Uint8Array(obj[k]))) };
            } else if (obj[k] instanceof Uint8Array) {
                res[k] = { _type: 'Uint8Array', data: btoa(String.fromCharCode(...obj[k]))};
            } else if (typeof obj[k] === 'object' && obj[k] !== null) {
                res[k] = this._serialize(obj[k]);
            } else {
                res[k] = obj[k];
            }
        }
        return res;
    }

    _deserialize(obj) {
        if (obj && obj._type === 'ArrayBuffer') {
            return new Uint8Array(atob(obj.data).split('').map(c => c.charCodeAt(0))).buffer;
        }
        if (obj && obj._type === 'Uint8Array') {
            return new Uint8Array(atob(obj.data).split('').map(c => c.charCodeAt(0)));
        }
        if (typeof obj === 'object' && obj !== null) {
            for (const k in obj) {
                obj[k] = this._deserialize(obj[k]);
            }
        }
        return obj;
    }

    async remove(key) {
        localStorage.removeItem(this.prefix + key);
    }

    // --- libsignal required methods ---
    async getIdentityKeyPair() { return this.get('identityKey'); }
    async getLocalRegistrationId() { return this.get('registrationId'); }
    async loadIdentityKey(identifier) { return this.get('identityKey' + identifier); }
    async saveIdentity(identifier, identityKey) { await this.put('identityKey' + identifier, identityKey); return true; }
    async isTrustedIdentity(identifier, identityKey) { return true; }
    async loadPreKey(preKeyId) { return this.get('25519KeypreKey' + preKeyId); }
    async storePreKey(preKeyId, keyPair) { await this.put('25519KeypreKey' + preKeyId, keyPair); }
    async removePreKey(preKeyId) { await this.remove('25519KeypreKey' + preKeyId); }
    async loadSignedPreKey(signedPreKeyId) { return this.get('25519KeysignedKey' + signedPreKeyId); }
    async storeSignedPreKey(signedPreKeyId, keyPair) { await this.put('25519KeysignedKey' + signedPreKeyId, keyPair); }
    async removeSignedPreKey(signedPreKeyId) { await this.remove('25519KeysignedKey' + signedPreKeyId); }
    async loadSession(identifier) { return this.get('session' + identifier); }
    async storeSession(identifier, record) { await this.put('session' + identifier, record); }
    async removeSession(identifier) { await this.remove('session' + identifier); }
}

let signalStore = null;

export const SignalService = {
    initStore(userId) {
        if (!userId) return;
        if (!signalStore || signalStore.userId !== userId) {
            signalStore = new SignalStore(userId);
        }
    },

    async register(userId) {
        this.initStore(userId);
        
        const registrationId = KeyHelper.generateRegistrationId();
        const identityKey = await KeyHelper.generateIdentityKeyPair();
        
        const signedPreKeyId = 1;
        const signedPreKey = await KeyHelper.generateSignedPreKey(identityKey, signedPreKeyId);
        
        const oneTimePreKeys = [];
        for (let i = 0; i < 10; i++) {
            const preKey = await KeyHelper.generatePreKey(i);
            oneTimePreKeys.push(preKey);
            await signalStore.storePreKey(i, preKey.keyPair);
        }

        await signalStore.put('registrationId', registrationId);
        await signalStore.put('identityKey', identityKey);
        await signalStore.storeSignedPreKey(signedPreKeyId, signedPreKey.keyPair);

        const payload = {
            identityKey: btoa(String.fromCharCode(...new Uint8Array(identityKey.pubKey))),
            signedPreKey: {
                id: signedPreKey.keyId,
                publicKey: btoa(String.fromCharCode(...new Uint8Array(signedPreKey.keyPair.pubKey))),
                signature: btoa(String.fromCharCode(...new Uint8Array(signedPreKey.signature)))
            },
            oneTimePreKeys: oneTimePreKeys.map(k => ({
                id: k.keyId,
                publicKey: btoa(String.fromCharCode(...new Uint8Array(k.keyPair.pubKey)))
            }))
        };

        const token = localStorage.getItem('token');
        await axios.post('/api/chat/signal/upload-keys', payload, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        localStorage.setItem(`signal_registered_${userId}`, 'true');
    },

    async startSession(remoteUserId) {
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/chat/signal/keys/${remoteUserId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const bundle = res.data;

        const preKeyBundle = {
            identityKey: new Uint8Array(atob(bundle.identityKey).split('').map(c => c.charCodeAt(0))).buffer,
            registrationId: 0,
            signedPreKey: {
                keyId: bundle.signedPreKey.id,
                publicKey: new Uint8Array(atob(bundle.signedPreKey.publicKey).split('').map(c => c.charCodeAt(0))).buffer,
                signature: new Uint8Array(atob(bundle.signedPreKey.signature).split('').map(c => c.charCodeAt(0))).buffer
            }
        };

        if (bundle.oneTimePreKey) {
            preKeyBundle.preKey = {
                keyId: bundle.oneTimePreKey.id,
                publicKey: new Uint8Array(atob(bundle.oneTimePreKey.publicKey).split('').map(c => c.charCodeAt(0))).buffer
            };
        }

        const address = new SignalProtocolAddress(remoteUserId, 1);
        const builder = new SessionBuilder(signalStore, address);
        await builder.processPreKey(preKeyBundle);
    },

    async encrypt(remoteUserId, messageText) {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const userId = user.id || user._id;
        if (!userId) throw new Error('User not logged in');
        this.initStore(userId);

        const address = new SignalProtocolAddress(remoteUserId, 1);
        const cipher = new SessionCipher(signalStore, address);
        
        const hasSession = await signalStore.loadSession(address.toString());
        if (!hasSession) {
            await this.startSession(remoteUserId);
        }

        const ciphertext = await cipher.encrypt(new TextEncoder().encode(messageText));
        return {
            body: ciphertext.body,
            type: ciphertext.type,
            registrationId: await signalStore.getLocalRegistrationId()
        };
    },

    async decrypt(remoteUserId, ciphertextObj) {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const userId = user.id || user._id;
        if (!userId) throw new Error('User not logged in');
        this.initStore(userId);

        const address = new SignalProtocolAddress(remoteUserId, 1);
        const cipher = new SessionCipher(signalStore, address);
        
        const decryptedBuffer = await cipher.decrypt(ciphertextObj.body, ciphertextObj.type);
        return new TextDecoder().decode(decryptedBuffer);
    }
};
