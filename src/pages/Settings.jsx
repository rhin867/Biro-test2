import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Key, User, Eye, EyeOff,
  Save, CheckCircle, Trash2, Download,
  Upload, Info, Sun, ExternalLink,
  Shield, Zap, RefreshCw, BookOpen
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore.js'
import { exportAllData, importAllData } from '../utils/db.js'

export default function Settings() {
  const navigate = useNavigate()
  const { apiKey, setApiKey, userName, setUserName, darkMode, setDarkMode } = useStore()
  const [keyInput, setKeyInput]   = useState(apiKey || '')
  const [nameInput, setNameInput] = useState(userName || '')
  const [showKey, setShowKey]     = useState(false)
  const [testing, setTesting]     = useState(false)
  const [keyValid, setKeyValid]   = useState(null)

  useEffect(() => { setKeyInput(apiKey || '') }, [apiKey])

  const saveSettings = () => {
    setApiKey(keyInput.trim())
    setUserName(nameInput.trim() || 'Student')
    toast.success('Settings saved!')
  }

  const testApiKey = async () => {
    if (!keyInput.trim()) return toast.error('Enter API key first')
    setTesting(true); setKeyValid(null)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': keyInput.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      })
      if (res.ok) { setKeyValid(true); toast.success('API key is valid!') }
      else        { setKeyValid(false); toast.error('Invalid API key') }
    } catch { setKeyValid(false); toast.error('Connection failed') }
    setTesting(false)
  }

  const handleExport = async () => {
    const data = await exportAllData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `biro-backup-${Date.now()}.json`
    a.click()
    toast.success('Backup exported!')
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      await importAllData(JSON.parse(await file.text()))
      toast.success('Data imported!')
    } catch { toast.error('Invalid backup file') }
  }

  const clearAllData = () => {
    if (!window.confirm('Delete ALL data? Cannot be undone.')) return
    indexedDB.deleteDatabase('biro-test2')
    toast.success('Cleared! Refreshing...')
    setTimeout(() => window.location.reload(), 1000)
  }

  return (
    <div className="min-h-dvh bg-gray-50 pb-10">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="font-bold text-gray-900">Settings</h1>
            <p className="text-xs text-gray-500">Configure Biro-Test2</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">
        {/* API Key */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 border-b border-gray-100 flex items-center gap-2">
            <div className="w-8 h-8 bg-yellow-100 rounded-xl flex items-center justify-center">
              <Key size={16} className="text-yellow-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Anthropic API Key</p>
              <p className="text-xs text-gray-400">Required for AI extraction & analysis</p>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={e => { setKeyInput(e.target.value); setKeyValid(null) }}
                placeholder="sk-ant-api03-..."
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {keyValid === true  && <div className="flex items-center gap-2 text-green-600 text-xs"><CheckCircle size={14}/> Verified!</div>}
            {keyValid === false && <div className="flex items-center gap-2 text-red-500 text-xs"><Info size={14}/> Invalid key.</div>}
            <div className="flex gap-2">
              <button onClick={testApiKey} disabled={testing}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-100 text-gray-700 font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                {testing ? <RefreshCw size={14} className="animate-spin"/> : <Zap size={14}/>}
                {testing ? 'Testing...' : 'Test Key'}
              </button>
              <button onClick={saveSettings}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm">
                <Save size={14}/> Save
              </button>
            </div>
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-blue-600 text-xs hover:underline">
              <ExternalLink size={12}/> Get key from console.anthropic.com
            </a>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
              <Shield size={14} className="text-blue-500 mt-0.5 shrink-0"/>
              <p className="text-xs text-blue-700">Key stored locally only. Never sent anywhere except Anthropic's API.</p>
            </div>
          </div>
        </div>

        {/* Profile */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 border-b border-gray-100 flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-100 rounded-xl flex items-center justify-center">
              <User size={16} className="text-purple-600"/>
            </div>
            <p className="font-bold text-gray-900 text-sm">Profile</p>
          </div>
          <div className="p-4">
            <label className="text-xs font-semibold text-gray-600">Your Name</label>
            <input value={nameInput} onChange={e => setNameInput(e.target.value)}
              placeholder="Enter your name"
              className="w-full mt-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 border-b border-gray-100 flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center">
              <Sun size={16} className="text-gray-600"/>
            </div>
            <p className="font-bold text-gray-900 text-sm">Appearance</p>
          </div>
          <div className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">NTA White Mode</p>
              <p className="text-xs text-gray-500">Clean white interface like NTA CBT</p>
            </div>
            <button onClick={() => setDarkMode(!darkMode)}
              className={`w-12 h-6 rounded-full transition-colors ${!darkMode ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${!darkMode ? 'translate-x-6' : 'translate-x-0.5'}`}/>
            </button>
          </div>
        </div>

        {/* Data */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 border-b border-gray-100 flex items-center gap-2">
            <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center">
              <Download size={16} className="text-green-600"/>
            </div>
            <p className="font-bold text-gray-900 text-sm">Data & Backup</p>
          </div>
          <div className="p-4 space-y-3">
            <button onClick={handleExport}
              className="w-full flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 hover:bg-green-100">
              <Upload size={16}/>
              <div className="text-left">
                <p className="text-sm font-semibold">Export All Data</p>
                <p className="text-xs text-green-600">Download backup JSON</p>
              </div>
            </button>
            <label className="w-full flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 hover:bg-blue-100 cursor-pointer">
              <Download size={16}/>
              <div className="text-left">
                <p className="text-sm font-semibold">Import Backup</p>
                <p className="text-xs text-blue-600">Restore from JSON</p>
              </div>
              <input type="file" accept=".json" hidden onChange={handleImport}/>
            </label>
            <button onClick={clearAllData}
              className="w-full flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 hover:bg-red-100">
              <Trash2 size={16}/>
              <div className="text-left">
                <p className="text-sm font-semibold">Clear All Data</p>
                <p className="text-xs text-red-400">Cannot be undone</p>
              </div>
            </button>
          </div>
        </div>

        {/* About */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <BookOpen size={18} className="text-white"/>
          </div>
          <div>
            <p className="font-bold text-gray-900">Biro-Test2</p>
            <p className="text-xs text-gray-500">v1.0.0 • Advanced JEE CBT Analyzer</p>
            <p className="text-xs text-gray-400">Offline-first • PWA Ready</p>
          </div>
        </div>

        <button onClick={saveSettings}
          className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-[0.98]">
          <Save size={18}/> Save All Settings
        </button>
      </div>
    </div>
  )
            }
