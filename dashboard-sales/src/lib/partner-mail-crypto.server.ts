import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
function key(value: string) { if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Invalid mail encryption key'); return Buffer.from(value,'hex'); }
export function encryptMailSecret(value: string, owner: string, secret: string) {
 const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',key(secret),iv); cipher.setAAD(Buffer.from(owner));
 return [iv, Buffer.concat([cipher.update(value,'utf8'),cipher.final()]),cipher.getAuthTag()].filter(x=>x.length).map(x=>x.toString('base64url')).join('.');
}
export function decryptMailSecret(value: string, owner: string, secret: string) {
 const parts=value.split('.'); if(parts.length!==3) throw new Error('Invalid encrypted credential');
 const [iv,encrypted,tag]=parts.map(x=>Buffer.from(x,'base64url'));
 if(!iv||!encrypted||!tag||iv.length!==12||tag.length!==16)throw new Error('Invalid encrypted credential');
 const cipher=createDecipheriv('aes-256-gcm',key(secret),iv);cipher.setAAD(Buffer.from(owner));cipher.setAuthTag(tag);
 return Buffer.concat([cipher.update(encrypted),cipher.final()]).toString('utf8');
}
