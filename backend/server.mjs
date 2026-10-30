import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash, createHmac, randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { env } from './config/env.mjs';
import { memberCreateSchema, renewalSchema, guestSchema } from './validation/member.mjs';
import { accountCreateSchema, accountUpdateSchema, passwordChangeSchema } from './validation/account.mjs';
import { addMembershipDays, currentMembership } from './services/membership-service.mjs';
import { PostgresStateRepository } from './repositories/postgres-state-repository.mjs';
import { pool } from './database/pool.mjs';

const PORT = env.port;
const DB_PATH = './data/flex-master-db.json';
let stateRepository = env.databaseUrl ? new PostgresStateRepository() : null;
if (stateRepository) {
  try {
    await pool.query('SELECT 1');
    console.log('PostgreSQL storage connected.');
  } catch (error) {
    if (env.nodeEnv === 'production') throw new Error(`PostgreSQL connection failed: ${error.code || error.message}`);
    console.warn(`PostgreSQL is unavailable; using JSON fallback (${error.code || 'connection error'}).`);
    stateRepository = null;
  }
}
const json = (res, status, value) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); };
const hash = value => createHash('sha256').update(value).digest('hex');
const passwordHash = value => { const salt=randomBytes(16).toString('hex'); return `scrypt$${salt}$${scryptSync(value,salt,64).toString('hex')}`; };
const verifyPassword = (value, stored) => {
  if(!stored?.startsWith('scrypt$')) return timingSafeEqual(Buffer.from(hash(value)),Buffer.from(stored||hash('')));
  const [,salt,expected]=stored.split('$'); const actual=scryptSync(value,salt,64).toString('hex');
  return timingSafeEqual(Buffer.from(actual),Buffer.from(expected));
};
const initialDb = {
  accounts: [{ id: 'admin-001', email: env.adminEmail.toLowerCase(), passwordHash: passwordHash(env.adminPassword), name: 'Alex Morgan', role: 'Owner', active: true }],
  state: { members: [], visits: [], payments: [] },
  createdAt: new Date().toISOString()
};
function normalizeAccounts(db) {
  if (!Array.isArray(db.accounts)) {
    const legacy = db.admin || initialDb.accounts[0];
    db.accounts = [{ id: legacy.id || 'admin-001', email: String(legacy.email || env.adminEmail).toLowerCase(), passwordHash: legacy.passwordHash || passwordHash(env.adminPassword), name: legacy.name || 'Alex Morgan', role: 'Owner', active: true }];
  }
  db.accounts = db.accounts.map(account => ({ ...account, role: account.role === 'Receptionist' ? 'Receptionist' : 'Owner', active: account.active !== false, email: String(account.email).toLowerCase() }));
  return db;
}
const publicAccount = account => ({ id: account.id, name: account.name, email: account.email, role: account.role, active: account.active });
const ownerCount = db => db.accounts.filter(account => account.role === 'Owner' && account.active).length;
async function readDb(){
  if(stateRepository) { const database=await stateRepository.load(); if(!database.accounts?.length){ await stateRepository.save(initialDb); return initialDb; } return normalizeAccounts(database); }
  try {
    const db=normalizeAccounts(JSON.parse(await readFile(DB_PATH, 'utf8')));
    if(!db.accounts.every(account => account.passwordHash?.startsWith('scrypt' + '$'))) {
      db.accounts=db.accounts.map(account => account.passwordHash?.startsWith('scrypt' + '$') ? account : {...account,passwordHash:passwordHash(env.adminPassword)});
      await writeDb(db);
    }
    return db;
  } catch { await mkdir('./data', {recursive:true}); await writeDb(initialDb); return initialDb; }
}
async function writeDb(db){ if(stateRepository) return stateRepository.save(db); await mkdir('./data', {recursive:true}); await writeFile(DB_PATH, JSON.stringify(db, null, 2)); }
function readBody(req){ return new Promise((resolve,reject)=>{ let raw=''; req.on('data',chunk=>{raw+=chunk;if(raw.length>700_000)req.destroy(new Error('Request body too large'));}); req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch{reject(new Error('Invalid JSON body'))}}); req.on('error',reject); }); }
function signSession(payload) { const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url'); const signature=createHmac('sha256',env.sessionSecret).update(encoded).digest('base64url'); return `${encoded}.${signature}`; }
function auth(req){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,''); const [encoded,signature]=token.split('.');
  if(!encoded||!signature)return null;
  const expected=createHmac('sha256',env.sessionSecret).update(encoded).digest('base64url');
  if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
  try { const payload=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')); return payload.exp>Date.now()?payload:null; } catch { return null; }
}
const loginFailures = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const clientAddress = req => req.socket.remoteAddress || "unknown";
function canAttemptLogin(address) {
  const now = Date.now();
  const attempts = (loginFailures.get(address) || []).filter(time => now - time < LOGIN_WINDOW_MS);
  if (attempts.length) loginFailures.set(address, attempts); else loginFailures.delete(address);
  return attempts.length < MAX_LOGIN_FAILURES;
}
function recordLoginFailure(address) {
  const attempts = loginFailures.get(address) || [];
  attempts.push(Date.now());
  loginFailures.set(address, attempts);
}
function mime(path){ return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'})[extname(path)] || 'application/octet-stream'; }
const id = prefix => `${prefix}-${randomBytes(5).toString('hex').toUpperCase()}`;
const today = () => new Date().toISOString().slice(0,10);
const addDays = (date, days) => { const result=new Date(`${date}T12:00:00`); result.setDate(result.getDate()+days); return result.toISOString().slice(0,10); };
const required = (value, label) => { if(!String(value||'').trim()) throw new Error(`${label} is required`); };

const server = createServer(async (req,res)=>{
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY'); res.setHeader('Referrer-Policy','no-referrer');
  const origin=req.headers.origin;
  if(origin && env.allowedOrigins.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS');}
  if(req.method==='OPTIONS') {res.writeHead(204);return res.end();}
  try {
    if(req.method==='GET' && url.pathname==='/api/health') return json(res,200,{ok:true,service:'flex-master-api',storage:stateRepository?'postgresql':'json-fallback'});
    if(req.method==='POST' && url.pathname==='/api/auth/login'){
      const address=clientAddress(req);
      if(!canAttemptLogin(address)) return json(res,429,{error:'Too many failed sign-in attempts. Try again in 15 minutes.'});
      const {email,password}=await readBody(req); const db=await readDb();
      const account=db.accounts.find(item => item.email===String(email||'').toLowerCase() && item.active);
      if(!account || !verifyPassword(String(password||''),account.passwordHash)) { recordLoginFailure(address); return json(res,401,{error:'Invalid email or password'}); }
      loginFailures.delete(address);
      const token=signSession({accountId:account.id,role:account.role,exp:Date.now()+1000*60*60*12});
      return json(res,200,{token,account:publicAccount(account)});
    }
    if(url.pathname.startsWith('/api/')){
      const session=auth(req); if(!session || session.exp<Date.now()) return json(res,401,{error:'Unauthorized'});
      const authDb=await readDb();
      const authenticatedAccount=authDb.accounts.find(account => account.id===session.accountId && account.active);
      if(!authenticatedAccount) return json(res,401,{error:'Unauthorized'});
      const ownerOnly = () => authenticatedAccount.role==='Owner';
      if(req.method==='GET' && url.pathname==='/api/auth/me') return json(res,200,{account:publicAccount(authenticatedAccount)});
      if(req.method==='GET' && url.pathname==='/api/accounts') { if(!ownerOnly()) return json(res,403,{error:'Owner access required'}); return json(res,200,authDb.accounts.map(publicAccount)); }
      if(req.method==='POST' && url.pathname==='/api/accounts') { if(!ownerOnly()) return json(res,403,{error:'Owner access required'}); const parsed=accountCreateSchema.safeParse(await readBody(req)); if(!parsed.success) return json(res,422,{error:parsed.error.issues[0]?.message||'Invalid account details'}); if(authDb.accounts.some(account=>account.email===parsed.data.email)) return json(res,409,{error:'An account with this email already exists'}); const account={id:id('ACC'),name:parsed.data.name,email:parsed.data.email,passwordHash:passwordHash(parsed.data.password),role:parsed.data.role,active:true}; authDb.accounts.push(account); await writeDb(authDb); return json(res,201,publicAccount(account)); }
      if(req.method==='POST' && url.pathname==='/api/auth/change-password') { const parsed=passwordChangeSchema.safeParse(await readBody(req)); if(!parsed.success) return json(res,422,{error:parsed.error.issues[0]?.message||'Invalid password'}); if(!verifyPassword(parsed.data.currentPassword,authenticatedAccount.passwordHash)) return json(res,401,{error:'Current password is incorrect'}); authenticatedAccount.passwordHash=passwordHash(parsed.data.newPassword); await writeDb(authDb); return json(res,200,{ok:true}); }
      const accountMatch=url.pathname.match(/^\/api\/accounts\/([^/]+)$/);
      if(req.method==='PUT' && accountMatch) { if(!ownerOnly()) return json(res,403,{error:'Owner access required'}); const parsed=accountUpdateSchema.safeParse(await readBody(req)); if(!parsed.success) return json(res,422,{error:parsed.error.issues[0]?.message||'Invalid account change'}); const account=authDb.accounts.find(item=>item.id===decodeURIComponent(accountMatch[1])); if(!account) return json(res,404,{error:'Account not found'}); const nextRole=parsed.data.role ?? account.role; const nextActive=parsed.data.active ?? account.active; if(account.role==='Owner' && account.active && (nextRole!=='Owner' || !nextActive) && ownerCount(authDb)===1) return json(res,409,{error:'At least one active owner account is required'}); account.role=nextRole; account.active=nextActive; await writeDb(authDb); return json(res,200,publicAccount(account)); }
      if(req.method==='GET' && url.pathname==='/api/state'){ const db=await readDb(); return json(res,200,db.state); }
      if(req.method==='GET' && url.pathname==='/api/members'){ const db=await readDb(); return json(res,200,db.state.members.map(currentMembership)); }
      if(req.method==='POST' && url.pathname==='/api/members'){
        const parsed=memberCreateSchema.safeParse(await readBody(req)); if(!parsed.success)return json(res,422,{error:'Invalid member data',details:parsed.error.issues.map(issue=>issue.message)}); const input=parsed.data;
        const db=await readDb(), member={...input,id:id('FM'),token:`FM-${randomBytes(6).toString('hex').toUpperCase()}`,photo:input.photo||input.name.split(' ').map(x=>x[0]).join('').slice(0,2),start:input.date,expires:addMembershipDays(input.date,input.plan),history:[]};
        db.state.members.unshift(member); db.state.payments.unshift({id:id('PAY'),name:member.name,date:input.date,type:'Membership',plan:member.plan,amount:Number(input.amount||0),method:input.method||'Cash'}); await writeDb(db); return json(res,201,currentMembership(member));
      }
      const renewMatch=url.pathname.match(/^\/api\/members\/([^/]+)\/renew$/);
      if(req.method==='POST' && renewMatch){ const parsed=renewalSchema.safeParse(await readBody(req));if(!parsed.success)return json(res,422,{error:'Invalid renewal data'});const input=parsed.data; const db=await readDb(), member=db.state.members.find(m=>m.id===decodeURIComponent(renewMatch[1])); if(!member)return json(res,404,{error:'Member not found'}); const date=input.date; member.history=[...(member.history||[]),{plan:member.plan,start:member.start,expires:member.expires}];member.plan=input.plan;member.start=date;member.expires=addDays(date,input.plan==='Monthly'?30:15);db.state.payments.unshift({id:id('PAY'),name:member.name,date,type:'Renewal',plan:member.plan,amount:Number(input.amount),method:input.method});await writeDb(db);return json(res,200,currentMembership(member)); }
      if(req.method==='POST' && url.pathname==='/api/checkins') { const {token}=await readBody(req); const db=await readDb(), member=db.state.members.find(m=>m.token===token); if(!member)return json(res,404,{error:'Invalid QR code'}); const checked=currentMembership(member);if(checked.status!=='Active')return json(res,409,{error:'Membership expired',member:checked});const visit={id:id('VIS'),name:member.name,memberId:member.id,time:new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}),date:today(),kind:'Member',plan:member.plan,status:'Approved'};db.state.visits.unshift(visit);await writeDb(db);return json(res,201,{member:checked,visit}); }
      if(req.method==='POST' && url.pathname==='/api/guests') { const parsed=guestSchema.safeParse(await readBody(req));if(!parsed.success)return json(res,422,{error:'Invalid guest visit data'});const input=parsed.data;const db=await readDb(),visit={id:id('VIS'),name:input.name,time:new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}),date:today(),kind:'Guest',status:input.status};db.state.visits.unshift(visit);db.state.payments.unshift({id:id('PAY'),name:input.name,date:today(),type:'Guest session',amount:Number(input.amount),method:input.method});await writeDb(db);return json(res,201,{visit}); }
      const qrMatch=url.pathname.match(/^\/api\/members\/([^/]+)\/qr$/);
      if(req.method==='POST' && qrMatch){const db=await readDb(),member=db.state.members.find(m=>m.id===decodeURIComponent(qrMatch[1]));if(!member)return json(res,404,{error:'Member not found'});member.token=`FM-${randomBytes(6).toString('hex').toUpperCase()}`;await writeDb(db);return json(res,200,{member:currentMembership(member)});}
      if(req.method==='PUT' && url.pathname==='/api/state'){ const state=await readBody(req); if(!Array.isArray(state.members)||!Array.isArray(state.visits)||!Array.isArray(state.payments)) return json(res,422,{error:'Invalid data shape'}); const db=await readDb(); db.state=state; db.updatedAt=new Date().toISOString(); await writeDb(db); return json(res,200,{ok:true,updatedAt:db.updatedAt}); }
      return json(res,404,{error:'API route not found'});
    }
    const requested = url.pathname==='/' ? '/index.html' : url.pathname;
    const safe = normalize(join('./frontend/dist', requested)).replace(/\\/g,'/');
    if(!safe.startsWith('frontend/dist/')) return json(res,403,{error:'Forbidden'});
    try { const content=await readFile(safe); res.writeHead(200,{'Content-Type':mime(safe)}); return res.end(content); }
    catch { const content=await readFile('./frontend/dist/index.html'); res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); return res.end(content); }
  } catch(error) { console.error(error); return json(res,500,{error:'Server error'}); }
});
let activePort = PORT;
function listen() {
  server.listen(activePort, () => console.log(`Flex-Master API and web app: http://127.0.0.1:${activePort}`));
}
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && env.nodeEnv !== 'production' && activePort < PORT + 10) {
    activePort += 1;
    console.warn(`Port ${activePort - 1} is occupied; trying ${activePort}.`);
    listen();
    return;
  }
  throw error;
});
listen();
