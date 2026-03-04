import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect } from 'react'
import { initDB } from './utils/db.js'

// Pages
import Home from './pages/Home.jsx'
import CreateTest from './pages/CreateTest.jsx'
import TestEngine from './pages/TestEngine.jsx'
import Analysis from './pages/Analysis.jsx'
import MistakeBook from './pages/MistakeBook.jsx'
import ShareTest from './pages/ShareTest.jsx'
import LiveChat from './pages/LiveChat.jsx'
import Settings from './pages/Settings.jsx'
import ScreenCapture from './pages/ScreenCapture.jsx'
import ImportExternal from './pages/ImportExternal.jsx'

export default function App() {
  useEffect(() => {
    initDB()
  }, [])

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '12px',
            background: '#1e293b',
            color: '#f8fafc',
            fontSize: '14px',
            padding: '10px 16px'
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } }
        }}
      />
      <Routes>
        <Route path="/"               element={<Home />} />
        <Route path="/create"         element={<CreateTest />} />
        <Route path="/test/:testId"   element={<TestEngine />} />
        <Route path="/analysis/:attemptId" element={<Analysis />} />
        <Route path="/mistakes"       element={<MistakeBook />} />
        <Route path="/share/:code"    element={<ShareTest />} />
        <Route path="/chat/:testId"   element={<LiveChat />} />
        <Route path="/settings"       element={<Settings />} />
        <Route path="/screen-capture" element={<ScreenCapture />} />
        <Route path="/import"         element={<ImportExternal />} />
        <Route path="*"               element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
