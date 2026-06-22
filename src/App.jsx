import { useState, useEffect, useRef } from "react";
import { supabase, ensureFamily } from "./supabaseClient.js";

// ── "Familiar" ──────────────────────────────────────────────────────────────
// USER SIDE: grid → one-at-a-time.   FAMILY SIDE: people · tree · invite.
// Tree is a true family tree: couples joined by a marriage line, descending
// from each couple down to their children and on to the next generation.

const SEED = [
  { id: "dad",    name: "Dad",    relation: "Your husband",         note: "Married 52 years.",            shape: "oval", c1: "#7C90A8", c2: "#566B86", photos: [], spouseId: "mom",   parentId: null },
  { id: "brian",  name: "Brian",  relation: "Your son",             note: "Comes to see you on Sundays.", shape: "oval", c1: "#6E9080", c2: "#48695B", photos: [], spouseId: "maria", parentId: "mom" },
  { id: "maria",  name: "Maria",  relation: "Your daughter-in-law", note: "Brian's wife. Loves to read.", shape: "oval", c1: "#C28C82", c2: "#9C6258", photos: [], spouseId: "brian", parentId: null },
  { id: "hannah", name: "Hannah", relation: "Your granddaughter",   note: "A writer. Calls often.",        shape: "oval", c1: "#D9AE6B", c2: "#B07F38", photos: [], spouseId: null,    parentId: "brian" },
  { id: "luke",   name: "Luke",   relation: "Your grandson",        note: "A counselor. Very gentle.",    shape: "oval", c1: "#83A8A0", c2: "#557A72", photos: [], spouseId: null,    parentId: "brian" },
];
const MOM = { id: "mom", name: "Mom", shape: "oval", c1: "#C9A24B", c2: "#A07A2E", photos: [], spouseId: "dad", parentId: null };

const initials = (n) => ((n || "?").trim().split(/\s+/).map((w) => w[0] || "").slice(0, 2).join("").toUpperCase()) || "?";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function resizeImage(file, max = 720, quality = 0.74) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > max) { height = (height * max) / width; width = max; }
        else if (height > max) { width = (width * max) / height; height = max; }
        const c = document.createElement("canvas");
        c.width = width; c.height = height;
        c.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject; img.src = reader.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

const _store = (() => {
  if (typeof window !== "undefined" && window.storage) return window.storage;
  let ok = false; try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); ok = true; } catch {}
  const mem = {};
  return {
    async get(k){ const v = ok ? localStorage.getItem(k) : (k in mem ? mem[k] : null); return v != null ? { value: v } : null; },
    async set(k, v){ if (ok) { try { localStorage.setItem(k, v); } catch {} } else mem[k] = v; return { value: v }; },
    async delete(k){ if (ok) localStorage.removeItem(k); else delete mem[k]; },
  };
})();
const HAS_STORAGE = true;
async function sget(k){ try{ const r = await _store.get(k); return r ? r.value : null; }catch{ return null; } }
async function sset(k,v){ try{ await _store.set(k,v); return true; }catch{ return false; } }
async function sdel(k){ try{ await _store.delete(k); }catch{} }

