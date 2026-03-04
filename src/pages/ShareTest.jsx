import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Share2, Play, BookOpen,
  Clock, Target, CheckCircle, Copy, Users
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getTestByShareCode, saveTest } from '../utils/db.js'
import { fmtDate, pct } from '../utils/helpers.js'

export default function ShareTest() {
  const { code } = useParams()
  const navigate  = useNavigate()
  const [test, setTest]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  useEffect(() => { loadTest() }, [code])

  const loadTest = async () => {
    setLoading(true)
    try {
      const t = await getTestByShareCode(code)
      if (t) setTest(t)
      else toast.error('Test not found for this code')
    } catch { toast.error('Failed to load shared test') }
    setLoading(false)
  }

  const saveToMyTests = async () => {
    if (!test) return
    setSaving(true)
    try {
      await saveTest({ ...test, savedAt: Date.now() })
      toast.success('Test saved to My Tests!')
      navigate('/')
    } catch { toast.error('Failed to save test') }
    setSaving(false)
  }

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Link copied!')
  }

  if (loading) return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 bg-blue-600 rounded-2xl mx-auto mb-3 animate-pulse"/>
        <p className="font-semibold text-gray-700">Loading shared test...</p>
      </div>
    </div>
  )

  if (!test) return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Share2 size={24} className="text-red-500"/>
        </div>
        <p className="font-bold text-gray-800">Test Not Found</p>
        <p className="text-sm text-gray-500 mt-1">Invalid or expired share code</p>
        <p className="text-xs text-gray-400 mt-2 font-mono break-all">{code}</p>
        <button onClick={() => navigate('/')}
          className="mt-4 bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold">
          Go Home
        </button>
      </div>
    </div>
  )

  const hasKey = test.questions?.some(q => q.correct)

  return (
    <div className="min-h-dvh bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft size={20}/>
          </button>
          <div className="flex-1">
            <h1 className="font-bold text-gray-900">Shared Test</h1>
            <p className="text-xs text-gray-500">Join and take this test</p>
          </div>
          <button onClick={copyLink} className="p-2 rounded-xl hover:bg-gray-100">
            <Copy size={18} className="text-gray-600"/>
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
        {/* Test card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shrink-0">
              <BookOpen size={20} className="text-white"/>
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-gray-900 text-lg">{test.name}</h2>
              <p className="text-sm text-gray-500">{fmtDate(test.createdAt)}</p>
            </div>
          </div>

          <div className="flex gap-1.5 flex-wrap mb-4">
            {(test.subjects||[]).map(s => (
              <span key={s} className={
                s==='Maths'?'chip-maths':s==='Physics'?'chip-physics':'chip-chem'
              }>{s}</span>
            ))}
            {!hasKey && (
              <span className="text-[10px] text-orange-600 bg-orange-100 font-semibold px-2 py-0.5 rounded-full">
                ♦ No Answer Key
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { icon: BookOpen, val: test.questions?.length || 0, label: 'Questions' },
              { icon: Clock,    val: `${Math.floor((test.duration||0)/60)}m`, label: 'Duration' },
              { icon: Target,   val: test.totalMarks || 0, label: 'Total Marks' }
            ].map(s => (
              <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                <s.icon size={14} className="mx-auto text-gray-400 mb-1"/>
                <p className="font-bold text-gray-800">{s.val}</p>
                <p className="text-[10px] text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-start gap-2">
            <Users size={15} className="text-blue-500 shrink-0 mt-0.5"/>
            <div>
              <p className="text-xs font-semibold text-blue-700">Shared Test</p>
              <p className="text-xs text-blue-600 font-mono truncate">Code: {code}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={saveToMyTests} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 border-2 border-blue-600 text-blue-600 font-semibold py-3 rounded-2xl text-sm hover:bg-blue-50 disabled:opacity-50">
              <CheckCircle size={16}/> {saving ? 'Saving...' : 'Save to My Tests'}
            </button>
            <button onClick={() => { saveToMyTests().then(() => navigate(`/test/${test.id}`)) }}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold py-3 rounded-2xl text-sm hover:bg-blue-700">
              <Play size={16}/> Start Test
            </button>
          </div>
        </div>

        {/* Preview questions */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <p className="font-bold text-gray-900 mb-3">Question Preview</p>
          <div className="space-y-2">
            {(test.questions||[]).slice(0,3).map((q,i) => (
              <div key={q.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded-xl">
                <span className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0">{i+1}</span>
                <p className="text-xs text-gray-700 line-clamp-2">{q.question}</p>
              </div>
            ))}
            {(test.questions||[]).length > 3 && (
              <p className="text-xs text-gray-400 text-center">+{test.questions.length - 3} more questions</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
