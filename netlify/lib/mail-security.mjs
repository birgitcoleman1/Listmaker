import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
function key(){const bytes=Buffer.from(process.env.MAIL_CREDENTIALS_KEY||'','base64');if(bytes.length!==32)throw Error('Mailbox encryption key is not configured');return bytes}
export function encryptSecret(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);return JSON.stringify({iv:iv.toString('base64'),data:Buffer.concat([cipher.update(value,'utf8'),cipher.final()]).toString('base64'),tag:cipher.getAuthTag().toString('base64')})}
export function decryptSecret(value){const v=JSON.parse(value),decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(v.iv,'base64'));decipher.setAuthTag(Buffer.from(v.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(v.data,'base64')),decipher.final()]).toString('utf8')}
export const migadu={imap:{host:'imap.migadu.com',port:993,secure:true},smtp:{host:'smtp.migadu.com',port:465,secure:true}};
export function safeMailError(error){const code=String(error.code||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,60);return `Mailbox operation failed${code?' ('+code+')':''}. Check the mailbox password, activation and network connection, then retry.`}
