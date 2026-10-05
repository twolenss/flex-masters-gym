import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { pool } from '../database/pool.mjs';
import { env } from '../config/env.mjs';

const tokenHash = token => createHash('sha256').update(token).digest('hex');
const key = createHash('sha256').update(env.sessionSecret).digest();
function seal(value) { const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`; }
function open(value) { if(!value) return '';const [iv,tag,data]=value.split('.').map(part=>Buffer.from(part,'base64'));const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8'); }

export class PostgresStateRepository {
  constructor(){ if(!pool) throw new Error('DATABASE_URL is required'); }
  async load() {
    const client=await pool.connect();
    try {
      const admins=(await client.query('SELECT id,email,display_name,password_hash FROM admins LIMIT 1')).rows;
      const memberRows=(await client.query(`SELECT m.id,m.full_name,m.date_of_birth,m.sex,m.phone,m.address,m.emergency_contact,m.photo_url,
        q.token_ciphertext, q.is_active, ms.membership_type,ms.start_date,ms.expiration_date
        FROM members m JOIN LATERAL (SELECT * FROM memberships WHERE member_id=m.id ORDER BY expiration_date DESC LIMIT 1) ms ON true
        LEFT JOIN qr_credentials q ON q.member_id=m.id ORDER BY m.created_at DESC`)).rows;
      const historyRows=(await client.query('SELECT member_id,membership_type,start_date,expiration_date FROM memberships ORDER BY expiration_date DESC')).rows;
      const members=memberRows.map(row=>({id:row.id,name:row.full_name,phone:row.phone||'',sex:row.sex||'Other',dob:row.date_of_birth?.toISOString?.().slice(0,10)||'',address:row.address||'',emergency:row.emergency_contact||'',photo:row.photo_url||row.full_name.split(' ').map(part=>part[0]).join('').slice(0,2),token:row.is_active?open(row.token_ciphertext):'',plan:row.membership_type,start:row.start_date.toISOString().slice(0,10),expires:row.expiration_date.toISOString().slice(0,10),history:historyRows.filter(h=>h.member_id===row.id).slice(1).map(h=>({plan:h.membership_type,start:h.start_date.toISOString().slice(0,10),expires:h.expiration_date.toISOString().slice(0,10)}))}));
      const payments=(await client.query(`SELECT p.id,COALESCE(m.full_name,p.guest_name) AS name,p.payment_date,p.payment_type,p.payment_method,p.amount,ms.membership_type
        FROM payments p LEFT JOIN members m ON m.id=p.member_id LEFT JOIN memberships ms ON ms.id=p.membership_id ORDER BY p.created_at DESC`)).rows.map(row=>({id:row.id,name:row.name,date:row.payment_date.toISOString().slice(0,10),type:row.payment_type,plan:row.membership_type||undefined,amount:Number(row.amount),method:row.payment_method}));
      const checkins=(await client.query(`SELECT c.id,m.full_name,c.checked_in_at,c.status,ms.membership_type,m.id member_id FROM member_checkins c JOIN members m ON m.id=c.member_id JOIN memberships ms ON ms.id=c.membership_id ORDER BY c.checked_in_at DESC`)).rows.map(row=>({id:row.id,name:row.full_name,memberId:row.member_id,time:row.checked_in_at.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}),date:row.checked_in_at.toISOString().slice(0,10),kind:'Member',plan:row.membership_type,status:row.status}));
      const guests=(await client.query('SELECT id,guest_name,visited_at,payment_status FROM guest_visits ORDER BY visited_at DESC')).rows.map(row=>({id:row.id,name:row.guest_name,time:row.visited_at.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}),date:row.visited_at.toISOString().slice(0,10),kind:'Guest',status:row.payment_status}));
      return {admin:admins[0]?{id:admins[0].id,email:admins[0].email,name:admins[0].display_name,passwordHash:admins[0].password_hash}:null,state:{members,visits:[...checkins,...guests].sort((a,b)=>`${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)),payments}};
    } finally { client.release(); }
  }
  async save(db) {
    const client=await pool.connect();
    try { await client.query('BEGIN');
      await client.query('DELETE FROM member_checkins');await client.query('DELETE FROM guest_visits');await client.query('DELETE FROM payments');await client.query('DELETE FROM qr_credentials');await client.query('DELETE FROM memberships');await client.query('DELETE FROM members');
      if(db.admin) await client.query(`INSERT INTO admins (id,email,display_name,password_hash) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,password_hash=EXCLUDED.password_hash`,[db.admin.id,db.admin.email,db.admin.name,db.admin.passwordHash]);
      const membershipIdByMember=new Map();
      for(const member of db.state.members) { await client.query('INSERT INTO members (id,member_code,full_name,date_of_birth,sex,phone,address,emergency_contact,photo_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[member.id,member.id,member.name,member.dob||null,member.sex||null,member.phone||null,member.address||null,member.emergency||null,member.photo?.startsWith('data:image')?member.photo:null]);const membershipId=`MS-${member.id}`;membershipIdByMember.set(member.id,membershipId);await client.query('INSERT INTO memberships (id,member_id,membership_type,start_date,expiration_date) VALUES ($1,$2,$3,$4,$5)',[membershipId,member.id,member.plan,member.start,member.expires]);for(const [index,history] of (member.history||[]).entries())await client.query('INSERT INTO memberships (id,member_id,membership_type,start_date,expiration_date) VALUES ($1,$2,$3,$4,$5)',[`MS-${member.id}-H${index}`,member.id,history.plan,history.start,history.expires]);if(member.token)await client.query('INSERT INTO qr_credentials (id,member_id,token_hash,token_ciphertext,is_active) VALUES ($1,$2,$3,$4,true)',[`QR-${member.id}`,member.id,tokenHash(member.token),seal(member.token)]);}
      for(const payment of db.state.payments) {const member=db.state.members.find(item=>item.name===payment.name);await client.query('INSERT INTO payments (id,member_id,membership_id,guest_name,amount,payment_type,payment_method,payment_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[payment.id,member?.id||null,member?membershipIdByMember.get(member.id):null,member?null:payment.name,Number(payment.amount),payment.type,payment.method,payment.date]);}
      for(const visit of db.state.visits) {if(visit.kind==='Member'){const memberId=visit.memberId||db.state.members.find(item=>item.name===visit.name)?.id;if(memberId)await client.query('INSERT INTO member_checkins (id,member_id,membership_id,checked_in_at,status) VALUES ($1,$2,$3,$4,$5)',[visit.id,memberId,membershipIdByMember.get(memberId),`${visit.date}T12:00:00.000Z`,visit.status]);}else await client.query('INSERT INTO guest_visits (id,guest_name,visited_at,payment_status) VALUES ($1,$2,$3,$4)',[visit.id,visit.name,`${visit.date}T12:00:00.000Z`,visit.status]);}
      await client.query('COMMIT');
    } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
  }
}