function Frame({ person, photo, size, draggable, onDrag }) {
  const drag = useRef(null);
  const square = person && person.shape === "square";
  const br = square ? Math.round(size * 0.16) + "px" : "50%";
  const common = { width: size, height: size, borderRadius: br };
  if (!photo) {
    return (
      <div className="frame ph" style={{ ...common, background: `radial-gradient(120% 120% at 30% 25%, ${(person&&person.c1)||"#9aa"}, ${(person&&person.c2)||"#677"})` }}>
        <span style={{ fontSize: size * 0.34 }}>{initials(person && person.name)}</span>
      </div>
    );
  }
  const dragProps = draggable ? {
    style: { ...common, touchAction: "none", cursor: "grab" },
    onPointerDown: (e) => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); },
    onPointerMove: (e) => { if (!drag.current) return; const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; drag.current = { x: e.clientX, y: e.clientY }; onDrag(dx, dy); },
    onPointerUp: () => { drag.current = null; },
  } : { style: common };
  return (
    <div className="frame" {...dragProps}>
      <img src={photo.src} draggable={false} alt={(person && person.name) || ""}
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${photo.ox ?? 50}% ${photo.oy ?? 50}%`, transform: `scale(${photo.zoom ?? 1})` }} />
    </div>
  );
}

function Uploader({ onPick, className, children }) {
  return (
    <label className={className} style={{ cursor: "pointer" }}>
      {children}
      <input type="file" accept="image/*" style={{ display: "none" }}
        onChange={async (e) => { const f = e.target.files && e.target.files[0]; if (f) { try { onPick(await resizeImage(f)); } catch {} } e.target.value = ""; }} />
    </label>
  );
}

function CropEditor({ state, onChange, onSave, onCancel, onRemove }) {
  const person = { name: state.name, shape: state.shape, c1: state.c1, c2: state.c2 };
  const photo = { src: state.src, zoom: state.zoom, ox: state.ox, oy: state.oy };
  return (
    <div className="modalWrap">
      <div className="modal">
        <p className="addTitle">Adjust photo</p>
        <div className="cropStage">
          <Frame person={person} photo={photo} size={250} draggable
            onDrag={(dx, dy) => onChange({ ox: clamp(state.ox - dx * 0.3, 0, 100), oy: clamp(state.oy - dy * 0.3, 0, 100) })} />
        </div>
        <p className="cropHint">Drag the photo to reposition</p>
        <label className="sliderRow"><span>Zoom</span>
          <input type="range" min="1" max="3" step="0.01" value={state.zoom} onChange={(e) => onChange({ zoom: parseFloat(e.target.value) })} /></label>
        <div className="shapeRow"><span className="shapeLabel">Frame</span>
          <div className="seg">
            <button className={"segBtn" + (state.shape === "oval" ? " on" : "")} onClick={() => onChange({ shape: "oval" })}>Oval</button>
            <button className={"segBtn" + (state.shape === "square" ? " on" : "")} onClick={() => onChange({ shape: "square" })}>Square</button>
          </div>
        </div>
        <button className="add" onClick={onSave}>Done</button>
        {onRemove && <button className="ghost" onClick={onRemove}>Remove this photo</button>}
        <button className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function PersonEditor({ person, all, onClose, onAddPhoto, onEditPhoto, onMakeMain, onField, onSetPartner, onSetParent, onRemovePerson }) {
  const photos = person.photos || [];
  const others = all.filter((p) => p.id !== person.id);
  return (
    <div className="sheetWrap">
      <div className="sheet">
        <button className="back" onClick={onClose}>‹ Done</button>
        <div className="editPreview"><Frame person={person} photo={photos[0]} size={170} /></div>
        <h3 className="contribH" style={{ textAlign: "center" }}>{person.name}</h3>
        <p className="thumbsLabel">Photos ({photos.length}/5)</p>
        <div className="thumbs">
          {photos.map((ph, i) => (
            <div key={ph.id} className="thumb">
              <button className="thumbBtn" onClick={() => onEditPhoto(ph)}><Frame person={person} photo={ph} size={64} /></button>
              {i === 0 ? <span className="mainTag">Main</span> : <button className="tlink" onClick={() => onMakeMain(ph.id)}>Make main</button>}
            </div>
          ))}
          {photos.length < 5 && (<Uploader className="addTile" onPick={onAddPhoto}><span>＋</span><small>Add</small></Uploader>)}
        </div>
        <label className="field"><span>Name</span><input value={person.name} onChange={(e) => onField("name", e.target.value)} /></label>
        <label className="field"><span>How they're related to Mom</span><input value={person.relation || ""} onChange={(e) => onField("relation", e.target.value)} /></label>
        <label className="field"><span>A little note (optional)</span><input value={person.note || ""} onChange={(e) => onField("note", e.target.value)} /></label>

        <p className="thumbsLabel">Family links</p>
        <label className="field"><span>Partner / spouse</span>
          <select className="select" value={person.spouseId || ""} onChange={(e) => onSetPartner(e.target.value)}>
            <option value="">No partner</option>
            <option value="mom">Mom</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select></label>
        <label className="field"><span>Child of</span>
          <select className="select" value={person.parentId || ""} onChange={(e) => onSetParent(e.target.value)}>
            <option value="">Top of the family</option>
            <option value="mom">{"Mom & Dad"}</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name + (o.spouseId && o.spouseId !== "mom" ? " & partner" : "")}</option>)}
          </select></label>

        <button className="ghost" onClick={onRemovePerson}>Remove from circle</button>
      </div>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const send = async () => {
    if (!email.trim()) return;
    setErr("");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    if (error) setErr(error.message); else setSent(true);
  };
  return (
    <div className="signinWrap">
      <div className="signinCard">
        <p className="eyebrow">Our Family Faces</p>
        {!sent ? (
          <>
            <h2 className="header">Family sign-in</h2>
            <p className="sub">Enter your email and we'll send a one-tap sign-in link. This is the admin door — the people who use the app never see it.</p>
            <label className="field"><span>Your email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
            {err && <p className="signerr">{err}</p>}
            <button className="add" onClick={send}>Send me a sign-in link</button>
          </>
        ) : (
          <div className="thanks">
            <div className="check">✓</div>
            <p className="thanksH">Check your email</p>
            <p className="thanksP">Tap the link we sent to {email} to sign in. It can take a minute, and may land in spam.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Familiar() {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [side, setSide] = useState("user");
  const [userView, setUserView] = useState("grid");
  const [famView, setFamView] = useState("people");
  const [idx, setIdx] = useState(0);
  const [focusPhoto, setFocusPhoto] = useState(0);
  const [form, setForm] = useState({ name: "", relation: "", note: "", photos: [], shape: "oval" });
  const [editingId, setEditingId] = useState(null);
  const [crop, setCrop] = useState(null);
  const [contrib, setContrib] = useState({ open: false, sent: false, name: "", relation: "", photo: null });
  const [copied, setCopied] = useState(false);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const bootedRef = useRef(false);
  useEffect(() => {
    const boot = (s) => { setSession(s); if (s && !bootedRef.current) { bootedRef.current = true; ensureFamily(s.user.id); } };
    supabase.auth.getSession().then(({ data }) => { boot(data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => boot(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { (async () => {
    const raw = await sget("familiar:meta:v1");
    let base = SEED;
    if (raw) { try { base = JSON.parse(raw); } catch { base = SEED; } }
    const seedMap = Object.fromEntries(SEED.map((s) => [s.id, s]));
    const hydrated = await Promise.all(base.map(async (m) => {
      const seed = seedMap[m.id];
      const spouseId = m.spouseId !== undefined ? m.spouseId : (seed ? seed.spouseId : null);
      const parentId = m.parentId !== undefined ? m.parentId : (seed ? seed.parentId : null);
      let photos = [];
      try { const p = await sget("familiar:photos:" + m.id); if (p) { const a = JSON.parse(p); if (a && a.length) photos = a; } } catch {}
      if (!photos.length) { const old = await sget("familiar:photo:" + m.id); if (old) photos = [{ id: "mig" + m.id, src: old, zoom: 1, ox: 50, oy: 50 }]; }
      return { ...m, shape: m.shape || "oval", spouseId, parentId, photos };
    }));
    setPeople(hydrated);
    setLoading(false);
  })(); }, []);

  const persistMeta = (list) => sset("familiar:meta:v1", JSON.stringify(list.map((p) => { const { photos, ...rest } = p; return { ...rest, hasPhotos: !!(photos && photos.length) }; })));
  const commit = (list) => { setPeople(list); persistMeta(list); };
  const updatePerson = (id, patch) => {
    const list = people.map((p) => p.id === id ? { ...p, ...patch } : p);
    commit(list);
    if (patch.photos) sset("familiar:photos:" + id, JSON.stringify(patch.photos));
  };

  const openPerson = (id) => { const i = people.findIndex((x) => x.id === id); if (i >= 0) { setIdx(i); setFocusPhoto(0); setSide("user"); setUserView("focus"); } };
  const move = (d) => { setIdx((i) => (i + d + people.length) % people.length); setFocusPhoto(0); };

  const addPerson = () => {
    if (!form.name.trim()) return;
    const pal = [["#B58AB0","#8A5E86"],["#C9A24B","#A07A2E"],["#7C90A8","#566B86"],["#6E9080","#48695B"]];
    const c = pal[people.length % pal.length];
    const id = "p" + Date.now();
    const np = { id, name: form.name.trim(), relation: form.relation.trim() || "Family", note: form.note.trim(), shape: form.shape || "oval", c1: c[0], c2: c[1], photos: form.photos || [], spouseId: null, parentId: null };
    commit([...people, np]);
    if (np.photos.length) sset("familiar:photos:" + id, JSON.stringify(np.photos));
    setForm({ name: "", relation: "", note: "", photos: [], shape: "oval" });
  };
  const removePerson = (id) => {
    const list = people.filter((p) => p.id !== id).map((p) => ({ ...p, spouseId: p.spouseId === id ? null : p.spouseId, parentId: p.parentId === id ? null : p.parentId }));
    commit(list); sdel("familiar:photos:" + id); setEditingId(null);
  };
  const makeMain = (id, photoId) => {
    const p = people.find((x) => x.id === id); if (!p) return;
    const ph = p.photos.find((x) => x.id === photoId); if (!ph) return;
    updatePerson(id, { photos: [ph, ...p.photos.filter((x) => x.id !== photoId)] });
  };
  const setPartner = (id, value) => {
    const list = people.map((p) => ({ ...p }));
    const me = list.find((p) => p.id === id); if (!me) return;
    if (me.spouseId && me.spouseId !== "mom") { const o = list.find((p) => p.id === me.spouseId); if (o) o.spouseId = null; }
    if (value && value !== "mom") {
      const np = list.find((p) => p.id === value);
      if (np) { if (np.spouseId && np.spouseId !== "mom") { const npo = list.find((p) => p.id === np.spouseId); if (npo) npo.spouseId = null; } np.spouseId = id; }
    }
    me.spouseId = value || null;
    commit(list);
  };

  const cropForPerson = (id, src) => { const p = people.find((x) => x.id === id); setCrop({ target: id, photoId: null, isNew: true, src, zoom: 1, ox: 50, oy: 50, shape: p ? p.shape : "oval", name: p && p.name, c1: p && p.c1, c2: p && p.c2 }); };
  const cropEdit = (id, ph) => { const p = people.find((x) => x.id === id); setCrop({ target: id, photoId: ph.id, isNew: false, src: ph.src, zoom: ph.zoom, ox: ph.ox, oy: ph.oy, shape: p ? p.shape : "oval", name: p && p.name, c1: p && p.c1, c2: p && p.c2 }); };
  const cropForForm = (src) => setCrop({ target: "form", photoId: null, isNew: true, src, zoom: 1, ox: 50, oy: 50, shape: form.shape || "oval", name: form.name || "New", c1: "#B7AE9E", c2: "#8C8475" });

  const saveCrop = () => {
    const cs = crop;
    const obj = { id: cs.photoId || ("ph" + Date.now()), src: cs.src, zoom: cs.zoom, ox: cs.ox, oy: cs.oy };
    if (cs.target === "form") { setForm((f) => ({ ...f, photos: [obj], shape: cs.shape })); }
    else {
      const p = people.find((x) => x.id === cs.target);
      if (p) { let photos = p.photos ? [...p.photos] : []; if (cs.isNew) { if (photos.length < 5) photos.push(obj); } else { photos = photos.map((ph) => ph.id === obj.id ? obj : ph); } updatePerson(cs.target, { photos, shape: cs.shape }); }
    }
    setCrop(null);
  };
  const removeCrop = () => { const cs = crop; if (cs.target !== "form") { const p = people.find((x) => x.id === cs.target); if (p) updatePerson(cs.target, { photos: p.photos.filter((ph) => ph.id !== cs.photoId) }); } setCrop(null); };
  const copyLink = async () => { try { await navigator.clipboard.writeText("ourfamilyfaces.com/c/MARY-7Q2K"); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {} };

  if (!authReady) return (<><style>{CSS}</style><div className="app"><div className="loader">Loading…</div></div></>);
  if (!session) return (<><style>{CSS}</style><SignIn /></>);
  if (loading) return (<><style>{CSS}</style><div className="app"><div className="loader">Setting up…</div></div></>);
  const person = people[Math.min(idx, people.length - 1)] || people[0];
  const editingPerson = people.find((p) => p.id === editingId);
  const fp = person && person.photos && person.photos.length ? person.photos[Math.min(focusPhoto, person.photos.length - 1)] : null;

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="bar">
          <span className="barLabel">Preview · she never sees this bar</span>
          <div className="seg">
            <button className={"segBtn" + (side === "user" ? " on" : "")} onClick={() => { setSide("user"); setUserView("grid"); }}>Her screen</button>
            <button className={"segBtn" + (side === "family" ? " on" : "")} onClick={() => setSide("family")}>Family</button>
          </div>
        </div>

        <div className="stage">
          {side === "user" && userView === "grid" && (
            <div className="scroll">
              <p className="eyebrow">Our Family Faces</p>
              <h2 className="header">The people who love you</h2>
              <div className="grid">
                {people.map((p) => (
                  <button key={p.id} className="card" onClick={() => openPerson(p.id)}>
                    <Frame person={p} photo={p.photos && p.photos[0]} size={132} />
                    <span className="cardName">{p.name}</span>
                    <span className="cardRel">{p.relation}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {side === "user" && userView === "focus" && person && (
            <div className="focus" key={person.id}>
              <div className="focusTop"><button className="back" onClick={() => setUserView("grid")}>‹ Everyone</button></div>
              <div className="focusBody">
                <p className="relation">{person.relation}</p>
                <div onClick={() => person.photos && person.photos.length > 1 && setFocusPhoto((focusPhoto + 1) % person.photos.length)} style={{ cursor: person.photos && person.photos.length > 1 ? "pointer" : "default" }}>
                  <Frame person={person} photo={fp} size={300} />
                </div>
                <h1 className="name">{person.name}</h1>
                {person.note && <p className="note">{person.note}</p>}
                {person.photos && person.photos.length > 1 && <p className="photoCount">{Math.min(focusPhoto, person.photos.length - 1) + 1} / {person.photos.length} · tap photo for more</p>}
                <div className="dots">{people.map((_, i) => <span key={i} className={"dot" + (i === idx ? " on" : "")} />)}</div>
                <div className="nav">
                  <button className="round" onClick={() => move(-1)} aria-label="Previous">‹</button>
                  <button className="round" onClick={() => move(1)} aria-label="Next">›</button>
                </div>
              </div>
            </div>
          )}

          {side === "family" && (
            <div className="scroll">
              <p className="eyebrow">Family <button className="signout" onClick={() => supabase.auth.signOut()}>Sign out</button></p>
              <h2 className="header">Mom's circle</h2>
              <div className="seg famSeg">
                <button className={"segBtn" + (famView === "people" ? " on" : "")} onClick={() => setFamView("people")}>People</button>
                <button className={"segBtn" + (famView === "tree" ? " on" : "")} onClick={() => setFamView("tree")}>Tree</button>
                <button className={"segBtn" + (famView === "invite" ? " on" : "")} onClick={() => setFamView("invite")}>Invite</button>
              </div>

              {famView === "people" && (
                <>
                  <p className="sub">Tap a person to open their photos and set their family links (partner, and whose child they are).</p>
                  <div className="adminList">
                    {people.map((p) => (
                      <div key={p.id} className="row" onClick={() => setEditingId(p.id)} style={{ cursor: "pointer" }}>
                        <Frame person={p} photo={p.photos && p.photos[0]} size={56} />
                        <div className="rowText"><span className="rowName">{p.name}</span><span className="rowRel">{p.relation}{p.photos && p.photos.length ? " · " + p.photos.length + " photo" + (p.photos.length > 1 ? "s" : "") : ""}</span></div>
                        <span className="rowChev">›</span>
                      </div>
                    ))}
                  </div>
                  <div className="addCard">
                    <p className="addTitle">Add someone</p>
                    <div className="addPhotoRow">
                      <Frame person={{ name: form.name || "?", shape: form.shape, c1: "#B7AE9E", c2: "#8C8475" }} photo={form.photos && form.photos[0]} size={64} />
                      <Uploader className="choose" onPick={cropForForm}>{form.photos && form.photos.length ? "Change photo" : "Choose photo"}</Uploader>
                    </div>
                    <label className="field"><span>Their name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Father Pat" /></label>
                    <label className="field"><span>How they're related to Mom</span><input value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} placeholder="e.g. Her priest" /></label>
                    <label className="field"><span>A little note (optional)</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Visits every month" /></label>
                    <button className="add" onClick={addPerson}>Add to the circle</button>
                    <p className="soon">After adding, tap them to add photos and set who they're married to or a child of.</p>
                  </div>
                </>
              )}

              {famView === "tree" && (
                <>
                  <p className="sub">Couples sit together; lines descend to their children and on down the generations. Tap a face to preview how she'll see them.</p>
                  <Tree people={people} onPick={openPerson} />
                  <p className="treeHint">Set who's married and whose child is whose inside each person (People → tap a person → Family links).</p>
                </>
              )}

              {famView === "invite" && (
                <>
                  <p className="sub">Send one link to the whole family. Anyone opens it on their own phone and adds a photo — no account, no app to install.</p>
                  <div className="inviteCard">
                    <div className="qrBox"><span>QR code</span><small>scannable code appears here in the live app</small></div>
                    <div className="linkRow"><code className="link">ourfamilyfaces.com/c/MARY-7Q2K</code><button className="copy" onClick={copyLink}>{copied ? "Copied" : "Copy"}</button></div>
                    <button className="ghost" onClick={() => setContrib({ open: true, sent: false, name: "", relation: "", photo: null })}>Preview what they see →</button>
                    <p className="soon">Preview only here. In the live version this syncs to your family's private space and new photos land in People for you to approve.</p>
                  </div>
                  {contrib.open && (
                    <div className="contrib">
                      {!contrib.sent ? (
                        <>
                          <p className="eyebrow">From a family member's phone</p>
                          <h3 className="contribH">Add yourself to Mary's circle</h3>
                          <div className="addPhotoRow">
                            <Frame person={{ name: contrib.name || "?", shape: "oval", c1: "#9DB0A8", c2: "#6E847B" }} photo={contrib.photo ? { src: contrib.photo, zoom: 1, ox: 50, oy: 50 } : null} size={64} />
                            <Uploader className="choose" onPick={(d) => setContrib({ ...contrib, photo: d })}>{contrib.photo ? "Change photo" : "Take / choose photo"}</Uploader>
                          </div>
                          <label className="field"><span>Your name</span><input value={contrib.name} onChange={(e) => setContrib({ ...contrib, name: e.target.value })} placeholder="e.g. Hannah" /></label>
                          <label className="field"><span>How you're related to Mary</span><input value={contrib.relation} onChange={(e) => setContrib({ ...contrib, relation: e.target.value })} placeholder="e.g. Her granddaughter" /></label>
                          <button className="add" onClick={() => setContrib({ ...contrib, sent: true })}>Send to the family</button>
                          <button className="ghost" onClick={() => setContrib({ ...contrib, open: false })}>Close preview</button>
                        </>
                      ) : (
                        <div className="thanks">
                          <div className="check">✓</div>
                          <p className="thanksH">Thank you{contrib.name ? ", " + contrib.name : ""}!</p>
                          <p className="thanksP">Mary's family will see your photo soon.</p>
                          <button className="ghost" onClick={() => setContrib({ open: false, sent: false, name: "", relation: "", photo: null })}>Close preview</button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {editingPerson && (
        <PersonEditor person={editingPerson} all={people} onClose={() => setEditingId(null)}
          onAddPhoto={(src) => cropForPerson(editingPerson.id, src)}
          onEditPhoto={(ph) => cropEdit(editingPerson.id, ph)}
          onMakeMain={(pid) => makeMain(editingPerson.id, pid)}
          onField={(k, v) => updatePerson(editingPerson.id, { [k]: v })}
          onSetPartner={(v) => setPartner(editingPerson.id, v)}
          onSetParent={(v) => updatePerson(editingPerson.id, { parentId: v || null })}
          onRemovePerson={() => removePerson(editingPerson.id)} />
      )}
      {crop && <CropEditor state={crop} onChange={(patch) => setCrop((c) => ({ ...c, ...patch }))} onSave={saveCrop} onCancel={() => setCrop(null)} onRemove={!crop.isNew ? removeCrop : undefined} />}
    </>
  );
}

// ── True family tree: build couple/single "units", lay out by generation ──
function Tree({ people, onPick }) {
  const NR = 24, D = 48, CG = 16, HGAP = 30, VGAP = 98, TOP = 38, SIDE = 28;
  const all = [MOM, ...people];
  const map = {}; all.forEach((p) => (map[p.id] = p));
  const assigned = new Set(), units = [], unitOf = {};
  all.forEach((p) => {
    if (assigned.has(p.id)) return;
    const sp = p.spouseId ? map[p.spouseId] : null;
    if (sp && !assigned.has(sp.id) && sp.id !== p.id) {
      const u = { id: "u_" + p.id, members: [p, sp], children: [] };
      units.push(u); assigned.add(p.id); assigned.add(sp.id); unitOf[p.id] = u; unitOf[sp.id] = u;
    } else { const u = { id: "u_" + p.id, members: [p], children: [] }; units.push(u); assigned.add(p.id); unitOf[p.id] = u; }
  });
  const childIds = new Set();
  all.forEach((p) => {
    if (!p.parentId) return;
    const pu = unitOf[p.parentId], cu = unitOf[p.id];
    if (pu && cu && pu !== cu && !pu.children.includes(cu)) { pu.children.push(cu); childIds.add(cu.id); }
  });
  const roots = units.filter((u) => !childIds.has(u.id));
  const uW = (u) => (u.members.length === 2 ? 2 * D + CG : D);

  let cursor = 0; const seen = new Set();
  const first = (u, depth) => {
    if (seen.has(u.id)) return; seen.add(u.id);
    u.depth = depth; u.cy = TOP + depth * VGAP + NR;
    if (!u.children.length) { u.x = cursor + uW(u) / 2; cursor += uW(u) + HGAP; }
    else { u.children.forEach((c) => first(c, depth + 1)); const xs = u.children.map((c) => c.x); u.x = (Math.min(...xs) + Math.max(...xs)) / 2; }
  };
  roots.forEach((r) => first(r, 0));

  // member node positions
  const nodes = []; const links = [];
  units.forEach((u) => {
    if (u.x == null) return;
    if (u.members.length === 2) {
      const lx = u.x - (D + CG) / 2, rx = u.x + (D + CG) / 2;
      nodes.push({ p: u.members[0], cx: lx, cy: u.cy }); nodes.push({ p: u.members[1], cx: rx, cy: u.cy });
      links.push({ type: "m", x1: lx, y1: u.cy, x2: rx, y2: u.cy });
    } else nodes.push({ p: u.members[0], cx: u.x, cy: u.cy });
    if (u.children.length) {
      const startY = u.members.length === 2 ? u.cy : u.cy + NR;
      const busY = u.cy + VGAP * 0.5;
      links.push({ type: "d", x1: u.x, y1: startY, x2: u.x, y2: busY });
      const cxs = u.children.map((c) => c.x);
      if (u.children.length > 1) links.push({ type: "d", x1: Math.min(...cxs), y1: busY, x2: Math.max(...cxs), y2: busY });
      u.children.forEach((c) => links.push({ type: "d", x1: c.x, y1: busY, x2: c.x, y2: c.cy - NR }));
    }
  });

  if (!nodes.length) return null;
  const minX = Math.min(...nodes.map((n) => n.cx)) - NR, maxX = Math.max(...nodes.map((n) => n.cx)) + NR;
  const maxY = Math.max(...nodes.map((n) => n.cy));
  const W = (maxX - minX) + 2 * SIDE, H = maxY + NR + 26 + 14;
  const tx = SIDE - minX;

  const NodeG = ({ n }) => {
    const p = n.p, square = p.shape === "square", photo = p.photos && p.photos[0], clip = "tc-" + p.id;
    const tap = p.id !== "mom";
    return (
      <g onClick={() => tap && onPick(p.id)} style={{ cursor: tap ? "pointer" : "default" }}>
        <clipPath id={clip}>{square ? <rect x={n.cx - NR} y={n.cy - NR} width={2 * NR} height={2 * NR} rx={NR * 0.32} /> : <circle cx={n.cx} cy={n.cy} r={NR} />}</clipPath>
        {square
          ? <rect x={n.cx - NR} y={n.cy - NR} width={2 * NR} height={2 * NR} rx={NR * 0.32} className="nodeC" fill={photo ? "#fff" : `url(#tg-${p.id})`} />
          : <circle cx={n.cx} cy={n.cy} r={NR} className="nodeC" fill={photo ? "#fff" : `url(#tg-${p.id})`} />}
        {photo
          ? <image href={photo.src} x={n.cx - NR} y={n.cy - NR} width={2 * NR} height={2 * NR} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
          : <text x={n.cx} y={n.cy + NR * 0.18} className="nodeInit" fontSize={NR * 0.55} textAnchor="middle">{initials(p.name)}</text>}
        <text x={n.cx} y={n.cy + NR + 15} className="nodeLabel" fontSize="11" textAnchor="middle">{p.name}</text>
      </g>
    );
  };

  return (
    <div className="treeWrap">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: "auto" }}>
        <defs>{nodes.map((n) => (
          <radialGradient key={n.p.id} id={"tg-" + n.p.id} cx="30%" cy="25%"><stop offset="0%" stopColor={n.p.c1} /><stop offset="100%" stopColor={n.p.c2} /></radialGradient>))}</defs>
        <g transform={`translate(${tx},0)`}>
          {links.map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={l.type === "m" ? "mlink" : "link"} />)}
          {nodes.map((n) => <NodeG key={n.p.id} n={n} />)}
        </g>
      </svg>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Nunito:wght@400;600;700;800&display=swap');
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
:root{ --paper:#F3EDE3; --card:#FCF9F3; --ink:#2C271F; --soft:#6B6358; --sage:#557A6C; --honey:#9E6B1E; --line:#E4DACB;
  font-family:'Nunito',system-ui,-apple-system,sans-serif; color:var(--ink); }
