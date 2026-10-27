import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserQRCodeReader } from "@zxing/browser";
import QRCode from "qrcode";
import {
  LayoutDashboard,
  Users,
  ScanLine,
  UserRoundPlus,
  CreditCard,
  ReceiptText,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  CalendarDays,
  Camera,
  QrCode,
  ChevronRight,
  RefreshCw,
  LogOut,
  Dumbbell,
  Menu,
  X,
  LockKeyhole,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import "./styles.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}

const today = () => new Date().toISOString().slice(0, 10);
const dateAdd = (date, n) => {
  let d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const money = (n) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n || 0);
const pretty = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
const uid = () => Math.random().toString(36).slice(2, 10).toUpperCase();
const seed = {
  members: [
    {
      id: "FM-1024",
      name: "Marianne Cruz",
      phone: "0917 555 0184",
      sex: "Female",
      dob: "1997-06-19",
      address: "Makati City",
      emergency: "Carlo Cruz · 0917 555 1020",
      plan: "Monthly",
      start: "2026-09-18",
      expires: "2026-10-18",
      photo: "MC",
      token: "FM-MC8V3Z",
      history: [],
    },
    {
      id: "FM-1023",
      name: "Jerome Santos",
      phone: "0920 440 1206",
      sex: "Male",
      dob: "1992-11-06",
      address: "Taguig City",
      emergency: "Liza Santos · 0920 440 1207",
      plan: "Half-Month",
      start: "2026-09-15",
      expires: "2026-09-30",
      photo: "JS",
      token: "FM-JS2K7A",
      history: [],
    },
    {
      id: "FM-1022",
      name: "Andrea Reyes",
      phone: "0918 300 2501",
      sex: "Female",
      dob: "1999-03-15",
      address: "Pasig City",
      emergency: "Miguel Reyes · 0918 300 2502",
      plan: "Monthly",
      start: "2026-09-10",
      expires: "2026-10-10",
      photo: "AR",
      token: "FM-AR6D2P",
      history: [],
    },
  ],
  visits: [
    { id: "v1", name: "Marianne Cruz", memberId: "FM-1024", time: "08:32 AM", date: today(), kind: "Member", plan: "Monthly", status: "Approved" },
    { id: "v2", name: "Mark Reyes", time: "05:20 PM", date: today(), kind: "Guest", status: "Paid" },
  ],
  payments: [
    { id: "p1", name: "Marianne Cruz", date: "2026-09-18", type: "Membership", plan: "Monthly", amount: 1200, method: "GCash" },
    { id: "p2", name: "Mark Reyes", date: today(), type: "Guest session", amount: 120, method: "Cash" },
  ],
};
function App() {
  const [data, setData] = useState(() => {
    try {
      return JSON.parse(localStorage.flexmaster) || seed;
    } catch {
      return seed;
    }
  });
  const [authed, setAuthed] = useState(() => Boolean(localStorage.flexmasterApiToken));
  const [page, setPage] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [notice, setNotice] = useState("");
  const apiHeaders = () => ({ "Content-Type": "application/json", Authorization: "Bearer " + localStorage.flexmasterApiToken });
  useEffect(() => {
    if (!authed) return;
    fetch("/api/state", { headers: apiHeaders() })
      .then(async (response) => {
        if (response.status === 401) {
          localStorage.removeItem("flexmasterApiToken");
          setAuthed(false);
          return;
        }
        let remote = await response.json();
        if (remote.members?.length || remote.visits?.length || remote.payments?.length) {
          setData(remote);
          localStorage.flexmaster = JSON.stringify(remote);
        } else fetch("/api/state", { method: "PUT", headers: apiHeaders(), body: JSON.stringify(data) });
      })
      .catch(() => {});
  }, [authed]);
  const save = (next) => {
    setData(next);
    localStorage.flexmaster = JSON.stringify(next);
    fetch("/api/state", { method: "PUT", headers: apiHeaders(), body: JSON.stringify(next) }).catch(() => {});
  };
  const members = data.members.map((m) => ({ ...m, status: m.expires >= today() ? "Active" : "Expired" }));
  const active = members.filter((m) => m.status === "Active");
  const nav = [
    ["Dashboard", LayoutDashboard],
    ["Members", Users],
    ["QR Scanner", ScanLine],
    ["Guest Visits", UserRoundPlus],
    ["Check-Ins", ReceiptText],
    ["Payments", CreditCard],
    ["Settings", Settings],
  ];
  const openMember = (m) => {
    setSelected(m);
    setPage("Profile");
  };
  const toast = (x) => {
    setNotice(x);
    setTimeout(() => setNotice(""), 2800);
  };
  const addMember = async (form) => {
    let response = await fetch("/api/members", { method: "POST", headers: apiHeaders(), body: JSON.stringify(form) });
    if (!response.ok) throw new Error((await response.json()).error || "Could not create member");
    let m = await response.json();
    let next = {
      ...data,
      members: [m, ...data.members],
      payments: [{ id: uid(), name: m.name, date: form.date, type: "Membership", plan: m.plan, amount: +form.amount, method: form.method }, ...data.payments],
    };
    save(next);
    openMember(m);
    toast("Member created and QR generated");
  };
  const renew = async (member, form) => {
    let response = await fetch(`/api/members/${encodeURIComponent(member.id)}/renew`, { method: "POST", headers: apiHeaders(), body: JSON.stringify(form) });
    if (!response.ok) throw new Error((await response.json()).error || "Renewal failed");
    let updated = await response.json();
    save({
      ...data,
      members: data.members.map((m) => (m.id === member.id ? updated : m)),
      payments: [{ id: uid(), name: member.name, date: form.date, type: "Renewal", plan: form.plan, amount: +form.amount, method: form.method }, ...data.payments],
    });
    setSelected(updated);
    toast("Membership renewed successfully");
  };
  const checkin = async (token) => {
    let response = await fetch("/api/checkins", { method: "POST", headers: apiHeaders(), body: JSON.stringify({ token: token.trim() }) });
    let result = await response.json();
    if (response.status === 404) return { type: "invalid" };
    if (response.status === 409) return { type: "expired", member: result.member };
    if (!response.ok) return { type: "invalid" };
    save({ ...data, visits: [result.visit, ...data.visits] });
    return { type: "ok", member: result.member, visit: result.visit };
  };
  const addGuest = async (f) => {
    let response = await fetch("/api/guests", { method: "POST", headers: apiHeaders(), body: JSON.stringify(f) });
    if (!response.ok) throw new Error((await response.json()).error || "Could not record visit");
    let result = await response.json();
    save({
      ...data,
      visits: [result.visit, ...data.visits],
      payments: [{ id: uid(), name: f.name, date: today(), type: "Guest session", amount: +f.amount, method: f.method }, ...data.payments],
    });
    toast("Guest visit recorded");
    setPage("Guest Visits");
  };
  const regenerate = async (m) => {
    let response = await fetch(`/api/members/${encodeURIComponent(m.id)}/qr`, { method: "POST", headers: apiHeaders() });
    if (!response.ok) {
      toast("Could not regenerate QR");
      return;
    }
    let { member: updated } = await response.json();
    save({ ...data, members: data.members.map((item) => (item.id === m.id ? updated : item)) });
    setSelected(updated);
    toast("A new QR credential has been generated");
  };
  let content =
    page === "Dashboard" ? (
      <Dashboard data={data} members={members} active={active} goto={setPage} open={openMember} />
    ) : page === "Members" ? (
      <Members members={members} query={query} setQuery={setQuery} open={openMember} add={() => setPage("Add Member")} />
    ) : page === "Add Member" ? (
      <MemberForm back={() => setPage("Members")} submit={addMember} />
    ) : page === "Profile" ? (
      <Profile member={selected} renew={renew} regenerate={regenerate} back={() => setPage("Members")} toast={toast} />
    ) : page === "QR Scanner" ? (
      <Scanner scan={checkin} open={openMember} />
    ) : page === "Guest Visits" ? (
      <GuestVisits visits={data.visits.filter((v) => v.kind === "Guest")} onAdd={() => setPage("Guest Add")} />
    ) : page === "Guest Add" ? (
      <GuestForm back={() => setPage("Guest Visits")} add={addGuest} />
    ) : page === "Check-Ins" ? (
      <Visits visits={data.visits} />
    ) : page === "Payments" ? (
      <Payments payments={data.payments} />
    ) : (
      <SettingsPage />
    );
  const login = async (credentials) => {
    let response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) });
    if (!response.ok) throw new Error("Incorrect email or password. Try the demo credentials below.");
    let result = await response.json();
    localStorage.flexmasterApiToken = result.token;
    setAuthed(true);
  };
  const logout = () => {
    localStorage.removeItem("flexmasterApiToken");
    setAuthed(false);
    setPage("Dashboard");
  };
  if (!authed) return <Login onLogin={login} />;
  return (
    <div className="app">
      <aside className={mobile ? "open" : ""}>
        <div className="brand">
          <span className="brandmark">
            <Dumbbell size={21} />
          </span>
          <span>
            FLEX<span>MASTER</span>
            <small>GYM MANAGEMENT</small>
          </span>
          <button className="close" onClick={() => setMobile(false)}>
            <X />
          </button>
        </div>
        <nav>
          {nav.map(([n, I]) => (
            <button
              className={page === n || (n === "Members" && ["Add Member", "Profile"].includes(page)) ? "active" : ""}
              onClick={() => {
                setPage(n);
                setMobile(false);
              }}
              key={n}
            >
              <I size={19} />
              {n}
            </button>
          ))}
        </nav>
        <button className="owner" onClick={logout}>
          <div className="avatar dark">AM</div>
          <div>
            <b>Alex Morgan</b>
            <small>Gym Administrator</small>
          </div>
          <LogOut size={17} />
        </button>
      </aside>
      <main>
        <header>
          <button className="menu" onClick={() => setMobile(true)}>
            <Menu />
          </button>
          <div>
            <p className="eyebrow">{page === "Dashboard" ? "OVERVIEW" : page.toUpperCase()}</p>
            <h1>{page === "Dashboard" ? "Good evening, Alex" : page}</h1>
          </div>
          <div className="header-actions">
            <span className="today">
              <CalendarDays size={17} />
              {pretty(today())}
            </span>
            <button className="primary compact" onClick={() => setPage("QR Scanner")}>
              <ScanLine size={17} /> Scan QR
            </button>
          </div>
        </header>
        {notice && (
          <div className="toast">
            <CheckCircle2 size={18} />
            {notice}
          </div>
        )}
        {content}
      </main>
    </div>
  );
}
function Login({ onLogin }) {
  const [email, setEmail] = useState("admin@flexmaster.gym");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await onLogin({ email, password });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="loginpage">
      <section className="login-hero">
        <div className="brand">
          <span className="brandmark">
            <Dumbbell size={21} />
          </span>
          <span>
            FLEX<span>MASTER</span>
            <small>GYM MANAGEMENT</small>
          </span>
        </div>
        <div className="hero-copy">
          <span className="round lime">
            <ShieldCheck />
          </span>
          <p className="eyebrow">ADMINISTRATOR PORTAL</p>
          <h1>Run your gym without the paperwork.</h1>
          <p>Members, check-ins, guest visits, payments, and access verification—one focused workspace.</p>
        </div>
        <small className="copyright">© 2026 Flex-Master Gym</small>
      </section>
      <section className="login-form-wrap">
        <form className="login-form card" onSubmit={submit}>
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Sign in to Flex-Master</h2>
          <p>Use your administrator account to continue.</p>
          {error && (
            <div className="login-error">
              <XCircle size={17} />
              {error}
            </div>
          )}
          <label>
            Email address
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter your password"
              />
              <button type="button" onClick={() => setShow(!show)}>
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          <button className="primary full" disabled={loading}>
            <LockKeyhole size={17} />
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <div className="demo-login">
            <b>Demo account</b>
            <span>admin@flexmaster.gym</span>
            <code>flexmaster2026</code>
          </div>
        </form>
      </section>
    </div>
  );
}
const Badge = ({ status }) => (
  <span className={"badge " + status.toLowerCase().replace(" ", "-")}>
    <i />
    {status}
  </span>
);
function Dashboard({ data, members, active, goto, open }) {
  const guestCount = data.visits.filter((v) => v.kind === "Guest" && v.date === today()).length;
  const revenue = data.payments.reduce((total, payment) => total + payment.amount, 0);
  const expiring = active.filter((m) => dateAdd(today(), 7) >= m.expires);
  return (
    <>
      <section className="stats">
        <Stat label="Total Members" value={members.length} icon={Users} tone="violet" note={active.length + " active memberships"} />
        <Stat label="Today's Visits" value={data.visits.filter((v) => v.date === today()).length} icon={ScanLine} tone="lime" note={guestCount + " guest visits"} />
        <Stat label="Monthly Revenue" value={money(revenue)} icon={CreditCard} tone="orange" note="All recorded payments" />
        <Stat label="Expiring Soon" value={expiring.length} icon={CalendarDays} tone="blue" note="Within the next 7 days" />
      </section>
      <section className="grid">
        <div className="card activity">
          <div className="section-head">
            <div>
              <h2>Recent activity</h2>
              <p>Latest movement at your gym</p>
            </div>
            <button className="textbtn" onClick={() => goto("Check-Ins")}>
              View all <ChevronRight size={16} />
            </button>
          </div>
          {data.visits.slice(0, 5).map((v) => (
            <div className="activity-row" key={v.id}>
              <span className={"round " + (v.kind === "Guest" ? "blue" : "lime")}>{v.kind === "Guest" ? <UserRoundPlus /> : <ScanLine />}</span>
              <div>
                <b>
                  {v.name} <span>{v.kind === "Guest" ? "visited as guest" : "checked in"}</span>
                </b>
                <small>
                  {v.date === today() ? "Today" : pretty(v.date)} · {v.time}
                </small>
              </div>
              <Badge status={v.status} />
            </div>
          ))}
        </div>
        <div className="card roster">
          <div className="section-head">
            <div>
              <h2>Membership overview</h2>
              <p>Current member distribution</p>
            </div>
          </div>
          <div className="donut">
            <div>
              <b>{active.length}</b>
              <small>Active</small>
            </div>
          </div>
          <div className="legend">
            <span>
              <i className="dot lime" />
              Monthly <b>{active.filter((m) => m.plan === "Monthly").length}</b>
            </span>
            <span>
              <i className="dot violet" />
              Half-month <b>{active.filter((m) => m.plan !== "Monthly").length}</b>
            </span>
            <span>
              <i className="dot red" />
              Expired <b>{members.length - active.length}</b>
            </span>
          </div>
        </div>
      </section>
      <section className="card expiring">
        <div className="section-head">
          <div>
            <h2>Memberships expiring soon</h2>
            <p>Reach out before their access expires</p>
          </div>
          <button className="textbtn" onClick={() => goto("Members")}>
            Manage members <ChevronRight size={16} />
          </button>
        </div>
        {active.slice(0, 3).map((m) => (
          <button className="memberline" key={m.id} onClick={() => open(m)}>
            <Avatar m={m} />
            <div>
              <b>{m.name}</b>
              <small>
                {m.plan} · expires {pretty(m.expires)}
              </small>
            </div>
            <span>{Math.max(0, Math.ceil((new Date(m.expires) - new Date(today())) / 86400000))} days left</span>
            <ChevronRight size={18} />
          </button>
        ))}
      </section>
    </>
  );
}
function Stat({ label, value, icon: Icon, tone, note }) {
  return (
    <div className="stat card">
      <div className={"stat-icon " + tone}>
        <Icon size={21} />
      </div>
      <div>
        <p>{label}</p>
        <h2>{value}</h2>
        <small>{note}</small>
      </div>
    </div>
  );
}
const Avatar = ({ m, big = false }) => (
  <div className={"avatar " + (big ? "big" : "")}>{String(m.photo || "").startsWith("data:image") ? <img src={m.photo} alt="Registered member" /> : <span>{m.photo}</span>}</div>
);
function Members({ members, query, setQuery, open, add }) {
  const [filter, setFilter] = useState("All memberships");
  let list = members
    .filter((m) => (m.name + m.id + m.phone).toLowerCase().includes(query.toLowerCase()))
    .filter((m) => filter === "All memberships" || m.status === filter || m.plan === filter);
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input placeholder="Search by name, ID, or phone..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option>All memberships</option>
          <option>Active</option>
          <option>Expired</option>
          <option>Half-Month</option>
          <option>Monthly</option>
        </select>
        <button className="primary" onClick={add}>
          <Plus size={18} /> Add member
        </button>
      </div>
      <div className="card tablewrap">
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Member ID</th>
              <th>Membership</th>
              <th>Status</th>
              <th>Expires</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id} onClick={() => open(m)}>
                <td>
                  <div className="person">
                    <Avatar m={m} />
                    <div>
                      <b>{m.name}</b>
                      <small>{m.phone}</small>
                    </div>
                  </div>
                </td>
                <td>{m.id}</td>
                <td>{m.plan}</td>
                <td>
                  <Badge status={m.status} />
                </td>
                <td>{pretty(m.expires)}</td>
                <td>
                  <ChevronRight size={18} />
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan="6" className="empty">
                  No members match this search or filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
