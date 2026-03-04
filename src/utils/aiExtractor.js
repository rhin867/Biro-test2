// AI-powered question extractor using Claude API

const CLAUDE_API = 'https://api.anthropic.com/v1/messages'

// ─── Main extractor ───────────────────────────────────────
export async function extractQuestionsWithAI(pages, config, apiKey, onProgress) {
  const { subject, totalQuestions, correctMark, wrongMark } = config
  const BATCH = 8 // pages per API call

  const allQuestions = []
  let qIndex = 1

  for (let i = 0; i < pages.length; i += BATCH) {
    const batch = pages.slice(i, i + BATCH)
    const combinedText = batch.map(p => `[PAGE ${p.pageNum}]\n${p.text}`).join('\n\n')

    onProgress && onProgress(40 + Math.round(((i + BATCH) / pages.length) * 50))

    try {
      const questions = await callClaudeExtract(combinedText, batch, config, apiKey, qIndex)
      allQuestions.push(...questions)
      qIndex += questions.length
    } catch (e) {
      console.error('AI extraction batch error:', e)
      // Fallback: raw text blocks
      const rawQs = fallbackExtract(batch, qIndex, subject)
      allQuestions.push(...rawQs)
      qIndex += rawQs.length
    }
  }

  return allQuestions
}

// ─── Call Claude API ──────────────────────────────────────
async function callClaudeExtract(text, pages, config, apiKey, startIdx) {
  const { subject, correctMark, wrongMark } = config

  const prompt = `You are an expert JEE question extractor. Extract ALL questions from this PDF text.

RULES:
- Extract every question even if numbering is missing
- Detect subject: Physics / Chemistry / Maths / Biology
- Detect chapter intelligently from content
- Handle LaTeX math notation
- Options can be A/B/C/D or (A)(B)(C)(D) or 1/2/3/4
- If no options found, mark as Numerical type
- Preserve all math symbols and equations exactly
- If answer key present in text, extract correct answer

RETURN ONLY THIS JSON (no markdown, no extra text):
{
  "questions": [
    {
      "id": "Q${startIdx}",
      "subject": "Physics|Chemistry|Maths",
      "chapter": "chapter name",
      "question": "full question text with math",
      "options": {"A":"","B":"","C":"","D":""},
      "correct": "A|B|C|D|null",
      "type": "MCQ|Numerical",
      "hasDiagram": false,
      "diagramPageNum": null
    }
  ]
}

PDF TEXT:
${text.slice(0, 12000)}`

  const res = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || 'API error')
  }

  const data = await res.json()
  const raw = data.content?.[0]?.text || '{}'

  // Find diagram pages
  const pagesWithDiagrams = pages.filter(p => p.hasDiagram)

  let parsed
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('JSON parse failed')
  }

  // Attach page images to questions with diagrams
  const questions = (parsed.questions || []).map((q, idx) => {
    const absoluteIdx = startIdx + idx - 1
    const matchPage   = pagesWithDiagrams.find(p => p.pageNum === q.diagramPageNum)
    return {
      ...q,
      id: `Q${startIdx + idx}`,
      pageImage: matchPage?.pageImage || null,
      hasDiagram: q.hasDiagram || !!matchPage,
      correct: q.correct || null,
      marks: { correct: 4, wrong: 1 }
    }
  })

  return questions
}

// ─── Fallback: raw text blocks → questions ────────────────
function fallbackExtract(pages, startIdx, subjectHint) {
  const questions = []
  let qi = startIdx

  for (const page of pages) {
    const text = page.text
    const blocks = text.split(/\n{2,}/).filter(b => b.trim().length > 20)

    for (const block of blocks) {
      const lines = block.split('\n').filter(Boolean)
      if (lines.length < 2) continue

      const qText = lines[0]
      const opts = {}
      const optRe = /^[(]?([A-Da-d])[).]\s*(.+)/

      for (const line of lines.slice(1)) {
        const m = line.match(optRe)
        if (m) opts[m[1].toUpperCase()] = m[2].trim()
      }

      questions.push({
        id: `Q${qi++}`,
        subject: subjectHint || 'Maths',
        chapter: 'General',
        question: qText.trim(),
        options: Object.keys(opts).length >= 2 ? opts : { A: '', B: '', C: '', D: '' },
        correct: null,
        type: Object.keys(opts).length >= 2 ? 'MCQ' : 'Numerical',
        hasDiagram: page.hasDiagram,
        pageImage: page.hasDiagram ? page.pageImage : null,
        marks: { correct: 4, wrong: 1 }
      })
    }
  }
  return questions
}

// ─── AI Weekly Plan Generator ─────────────────────────────
export async function generateWeeklyPlan(analysisData, apiKey) {
  const prompt = `You are a JEE expert coach. Based on this test analysis, create a 7-day study plan.

ANALYSIS DATA:
${JSON.stringify(analysisData, null, 2)}

Generate a personalized weekly plan. Return ONLY JSON:
{
  "summary": "2-3 line performance summary",
  "attemptStyle": "label",
  "weeklyPlan": [
    {
      "day": 1,
      "dayName": "Monday",
      "focus": "main topic",
      "tasks": ["task1","task2","task3"],
      "hours": 3,
      "subjects": ["Maths"]
    }
  ],
  "priorityChapters": [{"chapter":"","subject":"","reason":"","urgency":"high|medium|low"}],
  "formulaRevision": ["formula1","formula2"],
  "insights": ["insight1","insight2","insight3"]
}`

  const res = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  const data = await res.json()
  const raw  = data.content?.[0]?.text || '{}'
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return null
  }
}

// ─── AI Chat helper ───────────────────────────────────────
export async function askAIAboutQuestion(question, userAnswer, correctAnswer, apiKey) {
  const prompt = `You are a JEE expert tutor. A student got this question wrong.

Question: ${question.question}
Student's Answer: ${userAnswer || 'Not attempted'}
Correct Answer: ${correctAnswer}
Subject: ${question.subject} | Chapter: ${question.chapter}

Give a clear, concise explanation (max 150 words) of:
1. Why the correct answer is right
2. Key concept to remember
3. One tip to avoid this mistake

Be encouraging and student-friendly.`

  const res = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  const data = await res.json()
  return data.content?.[0]?.text || 'Could not generate explanation.'
}
