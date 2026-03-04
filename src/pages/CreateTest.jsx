import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileText, Image, Video, X, ChevronRight,
  ChevronLeft, Settings, Eye, Plus, Trash2, Edit3,
  CheckCircle, AlertCircle, Scissors, ZoomIn, ArrowLeft,
  Loader, BookOpen, Camera, Link2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { v4 as uuidv4 } from 'uuid'
import { nanoid } from 'nanoid'
import { useStore } from '../store/useStore.js'
import { extractPDF, renderPageAsImage, cropRegion, splitIntoQuestions, parseAnswerKey } from '../utils/pdfExtractor.js'
import { extractQuestionsWithAI } from '../utils/aiExtractor.js'
import { saveTest } from '../utils/db.js'
import { generateShareCode, fmtDate } from '../utils/helpers.js'

const STEPS = ['Upload', 'Configure', 'Review', 'Answer Key']

export default function CreateTest() {
  const navigate = useNavigate()
  const { apiKey } = useStore()

  const [step, setStep]               = useState(0)
  const [files, setFiles]             = useState([])   // { file, type, name, pages?, preview? }
  const [ansFiles, setAnsFiles]       = useState([])
  const [config, setConfig]           = useState({
    name: '', duration: 180,
    correctMark: 4, wrongMark: 1,
    subjects: ['Maths', 'Physics', 'Chemistry'],
    imageMode: false, totalQuestions: 0
  })
  const [extracting, setExtracting]   = useState(false)
  const [progress, setProgress]       = useState(0)
  const [questions, setQuestions]     = useState([])
  const [editQ, setEditQ]             = useState(null)
  const [cropMode, setCropMode]       = useState(false)
  const [cropPage, setCropPage]       = useState(null)   // { dataUrl, width, height, pageNum, forQid }
  const [cropBox, setCropBox]         = useState(null)
  const [isDragging, setIsDragging]   = useState(false)
  const [ansKeyText, setAnsKeyText]   = useState('')
  const [ansKeyMap, setAnsKeyMap]     = useState({})

  const fileRef    = useRef()
  const ansRef     = useRef()
  const cropRef    = useRef()
  const dragStart  = useRef(null)

  // ── Drag & Drop ──────────────────────────────────────────
  const onDrop = useCallback(e => {
    e.preventDefault(); setIsDragging(false)
    handleFiles([...e.dataTransfer.files])
  }, [])

  const handleFiles = (incoming) => {
    const mapped = incoming.map(f => {
      const type = f.type.startsWith('video') ? 'video'
                 : f.type.includes('pdf')     ? 'pdf'
                 : 'image'
      return { file: f, type, name: f.name, id: uuidv4(), preview: type === 'image' ? URL.createObjectURL(f) : null }
    })
    setFiles(p => [...p, ...mapped])
    if (!config.name && incoming[0]) {
      setConfig(c => ({ ...c, name: incoming[0].name.replace(/\.[^/.]+$/, '') }))
    }
  }

  // ── Step 1 → Step 2 ──────────────────────────────────────
  const goToConfigure = () => {
    if (!files.length) return toast.error('Please upload at least one file')
    setStep(1)
  }

  // ── Extract Questions ─────────────────────────────────────
  const startExtraction = async () => {
    if (!apiKey) return toast.error('Please set your API key in Settings first')
    setExtracting(true); setProgress(0)

    try {
      let allPages = []

      for (const f of files) {
        if (f.type === 'pdf') {
          const result = await extractPDF(f.file, p => setProgress(Math.round(p * 0.4)))
          allPages = [...allPages, ...result.pages]
        } else if (f.type === 'image') {
          // Treat image as single-page
          const dataUrl = await fileToDataUrl(f.file)
          allPages.push({ pageNum: 1, lines: [], pageImage: dataUrl, hasDiagram: true, text: '' })
        }
        // Video: extract frames (simplified — show notice)
        else if (f.type === 'video') {
          const frames = await extractVideoFrames(f.file, p => setProgress(Math.round(p * 0.3)))
          allPages = [...allPages, ...frames]
        }
      }

      setProgress(40)
      const qs = await extractQuestionsWithAI(allPages, config, apiKey, setProgress)
      setProgress(95)

      // Apply answer key if already pasted
      if (Object.keys(ansKeyMap).length) {
        qs.forEach((q, i) => {
          if (ansKeyMap[i + 1]) q.correct = ansKeyMap[i + 1]
        })
      }

      setQuestions(qs)
      setProgress(100)
      setStep(2)
      toast.success(`${qs.length} questions extracted!`)
    } catch (e) {
      toast.error('Extraction failed: ' + e.message)
    } finally {
      setExtracting(false)
    }
  }

  // ── Answer Key ────────────────────────────────────────────
  const parseAnsKey = async () => {
    let text = ansKeyText

    // From files
    for (const f of ansFiles) {
      if (f.type === 'pdf') {
        const r = await extractPDF(f.file, () => {})
        text += '\n' + r.pages.map(p => p.text).join('\n')
      } else if (f.type === 'image') {
        // Use AI to extract answer key from image
        const dataUrl = await fileToDataUrl(f.file)
        text += '\n' + await extractAnsFromImage(dataUrl, apiKey)
      }
    }

    const map = parseAnswerKey(text)
    if (!Object.keys(map).length) return toast.error('Could not parse answer key. Try format: 1-A, 2-B...')

    setAnsKeyMap(map)
    setQuestions(qs => qs.map((q, i) => ({
      ...q, correct: map[i + 1] || q.correct
    })))
    toast.success(`${Object.keys(map).length} answers applied!`)
  }

  // ── Crop Mode ─────────────────────────────────────────────
  const openCropForQuestion = async (q) => {
    const pdfFile = files.find(f => f.type === 'pdf')
    if (!pdfFile) return toast.error('PDF file needed for crop mode')
    try {
      const result = await renderPageAsImage(pdfFile.file, q.diagramPageNum || 1, 1.8)
      setCropPage({ ...result, pageNum: q.diagramPageNum || 1, forQid: q.id })
      setCropMode(true)
    } catch { toast.error('Could not render page') }
  }

  const onCropMouseDown = (e) => {
    const rect = cropRef.current.getBoundingClientRect()
    dragStart.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    setCropBox(null)
  }

  const onCropMouseMove = (e) => {
    if (!dragStart.current) return
    const rect = cropRef.current.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    setCropBox({
      x: Math.min(dragStart.current.x, cx),
      y: Math.min(dragStart.current.y, cy),
      w: Math.abs(cx - dragStart.current.x),
      h: Math.abs(cy - dragStart.current.y)
    })
  }

  const onCropMouseUp = async () => {
    if (!cropBox || cropBox.w < 20 || cropBox.h < 20) { dragStart.current = null; return }
    dragStart.current = null
    const cropped = await cropRegion(cropPage.dataUrl, cropBox, cropPage.width, cropPage.height)
    setQuestions(qs => qs.map(q =>
      q.id === cropPage.forQid ? { ...q, pageImage: cropped, hasDiagram: true } : q
    ))
    setCropMode(false); setCropPage(null); setCropBox(null)
    toast.success('Diagram attached!')
  }

  // ── Edit Question ──────────────────────────────────────────
  const saveEdit = (updated) => {
    setQuestions(qs => qs.map(q => q.id === updated.id ? updated : q))
    setEditQ(null)
    toast.success('Question updated')
  }

  const deleteQ = (id) => {
    setQuestions(qs => qs.filter(q => q.id !== id))
    toast.success('Question removed')
  }

  const addBlankQ = () => {
    const newQ = {
      id: `Q${questions.length + 1}`, subject: 'Maths', chapter: 'General',
      question: 'New question', options: { A: '', B: '', C: '', D: '' },
      correct: null, type: 'MCQ', hasDiagram: false, pageImage: null,
      marks: { correct: config.correctMark, wrong: config.wrongMark }
    }
    setQuestions(qs => [...qs, newQ])
    setEditQ(newQ)
  }

  // ── Save & Create Test ────────────────────────────────────
  const createTest = async () => {
    if (!questions.length) return toast.error('No questions found')
    if (!config.name.trim()) return toast.error('Please enter a test name')

    const testId    = uuidv4()
    const shareCode = generateShareCode()

    const test = {
      id: testId,
      shareCode,
      name: config.name,
      duration: config.duration * 60,
      correctMark: config.correctMark,
      wrongMark: config.wrongMark,
      subjects: [...new Set(questions.map(q => q.subject))],
      questions,
      totalMarks: questions.length * config.correctMark,
      createdAt: Date.now(),
      attempts: 0,
      bestScore: null
    }

    await saveTest(test)
    toast.success('Test created!')
    navigate('/')
  }

  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-3">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <button onClick={() => step > 0 ? setStep(s => s - 1) : navigate('/')}
            className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="font-bold text-gray-900 text-base">Create Test</h1>
            <p className="text-xs text-gray-500">Upload PDF/Image/Video to create CBT</p>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all
                  ${i < step ? 'bg-green-500 text-white'
                  : i === step ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-500'}`}>
                  {i < step ? '✓' : i + 1}
                </div>
                {i < STEPS.length - 1 && <div className={`w-4 h-0.5 ${i < step ? 'bg-green-400' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">

        {/* ── STEP 0: Upload ─────────────────────────────── */}
        {step === 0 && (
          <div className="fade-up space-y-4">
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
                ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/40'}`}>
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Upload size={26} className="text-blue-600" />
              </div>
              <p className="font-semibold text-gray-800">Drop files here or tap to browse</p>
              <p className="text-sm text-gray-500 mt-1">PDF • Images • Videos • Any size</p>
              <input ref={fileRef} type="file" multiple hidden
                accept=".pdf,image/*,video/*"
                onChange={e => handleFiles([...e.target.files])} />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-700">Uploaded Files ({files.length})</p>
                {files.map(f => (
                  <div key={f.id} className="flex items-center gap-3 bg-white rounded-xl p-3 border border-gray-200 shadow-sm">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center
                      ${f.type === 'pdf' ? 'bg-red-100' : f.type === 'image' ? 'bg-green-100' : 'bg-purple-100'}`}>
                      {f.type === 'pdf'   ? <FileText size={18} className="text-red-600" /> :
                       f.type === 'image' ? <Image    size={18} className="text-green-600" /> :
                                            <Video    size={18} className="text-purple-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                      <p className="text-xs text-gray-400 capitalize">{f.type} • {(f.file.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    {f.preview && <img src={f.preview} className="w-10 h-10 rounded object-cover" alt="" />}
                    <button onClick={() => setFiles(fs => fs.filter(x => x.id !== f.id))}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-400">
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Answer key upload section */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={18} className="text-yellow-600" />
                <p className="font-semibold text-yellow-800 text-sm">Answer Key (Optional)</p>
              </div>
              <div
                onClick={() => ansRef.current.click()}
                className="border border-dashed border-yellow-300 rounded-xl p-3 text-center cursor-pointer hover:bg-yellow-100 mb-3">
                <p className="text-xs text-yellow-700">Upload answer key PDF/Image</p>
                <input ref={ansRef} type="file" multiple hidden accept=".pdf,image/*"
                  onChange={e => {
                    const mapped = [...e.target.files].map(f => ({
                      file: f, type: f.type.includes('pdf') ? 'pdf' : 'image',
                      name: f.name, id: uuidv4()
                    }))
                    setAnsFiles(p => [...p, ...mapped])
                  }} />
              </div>
              {ansFiles.map(f => (
                <div key={f.id} className="flex items-center gap-2 text-xs text-yellow-700 mb-1">
                  <FileText size={12} /> <span className="truncate flex-1">{f.name}</span>
                  <button onClick={() => setAnsFiles(fs => fs.filter(x => x.id !== f.id))}><X size={12} /></button>
                </div>
              ))}
              <textarea
                value={ansKeyText}
                onChange={e => setAnsKeyText(e.target.value)}
                placeholder="Or paste answer key: 1-A, 2-B, 3-C... or ABCDA..."
                className="w-full border border-yellow-300 rounded-xl p-2 text-xs resize-none h-16 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>

            <button onClick={goToConfigure}
              className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-[0.98] transition-all">
              Continue <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* ── STEP 1: Configure ──────────────────────────── */}
        {step === 1 && (
          <div className="fade-up space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
              <h2 className="font-bold text-gray-900">Configure Test</h2>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Test Name</label>
                <input value={config.name} onChange={e => setConfig(c => ({ ...c, name: e.target.value }))}
                  placeholder="e.g. JEE Mains Mock 01"
                  className="w-full mt-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Duration (minutes)</label>
                <input type="number" value={config.duration}
                  onChange={e => setConfig(c => ({ ...c, duration: +e.target.value }))}
                  className="w-full mt-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Correct (+)</label>
                  <input type="number" value={config.correctMark}
                    onChange={e => setConfig(c => ({ ...c, correctMark: +e.target.value }))}
                    className="w-full mt-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Wrong (−)</label>
                  <input type="number" value={config.wrongMark}
                    onChange={e => setConfig(c => ({ ...c, wrongMark: +e.target.value }))}
                    className="w-full mt-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Image Mode toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Image Mode (Vision)</p>
                  <p className="text-xs text-gray-500">Better for PDFs with diagrams/circuits</p>
                </div>
                <button onClick={() => setConfig(c => ({ ...c, imageMode: !c.imageMode }))}
                  className={`w-12 h-6 rounded-full transition-colors ${config.imageMode ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${config.imageMode ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl">
                <AlertCircle size={16} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700">AI will extract questions with math, detect diagrams, and identify subjects automatically</p>
              </div>
            </div>

            <button onClick={startExtraction} disabled={extracting}
              className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-60 active:scale-[0.98] transition-all">
              {extracting
                ? <><Loader size={18} className="animate-spin" /> Extracting... {progress}%</>
                : <><BookOpen size={18} /> Extract Questions</>}
            </button>

            {extracting && (
              <div className="bg-white rounded-2xl p-4 border border-gray-200">
                <div className="flex justify-between text-xs text-gray-600 mb-2">
                  <span>Processing PDF...</span><span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-2 text-center">
                  {progress < 40 ? 'Parsing PDF pages...'
                  : progress < 80 ? 'AI extracting questions...'
                  : 'Finalizing...'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Review Questions ───────────────────── */}
        {step === 2 && (
          <div className="fade-up space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900">{questions.length} Questions Extracted</h2>
                <p className="text-xs text-gray-500">Review & edit before creating test</p>
              </div>
              <button onClick={addBlankQ}
                className="flex items-center gap-1 bg-blue-600 text-white text-sm px-3 py-1.5 rounded-xl">
                <Plus size={14} /> Add
              </button>
            </div>

            {/* Warnings */}
            {questions.some(q => !q.correct) && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                <AlertCircle size={15} className="text-yellow-600 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-700">Some questions have no answer key. You can add it in the next step.</p>
              </div>
            )}
            {questions.some(q => !q.options?.A) && (
              <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl">
                <AlertCircle size={15} className="text-orange-600 mt-0.5 shrink-0" />
                <p className="text-xs text-orange-700">Some questions have missing options. Edit them after creation.</p>
              </div>
            )}

            {questions.map((q, idx) => (
              <QuestionCard key={q.id} q={q} idx={idx}
                onEdit={() => setEditQ({ ...q })}
                onDelete={() => deleteQ(q.id)}
                onCrop={() => openCropForQuestion(q)} />
            ))}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={() => setStep(3)}
                className="bg-gray-100 text-gray-700 font-semibold py-3 rounded-2xl">
                Add Answer Key
              </button>
              <button onClick={createTest}
                className="bg-blue-600 text-white font-semibold py-3 rounded-2xl flex items-center justify-center gap-2">
                <CheckCircle size={16} /> Create Test ({questions.length} Qs)
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Answer Key ─────────────────────────── */}
        {step === 3 && (
          <div className="fade-up space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle size={20} className="text-green-600" />
                <h2 className="font-bold text-gray-900">Answer Key</h2>
              </div>
              <p className="text-xs text-gray-500 mb-4">Enter correct answers to enable analysis. Upload PDF/image or type manually.</p>

              <div onClick={() => ansRef.current.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 mb-4">
                <Upload size={20} className="mx-auto text-gray-400 mb-1" />
                <p className="text-xs text-gray-500">Upload Answer Key (PDF or Image)</p>
                <input ref={ansRef} type="file" multiple hidden accept=".pdf,image/*"
                  onChange={e => {
                    const mapped = [...e.target.files].map(f => ({
                      file: f, type: f.type.includes('pdf') ? 'pdf' : 'image',
                      name: f.name, id: uuidv4()
                    }))
                    setAnsFiles(p => [...p, ...mapped])
                  }} />
              </div>

              <div className="mb-3">
                <p className="text-xs font-semibold text-gray-600 mb-1">Bulk Input</p>
                <div className="flex gap-2">
                  <input value={ansKeyText} onChange={e => setAnsKeyText(e.target.value)}
                    placeholder="e.g. 1-A, 2-B, 3-C or ABCDA..."
                    className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={parseAnsKey}
                    className="bg-blue-600 text-white text-sm px-4 rounded-xl font-semibold">Parse</button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Formats: "1-A, 2-B" | "1.A 2.B" | "ABCDA..."</p>
              </div>

              {/* Individual answer grid */}
              <p className="text-xs font-semibold text-gray-600 mb-2">
                Individual Answers
                <span className="ml-2 text-blue-600">{Object.keys(ansKeyMap).length}/{questions.length} filled</span>
              </p>
              <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto pr-1">
                {questions.map((q, i) => (
                  <div key={q.id} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-gray-400">{i + 1}</span>
                    <select
                      value={ansKeyMap[i + 1] || ''}
                      onChange={e => {
                        const v = e.target.value
                        setAnsKeyMap(m => ({ ...m, [i + 1]: v }))
                        setQuestions(qs => qs.map((x, j) => j === i ? { ...x, correct: v || null } : x))
                      }}
                      className="w-full text-center border border-gray-300 rounded-lg py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      <option value="">-</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="D">D</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={createTest}
              className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2">
              <CheckCircle size={18} /> Create Test ({questions.length} Questions)
            </button>
          </div>
        )}
      </div>

      {/* ── Edit Question Modal ──────────────────────────── */}
      {editQ && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-0">
          <div className="bg-white w-full max-w-2xl rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Edit Question {editQ.id}</h3>
              <button onClick={() => setEditQ(null)} className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600">Subject</label>
                  <select value={editQ.subject} onChange={e => setEditQ(q => ({ ...q, subject: e.target.value }))}
                    className="w-full mt-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option>Maths</option><option>Physics</option><option>Chemistry</option><option>Biology</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">Chapter</label>
                  <input value={editQ.chapter} onChange={e => setEditQ(q => ({ ...q, chapter: e.target.value }))}
                    className="w-full mt-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600">Question</label>
                <textarea value={editQ.question} onChange={e => setEditQ(q => ({ ...q, question: e.target.value }))}
                  rows={4}
                  className="w-full mt-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              {['A','B','C','D'].map(opt => (
                <div key={opt}>
                  <label className="text-xs font-semibold text-gray-600">Option {opt}</label>
                  <input value={editQ.options?.[opt] || ''}
                    onChange={e => setEditQ(q => ({ ...q, options: { ...q.options, [opt]: e.target.value } }))}
                    className="w-full mt-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}

              <div>
                <label className="text-xs font-semibold text-gray-600">Correct Answer</label>
                <select value={editQ.correct || ''} onChange={e => setEditQ(q => ({ ...q, correct: e.target.value || null }))}
                  className="w-full mt-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Not Set</option>
                  <option value="A">A</option><option value="B">B</option>
                  <option value="C">C</option><option value="D">D</option>
                </select>
              </div>

              {editQ.pageImage && (
                <div>
                  <label className="text-xs font-semibold text-gray-600">Attached Diagram</label>
                  <img src={editQ.pageImage} alt="diagram" className="mt-1 w-full rounded-xl border border-gray-200 max-h-48 object-contain bg-gray-50" />
                  <button onClick={() => setEditQ(q => ({ ...q, pageImage: null, hasDiagram: false }))}
                    className="mt-1 text-xs text-red-500">Remove diagram</button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-5">
              <button onClick={() => setEditQ(null)}
                className="py-3 rounded-2xl border border-gray-300 text-gray-700 font-semibold text-sm">Cancel</button>
              <button onClick={() => saveEdit(editQ)}
                className="py-3 rounded-2xl bg-blue-600 text-white font-semibold text-sm">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Crop Mode Modal ──────────────────────────────── */}
      {cropMode && cropPage && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
          <div className="flex items-center justify-between p-4 bg-black/60 text-white">
            <button onClick={() => { setCropMode(false); setCropPage(null); setCropBox(null) }}>
              <X size={22} />
            </button>
            <p className="text-sm font-semibold">Draw to crop diagram</p>
            <Scissors size={18} className="text-yellow-400" />
          </div>
          <div className="flex-1 overflow-auto flex items-start justify-center p-2">
            <div
              ref={cropRef}
              className="relative select-none cursor-crosshair"
              onMouseDown={onCropMouseDown}
              onMouseMove={onCropMouseMove}
              onMouseUp={onCropMouseUp}
              onTouchStart={e => {
                const t = e.touches[0]
                const rect = cropRef.current.getBoundingClientRect()
                dragStart.current = { x: t.clientX - rect.left, y: t.clientY - rect.top }
                setCropBox(null)
              }}
              onTouchMove={e => {
                if (!dragStart.current) return
                const t = e.touches[0]
                const rect = cropRef.current.getBoundingClientRect()
                const cx = t.clientX - rect.left
                const cy = t.clientY - rect.top
                setCropBox({
                  x: Math.min(dragStart.current.x, cx),
                  y: Math.min(dragStart.current.y, cy),
                  w: Math.abs(cx - dragStart.current.x),
                  h: Math.abs(cy - dragStart.current.y)
                })
              }}
              onTouchEnd={onCropMouseUp}>
              <img src={cropPage.dataUrl} alt="page"
                style={{ width: Math.min(cropPage.width, window.innerWidth - 16), display: 'block' }} />
              {cropBox && (
                <div className="absolute border-2 border-yellow-400 bg-yellow-400/20 pointer-events-none"
                  style={{ left: cropBox.x, top: cropBox.y, width: cropBox.w, height: cropBox.h }} />
              )}
            </div>
          </div>
          <p className="text-center text-white/70 text-xs p-3">Drag to select diagram region</p>
        </div>
      )}
    </div>
  )
}

// ── Question Card Component ────────────────────────────────
function QuestionCard({ q, idx, onEdit, onDelete, onCrop }) {
  const [open, setOpen] = useState(false)
  const subjectColors = {
    Maths: 'bg-purple-100 text-purple-700',
    Physics: 'bg-blue-100 text-blue-700',
    Chemistry: 'bg-green-100 text-green-700'
  }
  const sc = subjectColors[q.subject] || 'bg-gray-100 text-gray-700'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 p-3" onClick={() => setOpen(o => !o)}>
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0">
          {idx + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sc}`}>{q.subject}</span>
            <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{q.chapter}</span>
            <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border">{q.type}</span>
            {q.correct && <span className="text-[10px] text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ {q.correct}</span>}
            {q.hasDiagram && <span className="text-[10px] text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">📷 Diagram</span>}
          </div>
          <p className="text-sm text-gray-800 line-clamp-2">{q.question}</p>
        </div>
        <ChevronRight size={16} className={`text-gray-400 shrink-0 mt-1 transition-transform ${open ? 'rotate-90' : ''}`} />
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
          {q.pageImage && (
            <img src={q.pageImage} alt="diagram"
              className="w-full rounded-xl border border-gray-200 max-h-52 object-contain bg-gray-50" />
          )}
          {['A','B','C','D'].map(opt => q.options?.[opt] && (
            <div key={opt} className={`flex items-start gap-2 p-2 rounded-lg text-sm
              ${q.correct === opt ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
              <span className={`font-bold w-5 shrink-0 ${q.correct === opt ? 'text-green-600' : 'text-gray-500'}`}>{opt}</span>
              <span className="text-gray-700">{q.options[opt]}</span>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={onEdit}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold">
              <Edit3 size={14} /> Edit
            </button>
            <button onClick={onCrop}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-orange-50 text-orange-700 text-sm font-semibold">
              <Scissors size={14} /> Crop Diagram
            </button>
            <button onClick={onDelete}
              className="flex items-center justify-center p-2 rounded-xl bg-red-50 text-red-600">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────
function fileToDataUrl(file) {
  return new Promise(resolve => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.readAsDataURL(file)
  })
}

async function extractVideoFrames(file, onProgress) {
  return new Promise(resolve => {
    const video = document.createElement('video')
    video.src = URL.createObjectURL(file)
    video.onloadedmetadata = async () => {
      const frames = []
      const interval = Math.max(30, Math.floor(video.duration / 10))
      const canvas = document.createElement('canvas')
      canvas.width  = 1280
      canvas.height = 720
      const ctx = canvas.getContext('2d')

      for (let t = 0; t < video.duration; t += interval) {
        await new Promise(res => {
          video.currentTime = t
          video.onseeked = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            frames.push({
              pageNum: frames.length + 1,
              lines: [],
              pageImage: canvas.toDataURL('image/jpeg', 0.8),
              hasDiagram: true,
              text: ''
            })
            onProgress && onProgress(Math.round((t / video.duration) * 100))
            res()
          }
        })
      }
      resolve(frames)
    }
    video.onerror = () => resolve([])
  })
}

async function extractAnsFromImage(dataUrl, apiKey) {
  try {
    const base64 = dataUrl.split(',')[1]
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
            { type: 'text', text: 'Extract the answer key from this image. Return ONLY in format: 1-A, 2-B, 3-C etc. No other text.' }
          ]
        }]
      })
    })
    const data = await res.json()
    return data.content?.[0]?.text || ''
  } catch { return '' }
}