function MemberForm({ back, submit }) {
  const [f, setF] = useState({ name: "", phone: "", sex: "Male", dob: "", address: "", emergency: "", plan: "Monthly", amount: "1200", method: "Cash", date: today(), photo: "" });
  const [error, setError] = useState("");
  const set = (k, v) => setF({ ...f, [k]: v });
  const exp = dateAdd(f.date, f.plan === "Monthly" ? 30 : 15);
  const send = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await submit(f);
    } catch (err) {
      setError(err.message);
    }
  };
  const selectPhoto = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Please select an image file.");
    if (file.size > 400000) return setError("Photo must be 400 KB or smaller.");
    const reader = new FileReader();
    reader.onload = () => set("photo", reader.result);
    reader.readAsDataURL(file);
  };
  return (
    <form onSubmit={send}>
      <div className="form-top">
        <button type="button" className="back" onClick={back}>
          ← Back to members
        </button>
        <button className="primary">
          <CheckCircle2 size={18} /> Create member & QR
        </button>
      </div>
      {error && <div className="login-error">{error}</div>}
      <div className="formgrid">
        <section className="card formcard">
          <h2>Personal information</h2>
          <p>Details used to identify the member at check-in.</p>
          <div className="photo-upload">
            <div className="avatar big">{f.photo?.startsWith("data:image") ? <img src={f.photo} alt="New member preview" /> : <span>{f.photo || "+"}</span>}</div>
            <div>
              <b>Member photo</b>
              <small>For visual verification at check-in</small>
              <input type="file" accept="image/*" aria-label="Upload member photo" onChange={(e) => selectPhoto(e.target.files?.[0])} />
              <input aria-label="Photo initials" placeholder="Or use initials (e.g. JD)" onChange={(e) => set("photo", e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="fields">
            <Field label="Full name" required value={f.name} change={(v) => set("name", v)} />
            <Field label="Phone number" required value={f.phone} change={(v) => set("phone", v)} />
            <Field label="Date of birth" type="date" value={f.dob} change={(v) => set("dob", v)} />
            <label>
              Sex
              <select value={f.sex} onChange={(e) => set("sex", e.target.value)}>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </label>
            <Field label="Address" value={f.address} change={(v) => set("address", v)} />
            <Field label="Emergency contact" value={f.emergency} change={(v) => set("emergency", v)} />
          </div>
        </section>
        <section className="card formcard">
          <h2>Membership & payment</h2>
          <p>The expiration date is calculated automatically.</p>
          <div className="planpick">
            <button type="button" className={f.plan === "Half-Month" ? "chosen" : ""} onClick={() => set("plan", "Half-Month")}>
              <b>Half-Month</b>
              <small>15 days access</small>
            </button>
            <button type="button" className={f.plan === "Monthly" ? "chosen" : ""} onClick={() => set("plan", "Monthly")}>
              <b>Monthly</b>
              <small>30 days access</small>
            </button>
          </div>
          <div className="fields">
            <Field label="Payment date" type="date" value={f.date} change={(v) => set("date", v)} />
            <Field label="Amount (₱)" type="number" value={f.amount} change={(v) => set("amount", v)} />
            <label>
              Payment method
              <select value={f.method} onChange={(e) => set("method", e.target.value)}>
                <option>Cash</option>
                <option>GCash</option>
                <option>Bank transfer</option>
              </select>
            </label>
            <div className="expiry">
              <small>Membership period</small>
              <b>
                {pretty(f.date)} <ArrowUpRight size={15} /> {pretty(exp)}
              </b>
              <span>{f.plan === "Monthly" ? "30 days" : "15 days"} · Active upon payment</span>
            </div>
          </div>
        </section>
      </div>
    </form>
  );
}
function Field({ label, type = "text", value, change, required }) {
  return (
    <label>
      {label}
      <input required={required} type={type} value={value} onChange={(e) => change(e.target.value)} />
    </label>
  );
}
function Profile({ member, renew, regenerate, back, toast }) {
  const [modal, setModal] = useState(false);
  if (!member) return null;
  return (
    <>
      <button className="back" onClick={back}>
        ← Back to members
      </button>
      <section className="profile-head card">
        <Avatar m={member} big />
        <div className="profile-title">
          <p>{member.id}</p>
          <h2>{member.name}</h2>
          <span>
            {member.phone} · {member.sex}
          </span>
          <Badge status={member.status} />
        </div>
        <div className="profile-actions">
          <button className="secondary" onClick={() => document.querySelector(".qrpanel")?.scrollIntoView({ behavior: "smooth" })}>
            <QrCode size={18} /> View QR
          </button>
          <button className="primary" onClick={() => setModal(true)}>
            <RefreshCw size={17} /> Renew membership
          </button>
        </div>
      </section>
      <div className="profile-grid">
        <section className="card details">
          <h2>Membership</h2>
          <div className="membership">
            <span className="round lime">
              <Dumbbell />
            </span>
            <div>
              <b>{member.plan}</b>
              <small>Current membership</small>
            </div>
            <Badge status={member.status} />
          </div>
          <dl>
            <div>
              <dt>Start date</dt>
              <dd>{pretty(member.start)}</dd>
            </div>
            <div>
              <dt>Expiration date</dt>
              <dd>{pretty(member.expires)}</dd>
            </div>
            <div>
              <dt>Days remaining</dt>
              <dd>{member.status === "Active" ? Math.max(0, Math.ceil((new Date(member.expires) - new Date(today())) / 86400000)) : "—"} days</dd>
            </div>
          </dl>
          <h2>Personal information</h2>
          <dl>
            <div>
              <dt>Date of birth</dt>
              <dd>{member.dob ? pretty(member.dob) : "Not provided"}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{member.address || "Not provided"}</dd>
            </div>
            <div>
              <dt>Emergency contact</dt>
              <dd>{member.emergency || "Not provided"}</dd>
            </div>
          </dl>
        </section>
        <section className="card qrpanel">
          <p className="eyebrow">MEMBER QR CREDENTIAL</p>
          <h2>Present this at every visit</h2>
          <Qr token={member.token} />
          <code>{member.token}</code>
          <p>This secure token contains no personal information. It is validated before every check-in.</p>
          <div className="qr-actions">
            <button className="secondary" onClick={() => downloadQr(member)}>
              <QrCode size={16} /> Download QR
            </button>
            <button className="secondary" onClick={() => regenerate(member)}>
              <RefreshCw size={16} /> Regenerate QR
            </button>
          </div>
        </section>
      </div>
      {modal && <RenewModal member={member} close={() => setModal(false)} submit={(f) => renew(member, f)} />}
    </>
  );
}
function Qr({ token }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 1, width: 360, color: { dark: "#171727", light: "#ffffff" } })
      .then((url) => { if (active) setImage(url); })
      .catch(() => { if (active) setImage(""); });
    return () => { active = false; };
  }, [token]);
  return <div className="qr" aria-label="Member QR code">{image ? <img src={image} alt="Scannable member QR code" /> : <span>Generating QR…</span>}</div>;
}
async function downloadQr(member) {
  const url = await QRCode.toDataURL(member.token, { errorCorrectionLevel: "M", margin: 1, width: 900, color: { dark: "#171727", light: "#ffffff" } });
  const link = document.createElement("a");
  link.href = url;
  link.download = member.id + "-flex-master-qr.png";
  link.click();
}
function RenewModal({ member, close, submit }) {
  const [f, setF] = useState({ plan: "Monthly", amount: "1200", method: "Cash", date: today() });
  const [error, setError] = useState("");
  return (
    <div className="modalback">
      <form
        className="modal card"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await submit(f);
            close();
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <button type="button" className="modalclose" onClick={close}>
          ×
        </button>
        <p className="eyebrow">RENEW MEMBERSHIP</p>
        <h2>{member.name}</h2>
        {error && <div className="login-error">{error}</div>}
        <div className="fields">
          <label>
            Membership type
            <select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value, amount: e.target.value === "Monthly" ? "1200" : "700" })}>
              <option>Monthly</option>
              <option>Half-Month</option>
            </select>
          </label>
          <Field label="Payment amount (₱)" type="number" value={f.amount} change={(v) => setF({ ...f, amount: v })} />
          <label>
            Payment method
            <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              <option>Cash</option>
              <option>GCash</option>
            </select>
          </label>
          <Field label="Renewal date" type="date" value={f.date} change={(v) => setF({ ...f, date: v })} />
        </div>
        <button className="primary full">Confirm renewal</button>
      </form>
    </div>
  );
}
function Scanner({ scan, open }) {
  const [token, setToken] = useState("");
  const [result, setResult] = useState(null);
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const video = useRef(null);
  const controls = useRef(null);
  const submitToken = async (value) => {
    if (!value) return;
    setResult(await scan(value));
    setCamera(false);
  };
  const go = async (e) => {
    e.preventDefault();
    submitToken(token);
  };
  const startCamera = () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser does not provide camera access. Open the app in a current version of Chrome, Edge, Firefox, or Safari.");
      return;
    }
    if (!window.isSecureContext) {
      setCameraError("Camera access requires localhost or HTTPS. Open this app at http://localhost:5173 while testing locally, or use HTTPS after deployment.");
      return;
    }
    setCameraError("");
    setCamera(true);
  };
  useEffect(() => {
    let stopped = false;
    async function start() {
      if (!camera) return;
      try {
        setCameraError("");
        const reader = new BrowserQRCodeReader();
        controls.current = await reader.decodeFromVideoDevice(undefined, video.current, (result, error) => {
          if (stopped || !result) return;
          stopped = true;
          controls.current?.stop();
          submitToken(result.getText());
        });
      } catch (error) {
        setCameraError(error?.message || "Could not access the camera. Check browser permissions and try again.");
        setCamera(false);
      }
    }
    start();
    return () => {
      stopped = true;
      controls.current?.stop();
      controls.current = null;
    };
  }, [camera]);
  return (
    <div className="scanner-layout">
      <section className="card scanbox">
        <div className="scan-art">
          {camera ? (
            <video ref={video} className="camera-feed" muted playsInline />
          ) : (
            <>
              <ScanLine size={64} />
              <span />
              <span />
              <span />
              <span />
            </>
          )}
        </div>
        <h2>{camera ? "Scanning camera…" : "Ready to scan"}</h2>
        <p>Scan a member QR code with the camera, or paste a credential below.</p>
        {cameraError && <div className="login-error">{cameraError}</div>}
        <button
          type="button"
          className="secondary full"
          onClick={() => {
            if (camera) {
              setCamera(false);
            } else {
              startCamera();
            }
          }}
        >
          <Camera size={17} />
          {camera ? "Stop camera" : "Use camera scanner"}
        </button>
        <form onSubmit={go}>
          <input placeholder="e.g. FM-MC8V3Z" value={token} onChange={(e) => setToken(e.target.value)} />
          <button className="primary full">Validate QR code</button>
        </form>
      </section>
      <section className={"card scanresult " + (result?.type || "")}>
        <p className="eyebrow">CHECK-IN VERIFICATION</p>
        {!result ? (
          <>
            <h2>Awaiting a member</h2>
            <p>Member identity and access status will appear here after the QR code is scanned.</p>
          </>
        ) : result.type === "ok" ? (
          <>
            <Badge status="Approved" />
            <Avatar m={result.member} big />
            <h2>MEMBER FOUND</h2>
            <h3>{result.member.name}</h3>
            <p>
              {result.member.plan} · expires {pretty(result.member.expires)}
            </p>
            <div className="granted">
              <CheckCircle2 /> ACCESS GRANTED
            </div>
            <button className="textbtn" onClick={() => open(result.member)}>
              Open member profile <ChevronRight size={16} />
            </button>
          </>
        ) : result.type === "expired" ? (
          <>
            <XCircle className="erroricon" />
            <h2>ACCESS DENIED</h2>
            <h3>{result.member.name}</h3>
            <p>Membership expired {pretty(result.member.expires)}. Please renew before check-in.</p>
            <button className="secondary" onClick={() => open(result.member)}>
              Open profile
            </button>
          </>
        ) : (
          <>
            <XCircle className="erroricon" />
            <h2>INVALID QR CODE</h2>
            <p>This credential is not associated with a valid member. Check the QR and try again.</p>
          </>
        )}
      </section>
    </div>
  );
}
function GuestVisits({ visits, onAdd }) {
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input placeholder="Search guest visits..." />
        </div>
        <button className="primary" onClick={onAdd}>
          <Plus size={18} /> Record guest visit
        </button>
      </div>
      <VisitTable visits={visits} />
    </>
  );
}
function GuestForm({ back, add }) {
  const [f, setF] = useState({ name: "", amount: "120", method: "Cash", status: "Paid" });
  const [error, setError] = useState("");
  const send = async (e) => {
    e.preventDefault();
    try {
      await add(f);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <form onSubmit={send}>
      <div className="form-top">
        <button type="button" className="back" onClick={back}>
          ← Back to guest visits
        </button>
        <button className="primary">
          <CheckCircle2 size={18} /> Record visit
        </button>
      </div>
      {error && <div className="login-error">{error}</div>}
      <section className="card formcard guestform">
        <p className="eyebrow">ONE-TIME SESSION</p>
        <h2>Record guest visit</h2>
        <p>Guests only need their name. Payment is entered manually by the administrator.</p>
        <div className="fields">
          <Field label="Guest name" required value={f.name} change={(v) => setF({ ...f, name: v })} />
          <Field label="Session fee (₱)" type="number" value={f.amount} change={(v) => setF({ ...f, amount: v })} />
          <label>
            Payment method
            <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              <option>Cash</option>
              <option>GCash</option>
            </select>
          </label>
          <label>
            Payment status
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option>Paid</option>
              <option>Unpaid</option>
            </select>
          </label>
        </div>
      </section>
    </form>
  );
}
function VisitTable({ visits }) {
  return (
    <div className="card tablewrap">
      <table>
        <thead>
          <tr>
            <th>Visitor</th>
            <th>Visit type</th>
            <th>Date</th>
            <th>Time</th>
            <th>Plan</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {visits.map((v) => (
            <tr key={v.id}>
              <td>
                <b>{v.name}</b>
              </td>
              <td>{v.kind}</td>
              <td>{pretty(v.date)}</td>
              <td>{v.time}</td>
              <td>{v.plan || "One-time session"}</td>
              <td>
                <Badge status={v.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Visits({ visits }) {
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input placeholder="Search visit history..." />
        </div>
        <select>
          <option>All visitors</option>
          <option>Members</option>
          <option>Guests</option>
        </select>
      </div>
      <VisitTable visits={visits} />
    </>
  );
}
function Payments({ payments }) {
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input placeholder="Search payment history..." />
        </div>
        <select>
          <option>All payments</option>
          <option>Membership</option>
          <option>Guest sessions</option>
        </select>
      </div>
      <div className="card tablewrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Date</th>
              <th>Payment type</th>
              <th>Membership</th>
              <th>Method</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.name}</b>
                </td>
                <td>{pretty(p.date)}</td>
                <td>{p.type}</td>
                <td>{p.plan || "—"}</td>
                <td>{p.method}</td>
                <td>
                  <b>{money(p.amount)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function SettingsPage() {
  return (
    <div className="card settings">
      <span className="round violet">
        <Settings />
      </span>
      <h2>Gym settings</h2>
      <p>Business settings and administrator credentials can be configured here in the production system.</p>
      <div>
        <b>Flex-Master Gym</b>
        <small>Manila, Philippines · Admin access enabled</small>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
