import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, BookMarked, Search, Filter,
  Trash2, ChevronRight, Eye, X, BookOpen,
  CheckCircle, XCircle, Zap
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getAllMistakes, deleteMistake } from '../utils/db.js'
import { useStore } from '../store/useStore.js'
import { askAIAboutQuestion } from '../utils/aiExtractor.js'
import { fmtDate } from '../utils/helpers.js'

export default function MistakeBook() {
  const navigate = useNavigate()
  const { apiKey } = useStore()
  const [mistakes, setMistakes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filterSubject, setFilterSubject] = useState('all')
  const [aiExp, setAiExp]       = useState({})
  const [aiLoading, setAiLoading] = useState({})

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const all = await getAllMistakes()
    setMistakes(all)
    setLoading(false)
  }

  const handleDelete = async (id) => {
    await deleteMistake(id)
    setMistakes(m => m.filter(x => x.id !== id))
    toast.success('Removed from Mistake Book')
  }

  const getAIExp = async (m) => {
    if (!apiKey) return toast.error('Set API key in Settings')
    setAiLoading(l => ({...l, [m.id]: true}))
    try {
      const exp = await askAIAboutQuestion(
        { question: m.question, subject: m.subject, chapter: m.chapter, options: m.options },
        m.userAnswer, m.correct, apiKey
      )
      setAiExp(e => ({...e, [m.id]: exp}))
    } catch { toast.error('AI failed') }
    setAiLoading(l => ({...l, [m.id]: false}))
  }

  const subjects = ['all', ...[...new Set(mistakes.map(m => m.subject).filter(Boolean))]]

  const filtered = mistakes.filter(m => {
    const ms = m.question?.toLowerCase().includes(search.toLowerCase()) ||
               m.chapter?.toLowerCase().includes(search.toLowerCase())
    const mf = filterSubject === 'all' || m.subject === filterSubject
    return ms && mf
  })

  return (
    <div className="min-h-dvh bg-gray-50 pb-10">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft size={20}/>
          </button>
          <div className="flex-1">
            <h1 className="font-bold text-gray-900">Mistake Book</h1>
            <p className="text-xs text-gray-500">{mistakes.length} questions saved</p>
          </div>
          <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center">
            <BookMarked size={16} className="text-red-600"/>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search questions or chapters..."
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
        </div>

        {/* Subject filter */}
        <div className="tabs-scroll gap-1.5">
          {subjects.map(s => (
            <button key={s} onClick={() => setFilterSubject(s)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl whitespace-nowrap transition-all
                ${filterSubject === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== 'all' && ` (${mistakes.filter(m=>m.subject===s).length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl h-24 shimmer"/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <BookMarked size={24} className="text-gray-400"/>
            </div>
            <p className="font-semibold text-gray-700">No mistakes saved</p>
            <p className="text-sm text-gray-400 mt-1">Wrong answers will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(m => (
              <MistakeCard key={m.id} m={m}
                aiExp={aiExp[m.id]}
                aiLoading={aiLoading[m.id]}
                onAIExp={() => getAIExp(m)}
                onDelete={() => handleDelete(m.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MistakeCard({ m, aiExp, aiLoading, onAIExp, onDelete }) {
  const [open, setOpen] = useState(false)
  const subjectColor = m.subject === 'Maths' ? 'bg-purple-100 text-purple-700'
    : m.subject === 'Physics' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 p-3 cursor-pointer" onClick={() => setOpen(o=>!o)}>
        <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
          <XCircle size={16} className="text-red-500"/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${subjectColor}`}>{m.subject}</span>
            <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{m.chapter}</span>
          </div>
          <p className="text-sm text-gray-800 line-clamp-2">{m.question}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(m.addedAt)} • {m.testName}</p>
        </div>
        <ChevronRight size={14} className={`text-gray-400 shrink-0 transition-transform ${open?'rotate-90':''}`}/>
      </div>

      {open && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-2 space-y-2">
          {m.pageImage && (
            <img src={m.pageImage} alt="diagram"
              className="w-full rounded-xl max-h-44 object-contain bg-gray-50 border border-gray-200"/>
          )}
          {['A','B','C','D'].map(opt => m.options?.[opt] && (
            <div key={opt} className={`flex gap-2 p-2 rounded-lg text-sm
              ${opt===m.correct?'bg-green-50 border border-green-200':
                opt===m.userAnswer&&opt!==m.correct?'bg-red-50 border border-red-200':'bg-gray-50'}`}>
              <span className={`font-bold w-5 shrink-0
                ${opt===m.correct?'text-green-600':opt===m.userAnswer?'text-red-600':'text-gray-500'}`}>{opt}</span>
              <span className="text-gray-700 text-sm">{m.options[opt]}</span>
              {opt===m.correct && <CheckCircle size={14} className="text-green-500 shrink-0 ml-auto mt-0.5"/>}
              {opt===m.userAnswer && opt!==m.correct && <XCircle size={14} className="text-red-500 shrink-0 ml-auto mt-0.5"/>}
            </div>
          ))}
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-xl">
            <span className="text-xs text-gray-500">Your answer:</span>
            <span className="text-xs font-bold text-red-600">{m.userAnswer || 'Not attempted'}</span>
            <span className="text-xs text-gray-400 mx-1">→</span>
            <span className="text-xs text-gray-500">Correct:</span>
            <span className="text-xs font-bold text-green-600">{m.correct}</span>
          </div>
          {aiExp && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs font-bold text-blue-700 mb-1">🤖 AI Explanation</p>
              <p className="text-xs text-blue-800 leading-relaxed">{aiExp}</p>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={onAIExp} disabled={aiLoading}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-semibold disabled:opacity-50">
              {aiLoading ? '...' : <><Zap size={12}/> AI Explain</>}
            </button>
            <button onClick={onDelete}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-red-50 text-red-600">
              <Trash2 size={14}/>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
