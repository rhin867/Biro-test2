import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Flag, X, ChevronLeft, ChevronRight,
  Clock, Grid, Send, AlertTriangle,
  CheckCircle, BookOpen
} from 'lucide-react'
import toast from 'react-hot-toast'
import { v4 as uuidv4 } from 'uuid'
import { useStore } from '../store/useStore.js'
import { getTest, saveAttempt } from '../utils/db.js'
import { formatTime, calcScore, getSubjects, pct } from '../utils/helpers.js'

export default function TestEngine() {
  const { testId } = useParams()
  const navigate   = useNavigate()
  const {
    attempt, initAttempt, setResponse, clearResponse,
    toggleMark, markVisited, addTimeToQuestion,
    tickTimer, logSubjectSwitch, submitAttempt
  } = useStore()

  const [test, setTest]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [activeSubject, setActiveSubject] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [submitModal, setSubmitModal] = useState(false)

  const timerRef   = useRef(null)
  const qTimerRef  = useRef(null)
  const qStartRef  = useRef(Date.now())
  const currentQId = useRef(null)

  useEffect(() => {
    loadTest()
    return () => {
      clearInterval(timerRef.current)
      clearInterval(qTimerRef.current)
    }
  }, [testId])

  const loadTest = async () => {
    const t = await getTest(testId)
    if (!t) { toast.error('Test not found'); navigate('/'); return }
    setTest(t)
    const subjects = getSubjects(t.questions)
    setActiveSubject(subjects[0])
    if (attempt.testId !== testId || attempt.status !== 'active') {
      initAttempt(testId, uuidv4(), t.duration)
    }
    setLoading(false)
  }

  // Global countdown timer
  useEffect(() => {
    if (!test || attempt.status !== 'active') return
    timerRef.current = setInterval(() => {
      tickTimer()
      if (attempt.totalTimeLeft <= 1) {
        clearInterval(timerRef.current)
        toast('Time up! Auto-submitting...', { icon: '⏰' })
        doSubmit()
      }
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [test, attempt.status])

  // Per-question timer
  useEffect(() => {
    if (!currentQ) return
    currentQId.current = currentQ.id
    qStartRef.current  = Date.now()
    clearInterval(qTimerRef.current)
    qTimerRef.current = setInterval(() => {
      addTimeToQuestion(currentQId.current, 1)
    }, 1000)
    return () => clearInterval(qTimerRef.current)
  }, [currentIdx, activeSubject])

  if (loading || !test) return <LoadingScreen />

  const subjects  = getSubjects(test.questions)
  const subjectQs = test.questions.filter(q => q.subject === activeSubject)
  const currentQ  = subjectQs[currentIdx]
  const allQ      = test.questions

  const switchSubject = (subj) => {
    if (subj === activeSubject) return
    clearInterval(qTimerRef.current)
    if (currentQ) markVisited(currentQ.id)
    setActiveSubject(subj)
    logSubjectSwitch(subj)
    setCurrentIdx(0)
  }

  const goTo = (idx) => {
    if (currentQ) markVisited(currentQ.id)
    clearInterval(qTimerRef.current)
    setCurrentIdx(idx)
  }

  const handleSelect = (opt) => {
    if (!currentQ) return
    if (attempt.responses[currentQ.id] === opt) clearResponse(currentQ.id)
    else setResponse(currentQ.id, opt)
    markVisited(currentQ.id)
  }

  const handleNext = () => {
    if (currentQ) markVisited(currentQ.id)
    if (currentIdx < subjectQs.length - 1) {
      goTo(currentIdx + 1)
    } else {
      const si = subjects.indexOf(activeSubject)
      if (si < subjects.length - 1) switchSubject(subjects[si + 1])
    }
  }

  const handlePrev = () => {
    if (currentQ) markVisited(currentQ.id)
    if (currentIdx > 0) {
      goTo(currentIdx - 1)
    } else {
      const si = subjects.indexOf(activeSubject)
      if (si > 0) {
        const prev   = subjects[si - 1]
        const prevQs = allQ.filter(q => q.subject === prev)
        setActiveSubject(prev)
        setCurrentIdx(prevQs.length - 1)
      }
    }
  }

  const doSubmit = async () => {
    clearInterval(timerRef.current)
    clearInterval(qTimerRef.current)
    const responses = attempt.responses
    let correct = 0, incorrect = 0, skipped = 0
    allQ.forEach(q => {
      const ans = responses[q.id]
      if (!ans) { skipped++; return }
      if (q.correct) { ans === q.correct ? correct++ : incorrect++ }
    })
    const score = calcScore(correct, incorrect, test.correctMark, test.wrongMark)
    const attData = {
      id: attempt.id, testId, testName: test.name,
      responses, timePerQuestion: attempt.timePerQuestion,
      markedForReview: attempt.markedForReview,
      visitedQuestions: attempt.visitedQuestions,
      subjectSwitches: attempt.subjectSwitches,
      mistakeTags: attempt.mistakeTags, notes: attempt.notes,
      correct, incorrect, skipped, score,
      totalMarks: test.totalMarks,
      accuracy: pct(correct, correct + incorrect),
      timeTaken: test.duration - attempt.totalTimeLeft,
      createdAt: attempt.startedAt || Date.now(),
      submittedAt: Date.now(), questions: allQ
    }
    await saveAttempt(attData)
    submitAttempt()
    setSubmitModal(false)
    navigate(`/analysis/${attempt.id}`)
  }

  const getStatus = (qId) => {
    const answered = attempt.responses[qId] !== undefined
    const marked   = attempt.markedForReview.includes(qId)
    const visited  = attempt.visitedQuestions.includes(qId)
    if (answered && marked) return 'marked-ans'
    if (marked)   return 'marked'
    if (answered) return 'answered'
    if (visited)  return 'not-answered'
    return 'not-visited'
  }

  const statusStyle = (s) => ({
    'answered':     'bg-green-500 text-white',
    'not-answered': 'bg-red-500 text-white',
    'marked':       'bg-purple-500 text-white',
    'marked-ans':   'bg-purple-500 text-white ring-2 ring-green-400',
    'not-visited':  'bg-gray-100 text-gray-600 border border-gray-300'
  }[s] || 'bg-gray-100 text-gray-600')

  const answeredCount = Object.keys(attempt.responses).length
  const markedCount   = attempt.markedForReview.length
  const unanswered    = allQ.length - answeredCount
  const timeLeft      = attempt.totalTimeLeft

  const subjectCounts = subjects.reduce((acc, s) => {
    acc[s] = allQ.filter(q => q.subject === s && attempt.responses[q.id]).length
    return acc
  }, {})

  return (
    <div className="cbt-root bg-white flex flex-col">

      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20 shrink-0">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">BT</span>
            </div>
            <p className="font-bold text-gray-900 text-xs truncate max-w-[120px]">{test.name}</p>
          </div>

          {/* Timer */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-mono font-bold text-sm
            ${timeLeft < 300 ? 'bg-red-50 border-red-300 text-red-600 animate-pulse'
            : timeLeft < 600 ? 'bg-orange-50 border-orange-300 text-orange-600'
            : 'bg-gray-50 border-gray-200 text-gray-800'}`}>
            <Clock size={13}/>
            {formatTime(timeLeft)}
          </div>

          <button onClick={() => setSubmitModal(true)}
            className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-xl">
            <Send size={13}/> Submit
          </button>
        </div>

        {/* Subject tabs */}
        <div className="flex border-t border-gray-100">
          {subjects.map(s => (
            <button key={s} onClick={() => switchSubject(s)}
              className={`flex-1 py-2 text-xs font-semibold transition-all border-b-2
                ${activeSubject === s
                  ? 'border-blue-600 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {s} ({subjectCounts[s]}/{allQ.filter(q => q.subject === s).length})
            </button>
          ))}
        </div>
      </div>

      {/* Question Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-28">
        {/* Q header */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0">
            {currentIdx + 1}
          </div>
          <span className="text-xs text-gray-500">Q {currentIdx + 1}/{subjectQs.length}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
            ${activeSubject==='Maths'?'bg-purple-100 text-purple-700'
            :activeSubject==='Physics'?'bg-blue-100 text-blue-700'
            :'bg-green-100 text-green-700'}`}>
            {activeSubject}
          </span>
          {currentQ?.chapter && (
            <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {currentQ.chapter}
            </span>
          )}
        </div>

        {/* Question box */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 shadow-sm">
          <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
            {currentQ?.question}
          </p>
          {currentQ?.hasDiagram && currentQ?.pageImage && (
            <img src={currentQ.pageImage} alt="diagram"
              className="mt-3 w-full rounded-xl border border-gray-200 max-h-56 object-contain bg-gray-50"/>
          )}
        </div>

        {/* MCQ Options */}
        {currentQ?.type !== 'Numerical' && (
          <div className="space-y-2.5 mb-4">
            {['A','B','C','D'].map(opt => {
              const optText = currentQ?.options?.[opt]
              if (!optText && optText !== 0) return null
              const selected = attempt.responses[currentQ?.id] === opt
              return (
                <button key={opt} onClick={() => handleSelect(opt)}
                  className={`option-btn w-full ${selected ? 'selected' : ''}`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold
                    ${selected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {opt}
                  </div>
                  <span className="text-sm text-gray-800 text-left flex-1">{optText}</span>
                  {selected && <CheckCircle size={16} className="text-blue-500 shrink-0"/>}
                </button>
              )
            })}
          </div>
        )}

        {/* Numerical input */}
        {currentQ?.type === 'Numerical' && (
          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Numerical Answer</label>
            <input type="number"
              value={attempt.responses[currentQ?.id] || ''}
              onChange={e => {
                if (e.target.value) setResponse(currentQ.id, e.target.value)
                else clearResponse(currentQ.id)
              }}
              placeholder="Type your answer..."
              className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-base font-mono focus:outline-none focus:border-blue-500"/>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-3 py-2.5 z-20">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <button
            onClick={() => { toggleMark(currentQ?.id); markVisited(currentQ?.id) }}
            className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all
              ${attempt.markedForReview.includes(currentQ?.id)
                ? 'bg-purple-100 text-purple-700 border border-purple-300'
                : 'bg-gray-100 text-gray-600'}`}>
            <Flag size={13}/>
            {attempt.markedForReview.includes(currentQ?.id) ? 'Marked' : 'Mark'}
          </button>
          <button onClick={() => currentQ && clearResponse(currentQ.id)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600">
            <X size={13}/> Clear
          </button>
          <div className="flex-1"/>
          <button onClick={() => setPaletteOpen(true)}
            className="p-2 rounded-xl bg-gray-100 text-gray-700">
            <Grid size={15}/>
          </button>
          <button onClick={handlePrev}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-700">
            <ChevronLeft size={15}/> Prev
          </button>
          <button onClick={handleNext}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white">
            Next <ChevronRight size={15}/>
          </button>
        </div>
      </div>

      {/* Palette Drawer */}
      {paletteOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={() => setPaletteOpen(false)}/>
          <div className="w-80 bg-white h-full flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <p className="font-bold text-gray-900">Question Palette</p>
              <button onClick={() => setPaletteOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18}/>
              </button>
            </div>
            <div className="flex border-b border-gray-100">
              {subjects.map(s => (
                <button key={s} onClick={() => { switchSubject(s); setPaletteOpen(false) }}
                  className={`flex-1 py-2 text-xs font-semibold
                    ${activeSubject === s ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>
                  {s}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-5 gap-2">
                {subjectQs.map((q, i) => (
                  <button key={q.id}
                    onClick={() => { goTo(i); setPaletteOpen(false) }}
                    className={`aspect-square rounded-xl text-sm font-bold transition-all
                      ${statusStyle(getStatus(q.id))}
                      ${i === currentIdx ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}>
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { cls:'bg-gray-100 border border-gray-300', label:'Not Visited',  count: allQ.length - attempt.visitedQuestions.length },
                  { cls:'bg-red-500',    label:'Not Answered', count: attempt.visitedQuestions.filter(id=>!attempt.responses[id]).length },
                  { cls:'bg-green-500',  label:'Answered',     count: answeredCount },
                  { cls:'bg-purple-500', label:'Marked',       count: markedCount }
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded ${l.cls} shrink-0`}/>
                    <span className="text-[10px] text-gray-600">{l.count} {l.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-center text-gray-500 font-medium">
                {answeredCount}/{allQ.length} answered
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Submit Modal */}
      {submitModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                <AlertTriangle size={20} className="text-orange-500"/>
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Submit Test?</h3>
                <p className="text-xs text-gray-500">Cannot be undone.</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { val: answeredCount, label: 'Answered',   color: 'text-green-600' },
                { val: markedCount,   label: 'Marked',     color: 'text-purple-600' },
                { val: unanswered,    label: 'Unanswered', color: 'text-gray-500' }
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-2xl p-3 text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                  <p className="text-[10px] text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>
            <button onClick={doSubmit}
              className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-2xl mb-2 hover:bg-blue-700">
              Submit Test
            </button>
            <button onClick={() => setSubmitModal(false)}
              className="w-full bg-gray-100 text-gray-700 font-semibold py-3.5 rounded-2xl">
              Continue Test
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-dvh bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
          <span className="text-white font-bold text-xl">BT</span>
        </div>
        <p className="font-semibold text-gray-700">Loading test...</p>
      </div>
    </div>
  )
      }
