import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Monitor, Upload, Play, Square,
  FileText, Image, AlertCircle, CheckCircle,
  Zap, Clock, Info
} from 'lucide-react'
import toast from 'react-hot-toast'
import { v4 as uuidv4 } from 'uuid'
import { useStore } from '../store/useStore.js'
import { saveTest, saveAttempt } from '../utils/db.js'
import { generateShareCode, calcScore, pct } from '../utils/helpers.js'
import { extractPDF, parseAnswerKey } from '../utils/pdfExtractor.js'
import { extractQuestionsWithAI } from '../utils/aiExtractor.js'

export default function ScreenCapture() {
  const navigate = useNavigate()
  const { apiKey, userName } = useStore()
  const [mode, setMode]         = useState(null) // 'screen' | 'manual'
  const [recording, setRecording] = useState(false)
  const [step, setStep]         = useState(0) // 0=choose, 1=upload, 2=process, 3=done
  const [testPdf, setTestPdf]   = useState(null)
  const [ansPdf, setAnsPdf]     = useState(null)
  const [userAns, setUserAns]   = useState('')
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult]     = useState(null)
  const mediaRef = useRef(null)
  const chunksRef = useRef([])

  const startScreenRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen' }, audio: false
      })
      mediaRef.current = new MediaRecorder(stream)
      chunksRef.current = []
      mediaRef.current.ondataavailable = e => chunksRef.current.push(e.data)
      mediaRef.current.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        toast.success('Recording saved! Upload your answer PDF next.')
        setMode('manual')
        setStep(1)
      }
      mediaRef.current.start()
      setRecording(true)
      toast.success('Screen recording started! Take your test now.')
    } catch (e) {
      toast.error('Screen capture not supported or permission denied')
    }
  }

  const stopRecording = () => {
    mediaRef.current?.stop()
    setRecording(false)
  }

  const processManual = async () => {
    if (!apiKey) return toast.error('Set API key in Settings first')
    if (!testPdf && !userAns) return toast.error('Upload test PDF or enter your answers')
    setProcessing(true); setProgress(0); setStep(2)

    try {
      let questions = []
      let ansMap    = {}

      // Extract questions from test PDF
      if (testPdf) {
        setProgress(10)
        const result = await extractPDF(testPdf, p => setProgress(Math.round(p * 0.3)))
        setProgress(40)
        questions = await extractQuestionsWithAI(result.pages, { subject: 'Mixed' }, apiKey, p => setProgress(40 + Math.round(p * 0.3)))
      }

      // Parse answer key
      if (ansPdf) {
        const r = await extractPDF(ansPdf, () => {})
        const text = r.pages.map(p => p.text).join('\n')
        ansMap = parseAnswerKey(text)
      }

      // Parse user answers
      const userMap = parseAnswerKey(userAns)

      setProgress(80)

      // Build attempt
      const responses = {}
      questions.forEach((q, i) => {
        const ua = userMap[i + 1]
        if (ua) responses[q.id] = ua
        if (ansMap[i + 1]) q.correct = ansMap[i + 1]
      })

      let correct = 0, incorrect = 0, skipped = 0
      questions.forEach(q => {
        const r = responses[q.id]
        if (!r) { skipped++; return }
        if (q.correct) { r === q.correct ? correct++ : incorrect++ }
      })

      const score    = calcScore(correct, incorrect, 4, 1)
      const testId   = uuidv4()
      const attId    = uuidv4()
      const shareCode = generateShareCode()

      const test = {
        id: testId, shareCode, name: `External Test - ${new Date().toLocaleDateString()}`,
        duration: 10800, correctMark: 4, wrongMark: 1,
        subjects: [...new Set(questions.map(q => q.subject))],
        questions, totalMarks: questions.length * 4, createdAt: Date.now()
      }

      const attempt = {
        id: attId, testId, testName: test.name,
        responses, timePerQuestion: {}, markedForReview: [],
        visitedQuestions: Object.keys(responses),
        subjectSwitches: [], mistakeTags: {}, notes: {},
        correct, incorrect, skipped, score,
        totalMarks: test.totalMarks,
        accuracy: pct(correct, correct + incorrect),
        timeTaken: 0, createdAt: Date.now(), submittedAt: Date.now(),
        questions
      }

      await saveTest(test)
      await saveAttempt(attempt)
      setProgress(100)
      setResult({ testId, attId, correct, incorrect, skipped, score, total: questions.length })
      setStep(3)
      toast.success('Analysis ready!')
    } catch (e) {
      toast.error('Processing failed: ' + e.message)
      setStep(1)
    }
    setProcessing(false)
  }

  return (
    <div className="min-h-dvh bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft size={20}/>
          </button>
          <div>
            <h1 className="font-bold text-gray-900">External Test Analysis</h1>
            <p className="text-xs text-gray-500">Analyze tests from any platform</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">

        {/* Step 0: Choose mode */}
        {step === 0 && (
          <div className="space-y-3 fade-up">
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
              <Info size={18} className="text-blue-500 shrink-0 mt-0.5"/>
              <p className="text-sm text-blue-700">
                Taking a test on another platform (PW, Unacademy, etc.)? Get advanced analysis here.
              </p>
            </div>

            <button onClick={() => { setMode('screen'); startScreenRecording() }}
              className="w-full bg-white border-2 border-gray-200 rounded-2xl p-5 flex items-start gap-4 hover:border-blue-400 hover:bg-blue-50 transition-all text-left">
              <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center shrink-0">
                <Monitor size={22} className="text-blue-600"/>
              </div>
              <div>
                <p className="font-bold text-gray-900">Screen Recording Mode</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Record your screen while taking test on another platform. AI tracks your activity.
                </p>
                <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full mt-2 inline-block">Recommended</span>
              </div>
            </button>

            <button onClick={() => { setMode('manual'); setStep(1) }}
              className="w-full bg-white border-2 border-gray-200 rounded-2xl p-5 flex items-start gap-4 hover:border-green-400 hover:bg-green-50 transition-all text-left">
              <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center shrink-0">
                <FileText size={22} className="text-green-600"/>
              </div>
              <div>
                <p className="font-bold text-gray-900">Manual Entry Mode</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Upload test PDF + your answers + answer key. Get instant deep analysis.
                </p>
              </div>
            </button>
          </div>
        )}

        {/* Recording active */}
        {recording && (
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-5 text-center fade-up">
            <div className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
              <div className="w-6 h-6 bg-white rounded-sm"/>
            </div>
            <p className="font-bold text-red-700 text-lg">Recording in Progress</p>
            <p className="text-sm text-red-600 mt-1">Take your test now. Come back here when done.</p>
            <div className="flex items-center justify-center gap-2 mt-3 text-red-500">
              <Clock size={14}/> <span className="text-sm font-mono">REC</span>
            </div>
            <button onClick={stopRecording}
              className="mt-4 bg-red-600 text-white font-bold px-6 py-3 rounded-2xl flex items-center gap-2 mx-auto hover:bg-red-700">
              <Square size={16}/> Stop Recording
            </button>
          </div>
        )}

        {/* Step 1: Upload */}
        {step === 1 && !recording && (
          <div className="space-y-4 fade-up">
            <h2 className="font-bold text-gray-900">Upload Files</h2>

            {/* Test PDF */}
            <label className="block bg-white rounded-2xl border-2 border-dashed border-gray-300 p-5 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${testPdf?'bg-green-100':'bg-gray-100'}`}>
                  <FileText size={18} className={testPdf?'text-green-600':'text-gray-400'}/>
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">Test Question PDF</p>
                  <p className="text-xs text-gray-400">{testPdf ? testPdf.name : 'Tap to upload (optional if questions known)'}</p>
                </div>
                {testPdf && <CheckCircle size={18} className="text-green-500 ml-auto"/>}
              </div>
              <input type="file" accept=".pdf,image/*" hidden onChange={e => setTestPdf(e.target.files[0])}/>
            </label>

            {/* Answer key */}
            <label className="block bg-white rounded-2xl border-2 border-dashed border-gray-300 p-5 cursor-pointer hover:border-yellow-400 hover:bg-yellow-50 transition-all">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ansPdf?'bg-green-100':'bg-yellow-100'}`}>
                  <CheckCircle size={18} className={ansPdf?'text-green-600':'text-yellow-600'}/>
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">Answer Key PDF/Image</p>
                  <p className="text-xs text-gray-400">{ansPdf ? ansPdf.name : 'Official answer key (optional)'}</p>
                </div>
              </div>
              <input type="file" accept=".pdf,image/*" hidden onChange={e => setAnsPdf(e.target.files[0])}/>
            </label>

            {/* Your answers */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="font-semibold text-gray-800 text-sm mb-2">Your Selected Answers</p>
              <p className="text-xs text-gray-400 mb-2">Format: 1-A, 2-B, 3-C... or ABCDA...</p>
              <textarea
                value={userAns}
                onChange={e => setUserAns(e.target.value)}
                placeholder="1-A, 2-C, 3-B, 4-D... or ACABD..."
                rows={4}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
              />
            </div>

            <button onClick={processManual} disabled={processing}
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50">
              <Zap size={18}/> Generate Advanced Analysis
            </button>
          </div>
        )}

        {/* Step 2: Processing */}
        {step === 2 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center fade-up">
            <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Zap size={24} className="text-blue-600 animate-pulse"/>
            </div>
            <p className="font-bold text-gray-900 mb-1">Processing...</p>
            <p className="text-sm text-gray-500 mb-4">AI is analyzing your test</p>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
              <div className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                style={{width:`${progress}%`}}/>
            </div>
            <p className="text-sm font-semibold text-blue-600">{progress}%</p>
            <p className="text-xs text-gray-400 mt-2">
              {progress < 40 ? 'Extracting questions...'
              : progress < 70 ? 'AI processing...'
              : 'Building analysis...'}
            </p>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 3 && result && (
          <div className="space-y-4 fade-up">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
              <CheckCircle size={40} className="text-green-500 mx-auto mb-3"/>
              <p className="font-bold text-gray-900 text-lg">Analysis Ready!</p>
              <p className="text-sm text-gray-500">Your external test has been analyzed</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { val: result.correct,   label: 'Correct',   color: 'text-green-600', bg: 'bg-green-50' },
                { val: result.incorrect, label: 'Incorrect', color: 'text-red-600',   bg: 'bg-red-50' },
                { val: result.skipped,   label: 'Skipped',   color: 'text-gray-500',  bg: 'bg-gray-50' }
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-2xl p-3 text-center`}>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
              <p className="text-sm text-gray-500">Score</p>
              <p className={`text-4xl font-bold ${result.score>=0?'text-green-600':'text-red-600'}`}>
                {result.score}/{result.total * 4}
              </p>
            </div>

            <button onClick={() => navigate(`/analysis/${result.attId}`)}
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700">
              <Zap size={18}/> View Full Analysis
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
