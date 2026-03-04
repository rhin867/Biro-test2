import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Send, MessageCircle,
  Users, Smile, BookOpen
} from 'lucide-react'
import toast from 'react-hot-toast'
import { v4 as uuidv4 } from 'uuid'
import { getChatByTest, saveChatMsg, getTest } from '../utils/db.js'
import { useStore } from '../store/useStore.js'
import { fmtDateTime } from '../utils/helpers.js'

export default function LiveChat() {
  const { testId } = useParams()
  const navigate   = useNavigate()
  const { userName } = useStore()
  const [test, setTest]     = useState(null)
  const [msgs, setMsgs]     = useState([])
  const [input, setInput]   = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const pollRef   = useRef(null)

  useEffect(() => {
    loadTest()
    loadMsgs()
    pollRef.current = setInterval(loadMsgs, 3000)
    return () => clearInterval(pollRef.current)
  }, [testId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  const loadTest = async () => {
    const t = await getTest(testId)
    setTest(t)
  }

  const loadMsgs = async () => {
    const all = await getChatByTest(testId)
    setMsgs(all)
  }

  const sendMsg = async () => {
    if (!input.trim()) return
    setSending(true)
    const msg = {
      id: uuidv4(),
      testId,
      text: input.trim(),
      sender: userName || 'Student',
      senderId: 'me',
      createdAt: Date.now()
    }
    await saveChatMsg(msg)
    setInput('')
    await loadMsgs()
    setSending(false)
  }

  const EMOJIS = ['👍','🔥','💡','😅','✅','❓','👀','🎯']

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft size={20}/>
          </button>
          <div className="flex-1">
            <h1 className="font-bold text-gray-900 text-sm">Live Chat</h1>
            <p className="text-xs text-gray-500 truncate">{test?.name || 'Test Chat'}</p>
          </div>
          <div className="flex items-center gap-1 bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"/>
            Live
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full space-y-3">
        {msgs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <MessageCircle size={24} className="text-blue-500"/>
            </div>
            <p className="font-semibold text-gray-700">No messages yet</p>
            <p className="text-sm text-gray-400 mt-1">Start the conversation!</p>
          </div>
        ) : (
          msgs.map(msg => {
            const isMe = msg.senderId === 'me'
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%]`}>
                  {!isMe && (
                    <p className="text-[10px] text-gray-400 mb-1 ml-1">{msg.sender}</p>
                  )}
                  <div className={isMe ? 'chat-mine' : 'chat-other'}>
                    <p className="text-sm">{msg.text}</p>
                  </div>
                  <p className="text-[9px] text-gray-300 mt-1 px-1">{fmtDateTime(msg.createdAt)}</p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Emoji bar */}
      <div className="bg-white border-t border-gray-100 px-4 py-2 max-w-2xl mx-auto w-full">
        <div className="flex gap-2 mb-2">
          {EMOJIS.map(e => (
            <button key={e} onClick={() => setInput(i => i + e)}
              className="text-lg hover:scale-125 transition-transform">{e}</button>
          ))}
        </div>
        {/* Input */}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMsg()}
            placeholder="Type a message..."
            className="flex-1 border border-gray-300 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={sendMsg} disabled={sending || !input.trim()}
            className="w-11 h-11 bg-blue-600 text-white rounded-2xl flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 transition-all">
            <Send size={16}/>
          </button>
        </div>
      </div>
    </div>
  )
}
