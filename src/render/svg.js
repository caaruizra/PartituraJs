export function createSvg(name, attrs = {}, text = '') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined) node.setAttribute(key, value);
  }
  if (text !== '') node.textContent = text;
  return node;
}
