import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Download, RotateCcw, Target,
  CheckCircle, XCircle, MinusCircle, Clock,
  TrendingUp, Zap, BookOpen, AlertTriangle,
  ChevronRight, BarChart2
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie,
  Cell, LineChart, Line, RadarChart, Radar,
  PolarGrid, PolarAngleAxis
} from 'recharts'
import toast from 'react-hot-toast'
import { v4 as uuidv4 } from 'uuid'
import { getAttempt, getAttemptsByTest, getTest, saveMistake } from '../utils/db.js'
import { useStore } from '../store/useStore.js'
import { generateWeeklyPlan, askAIAboutQuestion } from '../utils/aiExtractor.js'
import {
  formatDuration, fmtDateTime, pct,
  MISTAKE_TYPES, attemptStyleLabel, groupByChapter
} from '../utils/helpers.js'

const TABS = [
  'Performance', 'Score Potential', 'Attempt Analysis',
  'Time Analysis', 'Subject Movement', 'Question Journey',
  'Painful Qs', 'Missed Concepts', 'Qs by Qs', 'Chapters',
  'Mistakes', 'History'
]

export default function Analysis() {
  const { attemptId } = useParams()
  const navigate = useNavigate()
  const { apiKey } = useStore()

  const [attempt, setAttempt]     = useState(null)
  const [test, setTest]           = useState(null)
  const [allAttempts, setAll]     = useState([])
  const [activeTab, setActiveTab] = useState('Performance')
  const [loading, setLoading]     = useState(true)
  const [plan, setPlan]           = useState(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [aiExp, setAiExp]         = useState({})
  const [aiLoading, setAiLoading] = useState({})

  useEffect(() => { loadData() }, [attemptId])

  const loadData = async () => {
    setLoading(true)
    try {
      let att
      if (attemptId.includes('-latest')) {
        const testId   = attemptId.replace('-latest', '')
        const attempts = await getAttemptsByTest(testId)
        att = attempts[0]
      } else {
        att = await getAttempt(attemptId)
      }
      if (!att) { toast.error('Attempt not found'); navigate('/'); return }
      setAttempt(att)
      const t    = await getTest(att.testId)
      const allA = await getAttemptsByTest(att.testId)
      setTest(t)
      setAll(allA)
    } catch { toast.error('Failed to load') }
    setLoading(false)
  }

  if (loading) return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 bg-blue-600 rounded-2xl mx-auto mb-3 animate-pulse
          flex items-center justify-center">
          <BarChart2 size={20} className="text-white"/>
        </div>
        <p className="font-semibold text-gray-700">Loading analysis...</p>
      </div>
    </div>
  )

  if (!attempt) return null

  const {
    correct=0, incorrect=0, skipped=0,
    score=0, totalMarks=0, accuracy=0,
    timeTaken=0, responses={},
    timePerQuestion={}, questions=[]
  } = attempt

  const subjects = [...new Set(questions.map(q => q.subject).filter(Boolean))]

  const subjectStats = subjects.map(s => {
    const qs  = questions.filter(q => q.subject === s)
    const cor = qs.filter(q => responses[q.id] === q.correct && q.correct)
    const inc = qs.filter(q => responses[q.id] !== q.correct && responses[q.id] !== undefined && q.correct)
    return {
      subject:   s,
      total:     qs.length,
      correct:   cor.length,
      incorrect: inc.length,
      skipped:   qs.length - cor.length - inc.length,
      accuracy:  pct(cor.length, cor.length + inc.length),
      score:     cor.length * 4 - inc.length
    }
  })

  const chapterStats = Object.entries(groupByChapter(questions)).map(([ch, qs]) => {
    const cor = qs.filter(q => responses[q.id] === q.correct && q.correct).length
    const inc = qs.filter(q => responses[q.id] !== q.correct && responses[q.id] !== undefined && q.correct).length
    return {
      chapter: ch, total: qs.length, correct: cor, incorrect: inc,
      accuracy: pct(cor, cor + inc), subject: qs[0]?.subject
    }
  }).sort((a, b) => a.accuracy - b.accuracy)

  const timeData = questions.map((q, i) => ({
    name:   `Q${i + 1}`,
    time:   timePerQuestion[q.id] || 0,
    result: responses[q.id] === q.correct && q.correct ? 'correct'
          : responses[q.id] !== undefined ? 'incorrect' : 'skipped'
  }))

  const scorePotential = [
    { label: 'Actual',       score,                              improved: 0 },
    { label: '50% fix',      score: score + Math.round(incorrect*0.5*4), improved: Math.round(incorrect*0.5*4) },
    { label: '75% fix',      score: score + Math.round(incorrect*0.75*4),improved: Math.round(incorrect*0.75*4) },
    { label: 'No negatives', score: score + incorrect*4,        improved: incorrect * 4 }
  ]

  const incorrectQs = questions.filter(q =>
    responses[q.id] !== undefined && responses[q.id] !== q.correct && q.correct
  )
  const switches = attempt.subjectSwitches || []

  const genPlan = async () => {
    if (!apiKey) return toast.error('Set API key in Settings')
    setPlanLoading(true)
    try {
      const p = await generateWeeklyPlan({ subjectStats, chapterStats, correct, incorrect, skipped, score, accuracy }, apiKey)
      setPlan(p)
    } catch { toast.error('Failed to generate plan') }
    setPlanLoading(false)
  }

  const getAIExp = async (q) => {
    if (!apiKey) return toast.error('Set API key first')
    setAiLoading(l => ({...l, [q.id]: true}))
    try {
      const exp = await askAIAboutQuestion(q, responses[q.id], q.correct, apiKey)
      setAiExp(e => ({...e, [q.id]: exp}))
    } catch { toast.error('AI failed') }
    setAiLoading(l => ({...l, [q.id]: false}))
  }

  const addToMistakes = async (q) => {
    await saveMistake({
      id: uuidv4(), questionId: q.id,
      testId: attempt.testId, testName: attempt.testName,
      question: q.question, options: q.options,
      correct: q.correct, userAnswer: responses[q.id],
      subject: q.subject, chapter: q.chapter,
      pageImage: q.pageImage, addedAt: Date.now(), notes: ''
    })
    toast.success('Added to Mistake Book!')
  }

  return (
    <div className="min-h-dvh bg-gray-50 pb-10">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft size={20}/>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-900 text-sm">Detailed Analysis</h1>
            <p className="text-xs text-gray-500 truncate">
              {attempt.testName} • {fmtDateTime(attempt.submittedAt)}
            </p>
          </div>
        </div>
        <div className="px-4 pb-3 flex gap-2 tabs-scroll">
          <button onClick={genPlan} disabled={planLoading}
            className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded-xl whitespace-nowrap disabled:opacity-60">
            <Zap size={13}/> {planLoading ? 'Generating...' : 'AI Study Plan'}
          </button>
          <button onClick={() => navigate(`/test/${attempt.testId}`)}
            className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-semibold px-3 py-2 rounded-xl whitespace-nowrap">
            <RotateCcw size={13}/> Retake
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* Score cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label:'Score',    val:`${score}/${totalMarks}`, color: score>=0?'text-blue-700':'text-red-600',   bg:'bg-blue-50' },
            { label:'Accuracy', val:`${accuracy}%`,           color: accuracy>=50?'text-green-600':'text-red-600', bg:'bg-green-50' },
            { label:'Time',     val:formatDuration(timeTaken),color:'text-gray-700', bg:'bg-gray-50' }
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-3 text-center border border-gray-100`}>
              <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: CheckCircle, val: correct,   label: `Correct (+${correct*4})`,   color:'text-green-600', bg:'bg-green-50' },
            { icon: XCircle,     val: incorrect, label: `Incorrect (-${incorrect})`,  color:'text-red-600',   bg:'bg-red-50' },
            { icon: MinusCircle, val: skipped,   label: 'Skipped',                   color:'text-gray-500',  bg:'bg-gray-50' }
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-3 text-center border border-gray-100`}>
              <s.icon size={16} className={`mx-auto mb-1 ${s.color}`}/>
              <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
              <p className="text-[10px] text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Overall bar */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3">Overall Performance</h3>
          <div className="flex h-4 rounded-full overflow-hidden mb-2">
            <div className="bg-green-500" style={{width:`${pct(correct,questions.length)}%`}}/>
            <div className="bg-red-500"   style={{width:`${pct(incorrect,questions.length)}%`}}/>
            <div className="bg-gray-300"  style={{width:`${pct(skipped,questions.length)}%`}}/>
          </div>
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-green-500 rounded-full"/>Correct ({correct})</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-red-500 rounded-full"/>Incorrect ({incorrect})</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-gray-300 rounded-full"/>Skipped ({skipped})</span>
          </div>
          <div className="mt-3 bg-blue-50 rounded-xl px-3 py-2 text-center">
            <p className="text-xs text-gray-500">Attempt Style</p>
            <p className="font-bold text-blue-700 text-sm">{attemptStyleLabel({correct,incorrect,skipped})}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs-scroll gap-1.5">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`text-xs font-semibold px-3 py-2 rounded-xl whitespace-nowrap transition-all
                ${activeTab===tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'}`}>
              {tab}
            </button>
          ))}
        </div>

        {/* ── PERFORMANCE ─────────────────────────────── */}
        {activeTab === 'Performance' && (
          <div className="space-y-4 fade-up">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3">Subject Accuracy</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={subjectStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="subject" tick={{fontSize:11}}/>
                  <YAxis domain={[0,100]} tick={{fontSize:11}}/>
                  <Tooltip formatter={v=>`${v}%`}/>
                  <Bar dataKey="accuracy" fill="#3b82f6" radius={[6,6,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3">Subject Breakdown</h3>
              <div className="space-y-4">
                {subjectStats.map(s => (
                  <div key={s.subject}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="font-semibold text-gray-800">{s.subject}</span>
                      <span className={`font-bold ${s.score>=0?'text-green-600':'text-red-600'}`}>
                        {s.correct}/{s.total} • {s.accuracy}%
                      </span>
                    </div>
                    <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
                      <div className="bg-green-500" style={{width:`${pct(s.correct,s.total)}%`}}/>
                      <div className="bg-red-500"   style={{width:`${pct(s.incorrect,s.total)}%`}}/>
                    </div>
                    <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
                      <span>✓ {s.correct}</span>
                      <span>✗ {s.incorrect}</span>
                      <span>– {s.skipped}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SCORE POTENTIAL ──────────────────────────── */}
        {activeTab === 'Score Potential' && (
          <div className="space-y-4 fade-up">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-1">Score Potential</h3>
              <p className="text-xs text-gray-500 mb-4">What if you made fewer errors?</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={scorePotential}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="label" tick={{fontSize:10}}/>
                  <YAxis tick={{fontSize:10}}/>
                  <Tooltip/>
                  <Bar dataKey="score"    fill="#3b82f6" radius={[4,4,0,0]} name="Score"/>
                  <Bar dataKey="improved" fill="#bfdbfe" radius={[4,4,0,0]} name="Gain"/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label:'Actual Score',      val:score,         color:'text-red-600' },
                { label:'Without Negatives', val:correct*4,     color:'text-green-600' },
                { label:'Lost to Negatives', val:incorrect,     color:'text-purple-600' },
                { label:'Max Possible',      val:(correct+skipped)*4, color:'text-blue-600' }
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-3 text-center shadow-sm">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ATTEMPT ANALYSIS ────────────────────────── */}
        {activeTab === 'Attempt Analysis' && (
          <div className="space-y-4 fade-up">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3">Attempt Quality</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[340px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-500">
                      <th className="text-left py-2">Subject</th>
                      <th className="text-center py-2 text-green-600">Perfect</th>
                      <th className="text-center py-2 text-red-600">Wasted</th>
                      <th className="text-center py-2 text-orange-500">Overtime</th>
                      <th className="text-center py-2 text-purple-600">Marked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[{label:'Overall',qs:questions}, ...subjectStats.map(s=>({
                      label:s.subject,
                      qs:questions.filter(q=>q.subject===s.subject)
                    }))].map(row => {
                      const perfect  = row.qs.filter(q=>responses[q.id]===q.correct&&(timePerQuestion[q.id]||0)<120).length
                      const wasted   = row.qs.filter(q=>responses[q.id]!==q.correct&&responses[q.id]!==undefined).length
                      const overtime = row.qs.filter(q=>responses[q.id]===q.correct&&(timePerQuestion[q.id]||0)>=180).length
                      const marked   = row.qs.filter(q=>attempt.markedForReview?.includes(q.id)).length
                      return (
                        <tr key={row.label} className="border-b border-gray-50">
                          <td className="py-2 font-medium text-gray-700">{row.label}</td>
                          <td className="py-2 text-center font-bold text-green-600">{perfect}</td>
                          <td className="py-2 text-center font-bold text-red-600">{wasted}</td>
                          <td className="py-2 text-center font-bold text-orange-500">{overtime}</td>
                          <td className="py-2 text-center font-bold text-purple-600">{marked}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={[
                      {name:'Correct',   value:correct,   fill:'#22c55e'},
                      {name:'Incorrect', value:incorrect, fill:'#ef4444'},
                      {name:'Skipped',   value:skipped,   fill:'#94a3b8'}
                    ]} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value">
                      {[0,1,2].map(i => <Cell key={i}/>)}
                    </Pie>
                    <Tooltip/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ── TIME ANALYSIS ────────────────────────────── */}
        {activeTab === 'Time Analysis' && (
          <div className="space-y-4 fade-up">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3">Time & Accuracy</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500">
                    <th className="text-left py-2">Subject</th>
                    <th className="text-right py-2">Time</th>
                    <th className="text-right py-2">Attempt%</th>
                    <th className="text-right py-2">Accuracy%</th>
                  </tr>
                </thead>
                <tbody>
                  {[{subject:'Overall',qs:questions},...subjectStats.map(s=>({
                    subject:s.subject,
                    qs:questions.filter(q=>q.subject===s.subject)
                  }))].map(row => {
                    const totalT   = row.qs.reduce((s,q)=>s+(timePerQuestion[q.id]||0),0)
                    const attempted = row.qs.filter(q=>responses[q.id]!==undefined).length
                    const cor       = row.qs.filter(q=>responses[q.id]===q.correct&&q.correct).length
                    return (
                      <tr key={row.subject} className="border-b border-gray-50">
                        <td className="py-2 font-medium">{row.subject}</td>
                        <td className="py-2 text-right text-gray-600">{formatDuration(totalT)}</td>
                        <td className="py-2 text-right text-blue-600 font-semibold">{pct(attempted,row.qs.length)}%</td>
                        <td className="py-2 text-right text-green-600 font-semibold">{pct(cor,attempted)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3">Time per Question</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={timeData.slice(0,30)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="name" tick={{fontSize:9}}/>
                  <YAxis tick={{fontSize:10}}/>
                  <Tooltip formatter={v=>`${v}s`}/>
                  <Bar dataKey="time" radius={[3,3,0,0]}>
                    {timeData.slice(0,30).map((d,i) => (
                      <Cell key={i}
                        fill={d.result==='correct'?'#22c55e':d.result==='incorrect'?'#ef4444':'#94a3b8'}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── SUBJECT MOVEMENT ────────────────────────── */}
        {activeTab === 'Subject Movement' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm fade-up">
            <h3 className="font-bold text-gray-900 mb-4">Subject Movement</h3>
            {switches.length > 0 ? (
              <>
                <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 tabs-scroll">
                  {switches.map((sw, i) => (
                    <div key={i} className="flex items-center gap-2 shrink-0">
                      <div className="text-center">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-1
                          ${sw.subject==='Maths'?'bg-purple-100':sw.subject==='Physics'?'bg-blue-100':'bg-green-100'}`}>
                          <span className="text-lg">{sw.subject==='Maths'?'📐':sw.subject==='Physics'?'⚛️':'✏️'}</span>
                        </div>
                        <p className="text-[10px] font-semibold text-gray-700">{sw.subject}</p>
                      </div>
                      {i < switches.length-1 && <ChevronRight size={14} className="text-gray-300 shrink-0"/>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-center text-gray-400">Total switches: {switches.length - 1}</p>
              </>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">No subject switches recorded</p>
            )}
          </div>
        )}

        {/* ── QUESTION JOURNEY ────────────────────────── */}
        {activeTab === 'Question Journey' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm fade-up">
            <h3 className="font-bold text-gray-900 mb-2">Question Journey</h3>
            <div className="flex gap-3 text-xs mb-4 flex-wrap">
              {[
                {color:'bg-green-500',  label:'Correct'},
                {color:'bg-red-500',    label:'Wrong'},
                {color:'bg-gray-200',   label:'Skipped'},
                {color:'bg-purple-500', label:'Marked'}
              ].map(l => (
                <span key={l.label} className="flex items-center gap-1">
                  <span className={`w-3 h-3 ${l.color} rounded`}/>{l.label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {questions.map((q, i) => {
                const res      = responses[q.id]
                const isCorrect = res === q.correct && q.correct
                const isWrong   = res !== undefined && !isCorrect && q.correct
                const isMarked  = attempt.markedForReview?.includes(q.id)
                return (
                  <div key={q.id}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[10px] font-bold border-2
                      ${isCorrect ? 'bg-green-100 border-green-400 text-green-700'
                      : isWrong   ? 'bg-red-100 border-red-400 text-red-700'
                      : isMarked  ? 'bg-purple-100 border-purple-400 text-purple-700'
                      : res!==undefined ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                    <span>{i+1}</span>
                    <span className="text-[8px]">{isCorrect?'✓':isWrong?'✗':res||'–'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── PAINFUL Qs ──────────────────────────────── */}
        {activeTab === 'Painful Qs' && (
          <div className="space-y-3 fade-up">
            {subjects.map(s => {
              const sWrong = incorrectQs.filter(q => q.subject === s)
              if (!sWrong.length) return null
              return (
                <div key={s} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                  <p className={`font-bold text-sm mb-3
                    ${s==='Maths'?'text-purple-600':s==='Physics'?'text-blue-600':'text-green-600'}`}>
                    {s==='Maths'?'📐':s==='Physics'?'⚛️':'✏️'} {s}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sWrong.map(q => (
                      <span key={q.id}
                        className="bg-red-100 text-red-700 text-xs font-semibold px-2.5 py-1 rounded-xl">
                        {q.id} ({formatDuration(timePerQuestion[q.id]||0)})
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
            {incorrectQs.length === 0 && (
              <div className="text-center py-12">
                <CheckCircle size={40} className="text-green-500 mx-auto mb-3"/>
                <p className="font-bold text-gray-700">No painful questions!</p>
                <p className="text-sm text-gray-400">Great accuracy</p>
              </div>
            )}
          </div>
        )}

        {/* ── MISSED CONCEPTS ──────────────────────────── */}
        {activeTab === 'Missed Concepts' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm fade-up">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={18} className="text-orange-500"/>
              <h3 className="font-bold text-gray-900">Missed Concepts</h3>
            </div>
            {subjects.map(s => {
              const wrongQs  = questions.filter(q =>
                q.subject===s && responses[q.id]!==q.correct && responses[q.id]!==undefined && q.correct
              )
              const chapters = [...new Set(wrongQs.map(q => q.chapter))]
              if (!chapters.length) return null
              const borderCls = s==='Physics'?'border-l-blue-500':s==='Chemistry'?'border-l-green-500':'border-l-purple-500'
              return (
                <div key={s} className={`mb-5 border-l-4 ${borderCls} pl-3`}>
                  <p className="font-bold text-gray-800 mb-2">
                    {s==='Maths'?'📐':s==='Physics'?'⚛️':'✏️'} {s}
                  </p>
                  <ol className="space-y-2">
                    {chapters.map((ch, i) => {
                      const chQs = wrongQs.filter(q => q.chapter === ch)
                      return (
                        <li key={ch} className="flex items-start gap-2">
                          <span className="text-sm text-gray-700 flex-1">{i+1}. {ch}</span>
                          <div className="flex gap-1 flex-wrap">
                            {chQs.map(q => (
                              <span key={q.id}
                                className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold">
                                {q.id}
                              </span>
                            ))}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Qs by Qs ─────────────────────────────────── */}
        {activeTab === 'Qs by Qs' && (
          <div className="fade-up overflow-x-auto">
            <table className="w-full text-xs min-w-[440px] bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-600">Q#</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Subject</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Chapter</th>
                  <th className="text-center p-3 font-semibold text-gray-600">Yours</th>
                  <th className="text-center p-3 font-semibold text-gray-600">Correct</th>
                  <th className="text-center p-3 font-semibold text-gray-600">Marks</th>
                  <th className="text-center p-3 font-semibold text-gray-600">+MB</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q, i) => {
                  const res       = responses[q.id]
                  const isCorrect = res === q.correct && q.correct
                  const isWrong   = res !== undefined && !isCorrect && q.correct
                  const marks     = isCorrect ? `+${test?.correctMark||4}` : isWrong ? `-${test?.wrongMark||1}` : '0'
                  return (
                    <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="p-2 font-bold text-gray-500">{i+1}</td>
                      <td className="p-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                          ${q.subject==='Maths'?'bg-purple-100 text-purple-700'
                          :q.subject==='Physics'?'bg-blue-100 text-blue-700'
                          :'bg-green-100 text-green-700'}`}>
                          {q.subject?.slice(0,4)}
                        </span>
                      </td>
                      <td className="p-2 text-gray-500 max-w-[80px] truncate">{q.chapter}</td>
                      <td className="p-2 text-center font-bold text-gray-700">{res || '–'}</td>
                      <td className="p-2 text-center font-bold text-green-600">{q.correct || '?'}</td>
                      <td className={`p-2 text-center font-bold
                        ${isCorrect?'text-green-600':isWrong?'text-red-600':'text-gray-400'}`}>
                        {marks}
                      </td>
                      <td className="p-2 text-center">
                        <button onClick={() => addToMistakes(q)}
                          className="text-blue-500 hover:text-blue-700 font-bold text-base">+</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── CHAPTERS ─────────────────────────────────── */}
        {activeTab === 'Chapters' && (
          <div className="space-y-3 fade-up">
            {subjects.map(s => {
              const sChapters = chapterStats.filter(c => c.subject === s)
              if (!sChapters.length) return null
              return (
                <div key={s} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                  <h3 className="font-bold text-gray-900 mb-3">{s}</h3>
                  <div className="space-y-2">
                    {sChapters.map(c => (
                      <div key={c.chapter} className="flex items-center gap-3 py-1.5 border-b border-gray-50">
                        <span className="flex-1 text-sm text-gray-700 truncate">{c.chapter}</span>
                        <span className={`text-sm font-bold w-10 text-right
                          ${c.accuracy>=60?'text-green-600':c.accuracy>=30?'text-orange-500':'text-red-600'}`}>
                          {c.accuracy}%
                        </span>
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0">
                          <div className={`h-full rounded-full
                            ${c.accuracy>=60?'bg-green-500':c.accuracy>=30?'bg-orange-400':'bg-red-500'}`}
                            style={{width:`${c.accuracy}%`}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── MISTAKES ─────────────────────────────────── */}
        {activeTab === 'Mistakes' && (
          <div className="space-y-3 fade-up">
            {incorrectQs.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle size={40} className="text-green-500 mx-auto mb-3"/>
                <p className="font-bold text-gray-700">No incorrect answers!</p>
              </div>
            ) : incorrectQs.map((q, i) => (
              <div key={q.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 bg-red-500 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {i+1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 line-clamp-2">{q.question}</p>
                      <div className="flex gap-2 mt-0.5">
                        <span className="text-[10px] text-red-600 font-semibold">Your: {responses[q.id]}</span>
                        <span className="text-[10px] text-green-600 font-semibold">Correct: {q.correct}</span>
                        <span className="text-[10px] text-gray-400">{formatDuration(timePerQuestion[q.id]||0)}</span>
                      </div>
                    </div>
                  </div>
                  {['A','B','C','D'].map(opt => q.options?.[opt] && (
                    <div key={opt} className={`flex gap-2 p-2 rounded-lg text-xs mb-1
                      ${opt===q.correct?'bg-green-50 border border-green-200'
                      :opt===responses[q.id]?'bg-red-50 border border-red-200'
                      :'bg-gray-50'}`}>
                      <span className={`font-bold w-4 shrink-0
                        ${opt===q.correct?'text-green-600':opt===responses[q.id]?'text-red-600':'text-gray-500'}`}>
                        {opt}
                      </span>
                      <span className="text-gray-700">{q.options[opt]}</span>
                    </div>
                  ))}
                  {aiExp[q.id] && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mt-2">
                      <p className="text-xs font-bold text-blue-700 mb-1">🤖 AI Explanation</p>
                      <p className="text-xs text-blue-800 leading-relaxed">{aiExp[q.id]}</p>
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => getAIExp(q)} disabled={aiLoading[q.id]}
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-semibold disabled:opacity-50">
                      {aiLoading[q.id] ? '...' : <><Zap size={12}/> AI Explain</>}
                    </button>
                    <button onClick={() => addToMistakes(q)}
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-semibold">
                      <BookOpen size={12}/> Add to Mistakes
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── HISTORY ──────────────────────────────────── */}
        {activeTab === 'History' && (
          <div className="space-y-4 fade-up">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3">
                All Attempts ({allAttempts.length})
              </h3>
              {allAttempts.map((a, i) => (
                <div key={a.id}
                  onClick={() => navigate(`/analysis/${a.id}`)}
                  className="flex items-center gap-3 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 rounded-xl px-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0">
                    #{i+1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{fmtDateTime(a.submittedAt)}</p>
                    <p className="text-xs text-gray-500">{a.correct}✓ {a.incorrect}✗ {a.skipped}–</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${(a.score||0)>=0?'text-green-600':'text-red-600'}`}>{a.score||0}</p>
                    <p className="text-xs text-gray-400">{a.accuracy||0}%</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-400"/>
                </div>
              ))}
            </div>

            {allAttempts.length > 1 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-3">Score Trend</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={[...allAttempts].reverse().map((a,i)=>({
                    attempt: `#${i+1}`, score: a.score||0
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="attempt" tick={{fontSize:11}}/>
                    <YAxis tick={{fontSize:10}}/>
                    <Tooltip/>
                    <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{r:4}}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* AI Weekly Plan */}
        {plan && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 fade-up">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={18} className="text-blue-600"/>
              <h3 className="font-bold text-gray-900">AI Weekly Study Plan</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">{plan.summary}</p>
            {plan.weeklyPlan?.map(day => (
              <div key={day.day} className="mb-3 bg-white rounded-xl p-3 border border-blue-100">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold text-gray-800 text-sm">{day.dayName} — {day.focus}</p>
                  <span className="text-xs text-blue-600 font-semibold">{day.hours}h</span>
                </div>
                <ul className="space-y-1">
                  {day.tasks?.map((t, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-blue-400 mt-0.5 shrink-0">•</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
