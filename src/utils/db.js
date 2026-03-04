import { openDB } from 'idb'

const DB_NAME = 'biro-test2'
const DB_VERSION = 1

let dbInstance = null

export async function initDB() {
  if (dbInstance) return dbInstance
  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Tests store
      if (!db.objectStoreNames.contains('tests')) {
        const ts = db.createObjectStore('tests', { keyPath: 'id' })
        ts.createIndex('createdAt', 'createdAt')
        ts.createIndex('shareCode', 'shareCode')
      }
      // Attempts store
      if (!db.objectStoreNames.contains('attempts')) {
        const as = db.createObjectStore('attempts', { keyPath: 'id' })
        as.createIndex('testId', 'testId')
        as.createIndex('createdAt', 'createdAt')
      }
      // Mistake book
      if (!db.objectStoreNames.contains('mistakes')) {
        const ms = db.createObjectStore('mistakes', { keyPath: 'id' })
        ms.createIndex('subject', 'subject')
        ms.createIndex('chapter', 'chapter')
        ms.createIndex('testId', 'testId')
      }
      // Chat messages
      if (!db.objectStoreNames.contains('chats')) {
        const cs = db.createObjectStore('chats', { keyPath: 'id' })
        cs.createIndex('testId', 'testId')
        cs.createIndex('createdAt', 'createdAt')
      }
      // Settings
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
      // Weekly plans
      if (!db.objectStoreNames.contains('plans')) {
        const ps = db.createObjectStore('plans', { keyPath: 'id' })
        ps.createIndex('createdAt', 'createdAt')
      }
    }
  })
  return dbInstance
}

export async function getDB() {
  if (!dbInstance) await initDB()
  return dbInstance
}

// ─── TESTS ───────────────────────────────────────────────
export async function saveTest(test) {
  const db = await getDB()
  await db.put('tests', { ...test, updatedAt: Date.now() })
}

export async function getTest(id) {
  const db = await getDB()
  return db.get('tests', id)
}

export async function getAllTests() {
  const db = await getDB()
  const all = await db.getAll('tests')
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteTest(id) {
  const db = await getDB()
  await db.delete('tests', id)
}

export async function getTestByShareCode(code) {
  const db = await getDB()
  const idx = db.transaction('tests').store.index('shareCode')
  return idx.get(code)
}

// ─── ATTEMPTS ────────────────────────────────────────────
export async function saveAttempt(attempt) {
  const db = await getDB()
  await db.put('attempts', { ...attempt, updatedAt: Date.now() })
}

export async function getAttempt(id) {
  const db = await getDB()
  return db.get('attempts', id)
}

export async function getAttemptsByTest(testId) {
  const db = await getDB()
  const idx = db.transaction('attempts').store.index('testId')
  const all = await idx.getAll(testId)
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getAllAttempts() {
  const db = await getDB()
  const all = await db.getAll('attempts')
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

// ─── MISTAKES ────────────────────────────────────────────
export async function saveMistake(mistake) {
  const db = await getDB()
  await db.put('mistakes', mistake)
}

export async function getAllMistakes() {
  const db = await getDB()
  const all = await db.getAll('mistakes')
  return all.sort((a, b) => b.addedAt - a.addedAt)
}

export async function deleteMistake(id) {
  const db = await getDB()
  await db.delete('mistakes', id)
}

// ─── SETTINGS ────────────────────────────────────────────
export async function getSetting(key) {
  const db = await getDB()
  const row = await db.get('settings', key)
  return row ? row.value : null
}

export async function setSetting(key, value) {
  const db = await getDB()
  await db.put('settings', { key, value })
}

// ─── PLANS ───────────────────────────────────────────────
export async function savePlan(plan) {
  const db = await getDB()
  await db.put('plans', plan)
}

export async function getAllPlans() {
  const db = await getDB()
  const all = await db.getAll('plans')
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

// ─── CHAT ─────────────────────────────────────────────────
export async function saveChatMsg(msg) {
  const db = await getDB()
  await db.put('chats', msg)
}

export async function getChatByTest(testId) {
  const db = await getDB()
  const idx = db.transaction('chats').store.index('testId')
  const all = await idx.getAll(testId)
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

// ─── EXPORT / IMPORT ─────────────────────────────────────
export async function exportAllData() {
  const db = await getDB()
  const [tests, attempts, mistakes, plans] = await Promise.all([
    db.getAll('tests'),
    db.getAll('attempts'),
    db.getAll('mistakes'),
    db.getAll('plans')
  ])
  return { tests, attempts, mistakes, plans, exportedAt: Date.now() }
}

export async function importAllData(data) {
  const db = await getDB()
  const tx = db.transaction(['tests','attempts','mistakes','plans'], 'readwrite')
  for (const t of (data.tests   || [])) tx.objectStore('tests').put(t)
  for (const a of (data.attempts|| [])) tx.objectStore('attempts').put(a)
  for (const m of (data.mistakes|| [])) tx.objectStore('mistakes').put(m)
  for (const p of (data.plans   || [])) tx.objectStore('plans').put(p)
  await tx.done
    }
