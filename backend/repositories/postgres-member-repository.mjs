import { randomUUID } from 'node:crypto';
import { pool } from '../database/pool.mjs';

// PostgreSQL implementation entry point. It intentionally requires DATABASE_URL;
// the JSON demonstration store remains the local fallback until deployment config exists.
export class PostgresMemberRepository {
  constructor() {
    if (!pool) throw new Error('DATABASE_URL is required for PostgreSQL persistence');
  }

  async create({ member, membership, payment, tokenHash }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const memberId = randomUUID(); const membershipId = randomUUID();
      await client.query(
        `INSERT INTO members (id, member_code, full_name, date_of_birth, sex, phone, address, emergency_contact)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [memberId, member.memberCode, member.name, member.dob || null, member.sex || null, member.phone, member.address || null, member.emergency || null]
      );
      await client.query(
        `INSERT INTO memberships (id, member_id, membership_type, start_date, expiration_date)
         VALUES ($1,$2,$3,$4,$5)`, [membershipId, memberId, membership.plan, membership.start, membership.expires]
      );
      await client.query('INSERT INTO qr_credentials (id, member_id, token_hash) VALUES ($1,$2,$3)', [randomUUID(), memberId, tokenHash]);
      await client.query(
        `INSERT INTO payments (id, member_id, membership_id, amount, payment_type, payment_method, payment_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), memberId, membershipId, payment.amount, 'Membership', payment.method, payment.date]
      );
      await client.query('COMMIT'); return { id: memberId, membershipId };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
