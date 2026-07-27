// ⚠️ Rellena esto con la config de tu proyecto Firebase "nail-projects"
// (la misma que usas en Fit Diary, Nail Stock, etc.)
const firebaseConfig = {
  apiKey: "AIzaSyBxtl_lc9b6zS-6ld-LMGcBAyk6XjQ7vck",
  authDomain: "nail-projects.firebaseapp.com",
  databaseURL: "https://nail-projects-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "nail-projects",
  storageBucket: "nail-projects.firebasestorage.app",
  messagingSenderId: "923664169473",
  appId: "1:923664169473:web:16f3c712ddd4d3400d9e00"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Todo lo de esta app cuelga de /cronohitos para no chocar con tus otras apps
const ROOT = "cronohitos";

const FirebaseAPI = {

  // ---------- PLANTILLAS ----------
  async getTemplates() {
    const snap = await db.ref(`${ROOT}/templates`).once("value");
    const val = snap.val() || {};
    return Object.entries(val).map(([id, t]) => ({ id, ...t }));
  },

  async saveTemplate(template) {
    if (template.id) {
      const { id, ...data } = template;
      await db.ref(`${ROOT}/templates/${id}`).set(data);
      return id;
    } else {
      const ref = db.ref(`${ROOT}/templates`).push();
      await ref.set(template);
      return ref.key;
    }
  },

  async deleteTemplate(id) {
    await db.ref(`${ROOT}/templates/${id}`).remove();
  },

  // ---------- HISTORIAL ----------
  async getHistory() {
    const snap = await db.ref(`${ROOT}/history`).orderByChild("startedAt").once("value");
    const val = snap.val() || {};
    return Object.entries(val)
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => b.startedAt - a.startedAt);
  },

  async saveSession(session) {
    const ref = db.ref(`${ROOT}/history`).push();
    await ref.set(session);
    return ref.key;
  },

  async deleteSession(id) {
    await db.ref(`${ROOT}/history/${id}`).remove();
  }
};
