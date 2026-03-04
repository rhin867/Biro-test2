// PDF.js extractor — text + images + page renders
import * as pdfjsLib from 'pdfjs-dist'

// Use CDN worker to avoid bundle issues
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

// ─── Extract full text + images per page ─────────────────
export async function extractPDF(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const totalPages = pdf.numPages
  const pages = []

  for (let i = 1; i <= totalPages; i++) {
    onProgress && onProgress(Math.round((i / totalPages) * 40))
    const page = await pdf.getPage(i)

    // Text content
    const textContent = await page.getTextContent()
    const lines = buildLines(textContent.items)

    // Render page to canvas → base64 image (for diagrams)
    const scale = 1.5
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width  = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise
    const pageImage = canvas.toDataURL('image/jpeg', 0.82)

    // Detect if page has images/diagrams
    const ops = await page.getOperatorList()
    const hasDiagram = ops.fnArray.some(fn =>
      fn === pdfjsLib.OPS.paintImageXObject ||
      fn === pdfjsLib.OPS.paintInlineImageXObject
    )

    pages.push({ pageNum: i, lines, pageImage, hasDiagram, text: lines.join('\n') })
  }

  return { pages, totalPages }
}

// ─── Build readable lines from PDF text items ─────────────
function buildLines(items) {
  if (!items?.length) return []
  const lineMap = {}
  for (const item of items) {
    if (!item.str?.trim()) continue
    const y = Math.round(item.transform[5])
    if (!lineMap[y]) lineMap[y] = []
    lineMap[y].push({ x: item.transform[4], str: item.str })
  }
  return Object.keys(lineMap)
    .sort((a, b) => Number(b) - Number(a))
    .map(y =>
      lineMap[y]
        .sort((a, b) => a.x - b.x)
        .map(i => i.str)
        .join(' ')
        .trim()
    )
    .filter(Boolean)
}

// ─── Render single page as image for crop UI ──────────────
export async function renderPageAsImage(file, pageNum, scale = 1.8) {
  const ab  = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise
  const page = await pdf.getPage(pageNum)
  const vp   = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width  = vp.width
  canvas.height = vp.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.9), width: vp.width, height: vp.height }
}

// ─── Crop a region from a rendered page image ─────────────
export function cropRegion(dataUrl, region, pageW, pageH) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scaleX = img.width  / pageW
      const scaleY = img.height / pageH
      const canvas = document.createElement('canvas')
      canvas.width  = region.w * scaleX
      canvas.height = region.h * scaleY
      canvas.getContext('2d').drawImage(
        img,
        region.x * scaleX, region.y * scaleY,
        region.w * scaleX, region.h * scaleY,
        0, 0, canvas.width, canvas.height
      )
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.src = dataUrl
  })
}

// ─── Smart question splitter (no numbering needed) ────────
export function splitIntoQuestions(pages) {
  const allLines = pages.flatMap(p =>
    p.lines.map(l => ({ text: l, pageNum: p.pageNum, pageImage: p.pageImage, hasDiagram: p.hasDiagram }))
  )

  const blocks = []
  let current = []
  let currentPage = 1
  let currentPageImg = null
  let currentHasDiag = false

  const QNO_RE   = /^(?:Q\.?\s*|Question\s*)?\d{1,3}[.)]\s*/i
  const BLANK_RE  = /^[\s\-_=*]{0,3}$/

  for (let i = 0; i < allLines.length; i++) {
    const { text, pageNum, pageImage, hasDiagram } = allLines[i]

    // Explicit question number detected
    if (QNO_RE.test(text) && text.length > 4) {
      if (current.length > 0) {
        blocks.push({ lines: current, pageNum: currentPage, pageImage: currentPageImg, hasDiagram: currentHasDiag })
      }
      current = [text.replace(QNO_RE, '').trim()]
      currentPage    = pageNum
      currentPageImg = pageImage
      currentHasDiag = hasDiagram
      continue
    }

    // Heuristic split: blank line after substantial block
    if (BLANK_RE.test(text) && current.length >= 3) {
      if (current.join(' ').length > 40) {
        blocks.push({ lines: current, pageNum: currentPage, pageImage: currentPageImg, hasDiagram: currentHasDiag })
        current = []
        currentPage    = pageNum
        currentPageImg = pageImage
        currentHasDiag = hasDiagram
      }
      continue
    }

    if (text.trim()) {
      current.push(text.trim())
      if (hasDiagram) currentHasDiag = true
    }
  }
  if (current.length > 0) blocks.push({ lines: current, pageNum: currentPage, pageImage: currentPageImg, hasDiagram: currentHasDiag })

  return blocks
}

// ─── Parse answer key from text ───────────────────────────
export function parseAnswerKey(text) {
  const map = {}
  // Format: 1-A, 2-B  or  1.A 2.B  or  ABCD...
  const numbered = [...text.matchAll(/(\d{1,3})[.\-\s]+([A-Da-d1-4])/g)]
  if (numbered.length > 3) {
    for (const m of numbered) map[parseInt(m[1])] = m[2].toUpperCase().replace(/[1-4]/g, d => 'ABCD'[+d-1])
    return map
  }
  // Plain string: ABCDA...
  const plain = text.replace(/\s/g, '').match(/^[A-Da-d]+$/)
  if (plain) {
    plain[0].split('').forEach((c, i) => { map[i + 1] = c.toUpperCase() })
    return map
  }
  return map
}
