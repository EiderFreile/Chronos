// ⚠️ Rellena esto con la config de tu proyecto Firebase "nail-projects"
// (la misma que usas en Fit Diary, Nail Stock, etc.)
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "nail-projects.firebaseapp.com",
  databaseURL: "https://nail-projects-default-rtdb.firebaseio.com",
  projectId: "nail-projects",
  storageBucket: "nail-projects.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
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
