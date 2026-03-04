import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useStore = create(
  persist(
    (set, get) => ({
      // ── User settings ───────────────────────────
      apiKey: '',
      userName: 'Student',
      darkMode: false,
      setApiKey: (k)  => set({ apiKey: k }),
      setUserName: (n) => set({ userName: n }),
      setDarkMode: (v) => set({ darkMode: v }),

      // ── Active test session ──────────────────────
      activeTest: null,
      setActiveTest: (t) => set({ activeTest: t }),
      clearActiveTest: () => set({ activeTest: null }),

      // ── Active attempt (live CBT state) ─────────
      attempt: {
        id: null,
        testId: null,
        responses: {},       // { Q1: 'A', Q2: 'B' }
        markedForReview: [], // ['Q3','Q7']
        visitedQuestions: [],
        timePerQuestion: {}, // { Q1: 45 } seconds
        totalTimeLeft: 0,
        startedAt: null,
        subjectSwitches: [],
        mistakeTags: {},     // { Q1: ['concept','silly'] }
        notes: {},           // { Q1: 'my note' }
        status: 'idle'       // idle | active | paused | submitted
      },

      initAttempt: (testId, attemptId, durationSecs) => set({
        attempt: {
          id: attemptId,
          testId,
          responses: {},
          markedForReview: [],
          visitedQuestions: [],
          timePerQuestion: {},
          totalTimeLeft: durationSecs,
          startedAt: Date.now(),
          subjectSwitches: [],
          mistakeTags: {},
          notes: {},
          status: 'active'
        }
      }),

      setResponse: (qId, answer) => set(s => ({
        attempt: { ...s.attempt, responses: { ...s.attempt.responses, [qId]: answer } }
      })),

      clearResponse: (qId) => set(s => {
        const r = { ...s.attempt.responses }
        delete r[qId]
        return { attempt: { ...s.attempt, responses: r } }
      }),

      toggleMark: (qId) => set(s => {
        const marked = s.attempt.markedForReview
        return {
          attempt: {
            ...s.attempt,
            markedForReview: marked.includes(qId)
              ? marked.filter(id => id !== qId)
              : [...marked, qId]
          }
        }
      }),

      markVisited: (qId) => set(s => {
        const v = s.attempt.visitedQuestions
        if (v.includes(qId)) return {}
        return { attempt: { ...s.attempt, visitedQuestions: [...v, qId] } }
      }),

      addTimeToQuestion: (qId, secs) => set(s => ({
        attempt: {
          ...s.attempt,
          timePerQuestion: {
            ...s.attempt.timePerQuestion,
            [qId]: (s.attempt.timePerQuestion[qId] || 0) + secs
          }
        }
      })),

      tickTimer: () => set(s => ({
        attempt: { ...s.attempt, totalTimeLeft: Math.max(0, s.attempt.totalTimeLeft - 1) }
      })),

      logSubjectSwitch: (subject) => set(s => ({
        attempt: {
          ...s.attempt,
          subjectSwitches: [
            ...s.attempt.subjectSwitches,
            { subject, at: Date.now() }
          ]
        }
      })),

      setMistakeTags: (qId, tags) => set(s => ({
        attempt: { ...s.attempt, mistakeTags: { ...s.attempt.mistakeTags, [qId]: tags } }
      })),

      setNote: (qId, note) => set(s => ({
        attempt: { ...s.attempt, notes: { ...s.attempt.notes, [qId]: note } }
      })),

      submitAttempt: () => set(s => ({
        attempt: { ...s.attempt, status: 'submitted', submittedAt: Date.now() }
      })),

      clearAttempt: () => set({
        attempt: {
          id: null, testId: null, responses: {}, markedForReview: [],
          visitedQuestions: [], timePerQuestion: {}, totalTimeLeft: 0,
          startedAt: null, subjectSwitches: [], mistakeTags: {}, notes: {}, status: 'idle'
        }
      }),

      // ── UI state ────────────────────────────────
      paletteOpen: false,
      setPaletteOpen: (v) => set({ paletteOpen: v }),

      currentSubject: null,
      setCurrentSubject: (s) => set({ currentSubject: s }),

      // ── Notification badge ───────────────────────
      newMessages: 0,
      setNewMessages: (n) => set({ newMessages: n }),
      clearMessages: () => set({ newMessages: 0 })
    }),
    {
      name: 'biro-test2-store',
      partialize: (s) => ({
        apiKey:   s.apiKey,
        userName: s.userName,
        darkMode: s.darkMode
      })
    }
  )
)
