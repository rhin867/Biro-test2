import { nanoid } from 'nanoid'

// Generate 22-char share code
export function generateShareCode() {
  return nanoid(22)
}

// Format seconds → mm:ss
export function formatTime(seconds) {
  if (!seconds && seconds !== 0) return '--:--'
  const m = Math.floor(Math.abs(seconds) / 60)
  const s = Math.abs(seconds) % 60
  const sign = seconds < 0 ? '-' : ''
  return `${sign}${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

// Format seconds → human readable
export function formatDuration(seconds) {
  if (!seconds) return '0s'
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

// Subject chip color
export function subjectColor(subject) {
  const s = (subject || '').toLowerCase()
  if (s.includes('math') || s.includes('maths')) return 'chip-maths'
  if (s.includes('phys')) return 'chip-physics'
  if (s.includes('chem')) return 'chip-chem'
  return 'bg-gray-100 text-gray-700 text-xs font-semibold px-2 py-0.5 rounded-full'
}

export function subjectBg(subject) {
  const s = (subject || '').toLowerCase()
  if (s.includes('math')) return 'bg-purple-500'
  if (s.includes('phys')) return 'bg-blue-500'
  if (s.includes('chem')) return 'bg-green-500'
  return 'bg-gray-500'
}

// Score color
export function scoreColor(score) {
  if (score > 0)  return 'text-green-600'
  if (score < 0)  return 'text-red-600'
  return 'text-gray-500'
}

// Accuracy color
export function accuracyColor(pct) {
  if (pct >= 70) return 'text-green-600'
  if (pct >= 40) return 'text-orange-500'
  return 'text-red-600'
}

// Date format
export function fmtDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

export function fmtDateTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

// Calculate JEE score
export function calcScore(correct, incorrect, correctMark = 4, wrongMark = 1) {
  return (correct * correctMark) - (incorrect * wrongMark)
}

// Get question status for palette
export function getQStatus(responses, qId, marked) {
  const r = responses[qId]
  const isMarked = marked?.includes(qId)
  if (r !== undefined && r !== null && isMarked) return 'marked-ans'
  if (isMarked) return 'marked'
  if (r !== undefined && r !== null) return 'answered'
  return 'not-visited'
}

// Truncate text
export function truncate(str, n = 60) {
  if (!str) return ''
  return str.length > n ? str.slice(0, n) + '…' : str
}

// Deep clone
export function clone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

// Unique subjects from questions
export function getSubjects(questions = []) {
  return [...new Set(questions.map(q => q.subject).filter(Boolean))]
}

// Group questions by subject
export function groupBySubject(questions = []) {
  return questions.reduce((acc, q) => {
    const s = q.subject || 'Other'
    if (!acc[s]) acc[s] = []
    acc[s].push(q)
    return acc
  }, {})
}

// Group by chapter
export function groupByChapter(questions = []) {
  return questions.reduce((acc, q) => {
    const c = q.chapter || 'General'
    if (!acc[c]) acc[c] = []
    acc[c].push(q)
    return acc
  }, {})
}

// Percentage
export function pct(num, den) {
  if (!den) return 0
  return Math.round((num / den) * 100)
}

// Attempt style label
export function attemptStyleLabel(analysis) {
  if (!analysis) return 'Unknown'
  const { correct, incorrect, skipped } = analysis
  const total = correct + incorrect + skipped
  const accPct = pct(correct, correct + incorrect)
  if (incorrect === 0 && correct > 0) return 'The Perfectionist'
  if (skipped > total * 0.6) return 'The Cautious One'
  if (incorrect > correct * 2) return 'The Gambler'
  if (accPct > 80) return 'The Sharp Shooter'
  if (accPct > 60) return 'The Steady Performer'
  return 'The Explorer'
}

// Mistake type labels
export const MISTAKE_TYPES = [
  { id: 'concept',     label: 'Concept Mistake',          color: 'bg-red-100 text-red-700' },
  { id: 'formula',     label: 'Formula Not Remembered',   color: 'bg-orange-100 text-orange-700' },
  { id: 'silly',       label: 'Silly/Calculation Error',  color: 'bg-yellow-100 text-yellow-700' },
  { id: 'time',        label: 'Time Management',          color: 'bg-blue-100 text-blue-700' },
  { id: 'guess',       label: 'Guessing',                 color: 'bg-purple-100 text-purple-700' },
  { id: 'misread',     label: 'Question Misread',         color: 'bg-pink-100 text-pink-700' },
  { id: 'slow',        label: 'Correct but Slow',         color: 'bg-teal-100 text-teal-700' },
  { id: 'perfect',     label: 'Perfectly Known',          color: 'bg-green-100 text-green-700' }
]
