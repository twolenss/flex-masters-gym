import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash, randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { env } from './config/env.mjs';
import { memberCreateSchema, renewalSchema, guestSchema } from './validation/member.mjs';
import { addMembershipDays, currentMembership } from './services/membership-service.mjs';
import { PostgresStateRepository } from './repositories/postgres-state-repository.mjs';
import { pool } from './database/pool.mjs';

const PORT = env.port;
const DB_PATH = './data/flex-master-db.json';
const sessions = new Map();
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
  admin: { id: 'admin-001', email: 'admin@flexmaster.gym', passwordHash: passwordHash('flexmaster2026'), name: 'Alex Morgan' },
  state: { members: [], visits: [], payments: [] },
  createdAt: new Date().toISOString()
};

async function readDb(){
  if(stateRepository) { const database=await stateRepository.load(); if(!database.admin){ await stateRepository.save(initialDb); return initialDb; } return database; }
  try { const db=JSON.parse(await readFile(DB_PATH, 'utf8')); if(!db.admin.passwordHash.startsWith('scrypt$')) { db.admin.passwordHash=passwordHash('flexmaster2026'); await writeDb(db); } return db; }
  catch { await mkdir('./data', {recursive:true}); await writeDb(initialDb); return initialDb; }
}
async function writeDb(db){ if(stateRepository) return stateRepository.save(db); await mkdir('./data', {recursive:true}); await writeFile(DB_PATH, JSON.stringify(db, null, 2)); }
function readBody(req){ return new Promise((resolve,reject)=>{ let raw=''; req.on('data',chunk=>{raw+=chunk;if(raw.length>700_000)req.destroy(new Error('Request body too large'));}); req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch{reject(new Error('Invalid JSON body'))}}); req.on('error',reject); }); }
function auth(req){ const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,''); return token && sessions.get(token); }
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
      const {email,password}=await readBody(req); const db=await readDb();
      const valid=String(email||'').toLowerCase()===db.admin.email && verifyPassword(String(password||''),db.admin.passwordHash);
      if(!valid) return json(res,401,{error:'Invalid email or password'});
      const token=randomBytes(32).toString('hex'); sessions.set(token,{adminId:db.admin.id,expires:Date.now()+1000*60*60*12});
      return json(res,200,{token,admin:{name:db.admin.name,email:db.admin.email}});
    }
    if(url.pathname.startsWith('/api/')){
      const session=auth(req); if(!session || session.expires<Date.now()) return json(res,401,{error:'Unauthorized'});
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
