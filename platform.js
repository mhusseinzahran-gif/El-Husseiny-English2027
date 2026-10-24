// منصة El Husseiny English - الملف المشترك لكل الصفحات (Firebase)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence, collection, doc, getDoc, getDocs, setDoc, query, where };

// ===== أسماء المجموعات في قاعدة البيانات =====
export const COL = {
  students: "platform_students",
  groups: "platform_groups",
  lessons: "platform_lessons",
  records: "platform_records",
  online: "platform_online"
};

// ===== نظام الـ Coins (عدّل القيم من هنا فقط) =====
export const COIN_RULES = { attendance: 1, homework: 1, dictation: 1, paper: 1, electronic: 1 };

export const STUDENT_DOMAIN = "students.elhusseiny.app";
export const sKey = (id) => String(id || "").trim().toLowerCase();               // مفتاح الطالب (معرّف المستند)
export const studentEmail = (id) => `${sKey(id)}@${STUDENT_DOMAIN}`;
export const studentPass = (id) => `EH#${String(id || "").trim().toUpperCase()}`;

const num = (v) => { const n = parseFloat(String(v ?? "").split("/")[0]); return isNaN(n) ? 0 : n; };

// يحسب coins الحصة الواحدة من سجل الطالب (الأساسي + مكافأة المعلم)
export function baseCoins(r) {
  if (!r) return 0;
  let c = 0;
  if (r.attendance === "حاضر") c += COIN_RULES.attendance;
  if (r.homework && r.homework !== "لم يسلم") c += COIN_RULES.homework;
  if (String(r.dictation ?? "").trim() !== "" && num(r.dictation) > 0) c += COIN_RULES.dictation;
  if (String(r.paper ?? "").trim() !== "" && num(r.paper) > 0) c += COIN_RULES.paper;
  if (r.electronic === "تم") c += COIN_RULES.electronic;
  return c;
}
export const totalCoins = (r) => baseCoins(r) + (parseFloat(r?.bonus) || 0);

// معرّف حصة ثابت من (القسم + الصف + المجموعة + اسم الحصة) حتى لا تختلط الحصص بين الجروبات
export function lessonId(category, grade, group, name) {
  const s = [category, grade, group, name].join("|");
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = ((h1 * 33) ^ c) >>> 0; h2 = ((h2 * 31) + c) >>> 0; }
  return `${category}_${h1.toString(36)}${h2.toString(36)}`;
}

export function ytEmbed(url) {
  if (!url) return "";
  const m = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : "";
}
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const authReady = () => new Promise((res) => { const u = onAuthStateChanged(auth, (user) => { u(); res(user); }); });
const isStudentUser = (u) => !!u && (u.email || "").endsWith("@" + STUDENT_DOMAIN);

// ===== دخول الطالب بالـ ID =====
export async function studentLogin(id, remember) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  const cred = await signInWithEmailAndPassword(auth, studentEmail(id), studentPass(id));
  const snap = await getDoc(doc(db, COL.students, sKey(id)));
  if (!snap.exists() || snap.data().uid !== cred.user.uid) { await signOut(auth); throw { code: "app/not-found" }; }
  if (snap.data().isBanned) { await signOut(auth); throw { code: "app/banned" }; }
  return snap.data();
}

// يحمّل الطالب المسجل دخوله أو يحوّله لبوابة الدخول
export async function requireStudent() {
  const user = await authReady();
  if (!isStudentUser(user)) { location.replace("gateway.html"); return new Promise(() => {}); }
  try {
    const snap = await getDoc(doc(db, COL.students, user.email.split("@")[0]));
    if (!snap.exists() || snap.data().isBanned) { await signOut(auth); location.replace("gateway.html"); return new Promise(() => {}); }
    return snap.data();
  } catch (e) { location.replace("gateway.html"); return new Promise(() => {}); }
}

export async function logout() { await signOut(auth); location.href = "gateway.html"; }

export async function myRecords(student) {
  const q = query(collection(db, COL.records), where("studentKey", "==", sKey(student.id)));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function myLessons(student, category = "center") {
  const q = query(collection(db, COL.lessons), where("category", "==", category), where("grade", "==", student.grade));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((l) => l.group === "عام" || l.group === student.group)
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
}

export function stageOf(grade) {
  if (/الابتدائي/.test(grade)) return "المرحلة الابتدائية / Primary";
  if (/الإعدادي/.test(grade)) return "المرحلة الإعدادية / Preparatory";
  if (/الثانوي/.test(grade)) return "المرحلة الثانوية / Secondary";
  return "";
}
export function levelOf(coins) {
  if (coins >= 30) return { name: "المستوى الذهبي 🌟", tag: "رصيد ممتاز" };
  if (coins >= 10) return { name: "المستوى الفضي 🥈", tag: "رصيد جيد" };
  return { name: "المستوى البرونزي 🥉", tag: "ابدأ الجمع" };
}

// ===== حسابات الأونلاين =====
export async function onlineLogin(email, pass, remember) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  return signInWithEmailAndPassword(auth, email, pass);
}
export async function onlineSignup(email, pass, name) {
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  await setDoc(doc(db, COL.online, cred.user.uid), { email, name: name || "", active: false, createdAt: new Date() });
  return cred.user;
}
// يعيد { user, active } أو يحوّل للبوابة. الطالب المسجل بالسنتر مع اشتراك أونلاين يُقبل أيضاً.
export async function requireOnline() {
  const user = await authReady();
  if (!user) { location.replace("gateway.html"); return new Promise(() => {}); }
  try {
    if (isStudentUser(user)) {
      const s = await getDoc(doc(db, COL.students, user.email.split("@")[0]));
      const d = s.exists() ? s.data() : null;
      return { user, active: !!(d && d.isPaidOnline && !d.isBanned), name: d?.name || "", grade: d?.grade || "" };
    }
    const o = await getDoc(doc(db, COL.online, user.uid));
    return { user, active: !!(o.exists() && o.data().active), name: o.exists() ? (o.data().name || "") : "", grade: "" };
  } catch (e) { location.replace("gateway.html"); return new Promise(() => {}); }
}
export async function onlineLessons() {
  const snap = await getDocs(query(collection(db, COL.lessons), where("category", "==", "online")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
}