.app{ background:var(--paper); min-height:100vh; display:flex; flex-direction:column; }
.loader{ flex:1; display:grid; place-items:center; min-height:60vh; color:var(--soft); font-size:18px; }
@media (prefers-reduced-motion: no-preference){
  .card,.round,.add,.back,.copy{ transition:transform .18s ease, box-shadow .18s ease; }
  .focus,.contrib,.modal{ animation:fadeIn .26s ease both; }
  @keyframes fadeIn{ from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:none;} } }
.bar{ display:flex; flex-wrap:wrap; gap:8px 14px; align-items:center; justify-content:space-between; padding:10px 16px; background:#EBE3D5; border-bottom:1px solid var(--line); }
.barLabel{ font-size:12px; letter-spacing:.04em; color:var(--soft); text-transform:uppercase; }
.seg{ display:flex; gap:4px; background:#DED4C3; padding:4px; border-radius:12px; }
.segBtn{ border:0; background:transparent; font:inherit; font-weight:700; font-size:13px; color:var(--soft); padding:7px 13px; border-radius:9px; cursor:pointer; }
.segBtn.on{ background:var(--card); color:var(--ink); box-shadow:0 1px 3px rgba(0,0,0,.08); }
.famSeg{ width:max-content; margin:2px 0 18px; }
.stage{ flex:1; display:flex; }
.scroll{ flex:1; overflow:auto; padding:28px 22px 48px; max-width:760px; margin:0 auto; width:100%; }
.eyebrow{ font-family:'Fraunces',serif; font-size:15px; color:var(--honey); margin:0 0 4px; font-style:italic; }
.saved{ font-style:normal; font-family:'Nunito'; font-size:12px; color:var(--sage); }
.header{ font-family:'Fraunces',serif; font-weight:600; font-size:30px; line-height:1.15; margin:0 0 6px; }
.sub{ color:var(--soft); font-size:16px; margin:4px 0 22px; }
.frame{ overflow:hidden; flex:none; position:relative; background:#ece6da; box-shadow:0 6px 20px rgba(60,45,25,.18), inset 0 0 0 4px rgba(255,255,255,.4); }
.frame.ph{ display:grid; place-items:center; color:#fff; font-weight:800; }
.grid{ display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }
@media(min-width:620px){ .grid{ grid-template-columns:repeat(3,1fr); } }
.card{ background:var(--card); border:1px solid var(--line); border-radius:22px; padding:22px 14px 18px; display:flex; flex-direction:column; align-items:center; gap:10px; cursor:pointer; font:inherit; }
.card:active{ transform:scale(.98); }
.cardName{ font-family:'Fraunces',serif; font-weight:600; font-size:22px; }
.cardRel{ font-size:14px; color:var(--honey); }
.focus{ flex:1; display:flex; flex-direction:column; }
.focusTop{ padding:16px 16px 0; }
.back{ border:1px solid var(--line); background:var(--card); font:inherit; font-weight:700; font-size:18px; color:var(--ink); padding:12px 20px; border-radius:999px; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,.06); }
.back:active{ transform:scale(.97); }
.focusBody{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:10px 20px 44px; gap:14px; }
.relation{ font-family:'Fraunces',serif; font-style:italic; font-size:22px; color:var(--honey); margin:0; }
.name{ font-family:'Fraunces',serif; font-weight:600; font-size:46px; margin:6px 0 0; }
.note{ font-size:19px; color:var(--soft); margin:2px 0 0; max-width:420px; }
.photoCount{ color:var(--soft); font-size:14px; margin:0; }
.dots{ display:flex; gap:8px; margin-top:6px; }
.dot{ width:9px; height:9px; border-radius:50%; background:#D6CAB7; } .dot.on{ background:var(--sage); }
.nav{ display:flex; gap:26px; margin-top:10px; }
.round{ width:74px; height:74px; border-radius:50%; border:1px solid var(--line); background:var(--card); font-size:34px; color:var(--ink); cursor:pointer; box-shadow:0 3px 10px rgba(0,0,0,.07); line-height:1; }
.round:active{ transform:scale(.94); }
.treeWrap{ display:flex; flex-direction:column; padding:4px 0 6px; overflow-x:auto; }
.link{ stroke:#CDBFA8; stroke-width:2; fill:none; }
.mlink{ stroke:var(--honey); stroke-width:3; fill:none; }
.nodeC{ stroke:#fff; stroke-width:3; }
.nodeInit{ fill:#fff; font-family:'Nunito'; font-weight:800; }
.nodeLabel{ fill:var(--ink); font-family:'Nunito'; font-weight:700; }
.treeHint{ color:var(--soft); font-size:14px; margin:10px 2px 0; line-height:1.5; }
.adminList{ display:flex; flex-direction:column; gap:10px; margin-bottom:26px; }
.row{ display:flex; align-items:center; gap:14px; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:10px 14px; }
.rowText{ display:flex; flex-direction:column; flex:1; } .rowName{ font-weight:800; font-size:17px; } .rowRel{ font-size:14px; color:var(--honey); }
.rowChev{ color:var(--soft); font-size:24px; }
.addCard,.inviteCard,.contrib{ background:var(--card); border:1px solid var(--line); border-radius:20px; padding:20px; }
.addTitle{ font-family:'Fraunces',serif; font-size:20px; font-weight:600; margin:0 0 14px; }
.addPhotoRow{ display:flex; align-items:center; gap:16px; margin-bottom:16px; }
.choose{ border:1px solid var(--sage); color:var(--sage); font:inherit; font-weight:700; font-size:15px; padding:11px 16px; border-radius:12px; background:#fff; }
.field{ display:flex; flex-direction:column; gap:5px; margin-bottom:14px; }
.field span{ font-size:14px; font-weight:700; color:var(--soft); }
.field input,.select{ font:inherit; font-size:16px; padding:13px 14px; border:1px solid var(--line); border-radius:12px; background:#fff; color:var(--ink); }
.field input:focus,.select:focus{ outline:2px solid var(--sage); outline-offset:1px; }
.select{ appearance:none; -webkit-appearance:none; }
.add{ width:100%; border:0; background:var(--sage); color:#fff; font:inherit; font-weight:800; font-size:17px; padding:15px; border-radius:14px; cursor:pointer; margin-top:2px; }
.add:active{ transform:scale(.99); }
.ghost{ width:100%; border:0; background:transparent; color:var(--soft); font:inherit; font-weight:700; font-size:15px; padding:13px; cursor:pointer; margin-top:8px; }
.soon{ font-size:13px; color:var(--soft); margin:16px 0 0; line-height:1.5; }
.qrBox{ width:148px; height:148px; margin:0 auto 16px; border:2px dashed var(--line); border-radius:16px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; color:var(--soft); text-align:center; }
.qrBox span{ font-weight:800; } .qrBox small{ font-size:11px; padding:0 10px; line-height:1.35; }
.linkRow{ display:flex; gap:8px; align-items:center; }
.link{} code.link{ flex:1; background:#fff; border:1px solid var(--line); border-radius:12px; padding:13px 14px; font-family:'Nunito'; font-size:15px; color:var(--ink); overflow:hidden; }
.copy{ border:0; background:var(--ink); color:#fff; font:inherit; font-weight:700; font-size:15px; padding:13px 18px; border-radius:12px; cursor:pointer; }
.contrib{ margin-top:16px; border-color:var(--sage); }
.contribH{ font-family:'Fraunces',serif; font-weight:600; font-size:22px; margin:2px 0 16px; }
.thanks{ text-align:center; padding:14px 0; }
.check{ width:60px; height:60px; border-radius:50%; background:var(--sage); color:#fff; font-size:30px; display:grid; place-items:center; margin:0 auto 12px; }
.thanksH{ font-family:'Fraunces',serif; font-size:22px; font-weight:600; margin:0 0 4px; }
.thanksP{ color:var(--soft); margin:0 0 6px; }
.modalWrap{ position:fixed; inset:0; background:rgba(36,30,22,.5); display:flex; align-items:center; justify-content:center; padding:18px; z-index:60; }
.modal{ background:var(--card); border-radius:22px; padding:22px; width:100%; max-width:360px; }
.cropStage{ display:flex; justify-content:center; padding:8px 0 4px; }
.cropHint{ text-align:center; color:var(--soft); font-size:14px; margin:8px 0 16px; }
.sliderRow{ display:flex; align-items:center; gap:12px; margin-bottom:16px; }
.sliderRow span{ font-weight:700; color:var(--soft); font-size:14px; width:46px; }
.sliderRow input[type=range]{ flex:1; accent-color:var(--sage); height:30px; }
.shapeRow{ display:flex; align-items:center; gap:12px; margin-bottom:18px; }
.shapeLabel{ font-weight:700; color:var(--soft); font-size:14px; width:46px; }
.sheetWrap{ position:fixed; inset:0; background:var(--paper); z-index:55; overflow:auto; }
.sheet{ width:100%; max-width:620px; margin:0 auto; padding:16px 20px 48px; }
.editPreview{ display:flex; justify-content:center; padding:10px 0 4px; }
.thumbsLabel{ font-weight:800; font-size:14px; color:var(--soft); margin:8px 0 10px; }
.thumbs{ display:flex; flex-wrap:wrap; gap:14px; margin-bottom:22px; align-items:flex-start; }
.thumb{ display:flex; flex-direction:column; align-items:center; gap:6px; width:64px; }
.thumbBtn{ border:0; background:none; padding:0; cursor:pointer; }
.tlink{ border:0; background:none; color:var(--sage); font:inherit; font-size:12px; font-weight:700; cursor:pointer; text-decoration:underline; }
.mainTag{ font-size:12px; font-weight:700; color:var(--honey); }
.addTile{ width:64px; height:64px; border:2px dashed var(--line); border-radius:14px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--soft); font-size:22px; font-weight:800; }
.addTile small{ font-size:11px; font-weight:700; }
.signinWrap{ min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; background:var(--paper); }
.signinCard{ background:var(--card); border:1px solid var(--line); border-radius:22px; padding:28px 24px; width:100%; max-width:420px; }
.signinCard .header{ margin-top:4px; }
.signerr{ color:#9C3B2E; font-size:14px; margin:0 0 12px; }
.signout{ border:1px solid var(--line); background:var(--card); color:var(--soft); font:inherit; font-family:'Nunito'; font-style:normal; font-weight:700; font-size:12px; padding:4px 10px; border-radius:999px; cursor:pointer; margin-left:4px; }
`;
