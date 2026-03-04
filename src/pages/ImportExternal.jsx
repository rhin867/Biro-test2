import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Download, FileText, Link2,
  CheckCircle, Zap, Upload, AlertCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { v4 as uuidv4 } from 'uuid'
import { saveTest } from '../utils/db.js'
import { useStore } from '../store/useStore.js'
import { generateShareCode } from '../utils/helpers.js'
import { extractPDF } from '../utils/pdfExtractor.js'
import { extractQuestionsWithAI } from '../utils/aiExtractor.js'

export default function ImportExternal() {
  const navigate = useNavigate()
  const { apiKey } = useStore()
  const [file, setFile]         = useState(null)
  const [url, setUrl]           = useState('')
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [config, setConfig]     = useState({
    name: '', duration: 180, correctMark: 4, wrongMark: 1
  })

  const handleProcess = async () => {
    if (!apiKey) return toast.error('Set API key in Settings first')
    if (!file && !url) return toast.error('Upload a PDF or enter URL')
    if (!config.name) return toast.error('Enter a test name')
    setProcessing(true); setProgress(0)

    try {
      let pages = []

      if (file) {
        const result = await extractPDF(file, p => setProgress(Math.round(p * 0.4)))
        pages = result.pages
      }

      setProgress(40)
      const questions = await extractQuestionsWithAI(pages, config, apiKey, p => setProgress(40 + Math.round(p * 0.5)))
      setProgress(95)

      const testId = uuidv4()
      const test = {
        id: testId,
        shareCode: generateShareCode(),
        name: config.name,
        duration: config.duration * 60,
        correctMark: config.correctMark,
        wrongMark: config.wrongMark,
        subjects: [...new Set(questions.map(q => q.subject))],
        questions,
        totalMarks: questions.length * config.correctMark,
        createdAt: Date.now()
      }

      await saveTest(test)
      setProgress(100)
      toast.success(`Test imported! ${questions.length} questions extracted.`)
      navigate(`/test/${testId}`)
    } catch (e) {
      toast.error('Import failed: ' + e.message)
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
            <h1 className="font-bold text-gray-900">Import External Test</h1>
            <p className="text-xs text-gray-500">From any platform or PDF</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-blue-500 shrink-0 mt-0.5"/>
          <p className="text-xs text-blue-700">
            Import test PDFs from PW, Aakash, Allen, or any platform. AI will extract all questions automatically.
          </p>
        </div>

        {/* Upload */}
        <label className="block bg-white rounded-2xl border-2 border-dashed border-gray-300 p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all">
          <div className="text-center">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-2 ${file?'bg-green-100':'bg-gray-100'}`}>
              <Upload size={20} className={file?'text-green-600':'text-gray-400'}/>
            </div>
            <p className="font-semibold text-gray-700">{file ? file.name : 'Upload Test PDF'}</p>
            <p className="text-xs text-gray-400 mt-1">PDF, Image — any size</p>
          </div>
          <input type="file" accept=".pdf,image/*" hidden
            onChange={e => {
              const f = e.target.files[0]
              setFile(f)
              if (f && !config.name) setConfig(c => ({...c, name: f.name.replace(/\.[^/.]+$/,'')}))
            }}/>
        </label>

        {/* Config */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
          <h3 className="font-bold text-gray-900">Test Configuration</h3>
          <div>
            <label className="text-xs font-semibold text-gray-600">Test Name</label>
            <input value={config.name} onChange={e => setConfig(c=>({...c,name:e.target.value}))}
              placeholder="e.g. PW Mock Test 1"
              className="w-full mt-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Duration (minutes)</label>
            <input type="number" value={config.duration}
              onChange={e => setConfig(c=>({...c,duration:+e.target.value}))}
              className="w-full mt-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600">Correct (+)</label>
              <input type="number" value={config.correctMark}
                onChange={e => setConfig(c=>({...c,correctMark:+e.target.value}))}
                className="w-full mt-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Wrong (−)</label>
              <input type="number" value={config.wrongMark}
                onChange={e => setConfig(c=>({...c,wrongMark:+e.target.value}))}
                className="w-full mt-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          </div>
        </div>

        {processing && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex justify-between text-xs text-gray-600 mb-2">
              <span>Importing...</span><span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{width:`${progress}%`}}/>
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">
              {progress < 40 ? 'Reading PDF...' : progress < 80 ? 'AI extracting questions...' : 'Saving...'}
            </p>
          </div>
        )}

        <button onClick={handleProcess} disabled={processing}
          className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98]">
          {processing ? <><Zap size={18} className="animate-spin"/> Processing...</>
          : <><Zap size={18}/> Import & Create Test</>}
        </button>
      </div>
    </div>
  )
}
