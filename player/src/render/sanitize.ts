// Тексты шагов приходят из YAML как ограниченный HTML. Оставляем только разметку для пояснений,
// без атрибутов: ни скриптов, ни ссылок, ни обработчиков событий.
const ALLOWED = new Set(["B", "STRONG", "I", "EM", "CODE", "KBD", "BR"]);

function clean(node: Node, into: Node): void {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) {
      into.appendChild(document.createTextNode(child.textContent ?? ""));
    } else if (child instanceof Element) {
      if (ALLOWED.has(child.tagName)) {
        const copy = document.createElement(child.tagName.toLowerCase());
        clean(child, copy);
        into.appendChild(copy);
      } else if (child.tagName !== "SCRIPT" && child.tagName !== "STYLE") {
        clean(child, into); // неизвестный тег — оставляем только его текст
      }
    }
  }
}

/** Безопасный фрагмент DOM из ограниченного HTML пояснения. */
export function sanitizeHtml(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;
  const fragment = document.createDocumentFragment();
  clean(template.content, fragment);
  return fragment;
}
