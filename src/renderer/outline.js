// outline.js — collapsible document outline / navigator.
//
// Lists the document's H1–H3 headings in order. Clicking an entry smoothly
// scrolls that heading into view. The list rebuilds (debounced) as headings
// change, and a subtle hint is shown when the document has no headings.
//
// The panel reads heading text straight from the ProseMirror doc (not getHTML),
// so the rebuild stays cheap even on large documents.

const OUTLINE_KEY = 'unbound-outline'
const LEVELS = [1, 2, 3]

/**
 * Mount the outline panel.
 *
 * @param {HTMLElement} host - the side-panel container element.
 * @param {import('@tiptap/core').Editor} editor
 * @param {HTMLElement} scrollContainer - the scrollable editor area used to
 *        scroll a heading into view.
 * @returns {{
 *   rebuild: () => void,
 *   rebuildDebounced: () => void,
 *   toggle: () => boolean,
 *   setVisible: (v: boolean) => void,
 *   isVisible: () => boolean
 * }}
 */
export function mountOutline(host, editor, scrollContainer) {
  host.classList.add('outline-panel')
  host.innerHTML = ''

  const header = document.createElement('div')
  header.className = 'outline-header'
  header.textContent = 'Outline'

  const list = document.createElement('div')
  list.className = 'outline-list'

  const empty = document.createElement('div')
  empty.className = 'outline-empty'
  empty.textContent = 'No headings yet. Use Heading 1–3 to build an outline.'

  // Filter box. Long agent logs have dozens of headings, most of them numbered
  // sections you don't care about right now — scrolling a 200-item list to find
  // one is slower than typing three letters.
  const filter = document.createElement('input')
  filter.type = 'search'
  filter.className = 'outline-filter'
  filter.placeholder = 'Filter headings…'
  filter.setAttribute('aria-label', 'Filter headings')
  filter.addEventListener('input', () => rebuild())

  // Keyboard nav: the panel is a list you move through, not a form to tab out of.
  filter.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const first = list.querySelector('.outline-item')
      if (first) first.focus()
    } else if (e.key === 'Escape') {
      filter.value = ''
      rebuild()
      editor.commands.focus()
    }
  })

  // Clicking anywhere on the panel shouldn't steal the selection from the doc.
  host.addEventListener('mousedown', (e) => {
    if (e.target === filter) return
    if (e.target.closest('.outline-item')) e.preventDefault()
  })

  host.append(header, filter, list, empty)

  // Collect headings from the ProseMirror doc with their document positions.
  function collect() {
    const out = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading' && LEVELS.includes(node.attrs.level)) {
        out.push({ level: node.attrs.level, text: node.textContent || '(empty heading)', pos })
      }
      return true
    })
    return out
  }

  function scrollToPos(pos) {
    // Resolve the heading's DOM node and smoothly scroll it into view inside
    // the editor scroll container. Place the cursor there too for good UX.
    const dom = editor.view.nodeDOM(pos) || editor.view.domAtPos(pos + 1)?.node
    const elNode = dom && dom.nodeType === 1 ? dom : dom?.parentElement
    if (elNode && typeof elNode.scrollIntoView === 'function') {
      elNode.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    editor.chain().setTextSelection(pos + 1).run()
  }

  function rebuild() {
    const all = collect()
    const q = filter.value.trim().toLowerCase()
    const headings = q ? all.filter((h) => h.text.toLowerCase().includes(q)) : all
    list.innerHTML = ''

    if (!all.length) {
      empty.textContent = 'No headings yet. Use Heading 1–3 to build an outline.'
      empty.classList.add('show')
      return
    }
    if (!headings.length) {
      // Distinguish "this document has no headings" from "your filter matches
      // nothing" — otherwise an empty list looks like a bug.
      empty.textContent = `No headings match “${filter.value.trim()}”.`
      empty.classList.add('show')
      return
    }
    empty.classList.remove('show')
    for (const h of headings) {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = `outline-item outline-h${h.level}`
      item.textContent = h.text
      item.title = h.text
      item.addEventListener('mousedown', (e) => e.preventDefault())
      item.addEventListener('click', () => scrollToPos(h.pos))
      list.append(item)
    }
  }

  let rebuildTimer = null
  function rebuildDebounced() {
    clearTimeout(rebuildTimer)
    rebuildTimer = setTimeout(rebuild, 300)
  }

  let visible = false
  function setVisible(v) {
    visible = !!v
    host.classList.toggle('show', visible)
    try {
      localStorage.setItem(OUTLINE_KEY, visible ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (visible) rebuild()
  }
  function toggle() {
    setVisible(!visible)
    return visible
  }
  function isVisible() {
    return visible
  }

  // Restore persisted visibility.
  let persisted = false
  try {
    persisted = localStorage.getItem(OUTLINE_KEY) === '1'
  } catch {
    /* ignore */
  }
  setVisible(persisted)

  function reset() {
    // Called when a different document is loaded: a filter left over from the
    // previous file would hide headings for no visible reason.
    filter.value = ''
    rebuild()
  }

  return { rebuild, rebuildDebounced, toggle, setVisible, isVisible, reset }
}

export default mountOutline
