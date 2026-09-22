import { resolveDiagramTextPhysicalScale, normalizeDiagramTextUserScale, svgNode } from './svg-primitives-v0.1.mjs';
import { installSmartLabelDrag } from './svg-smart-label-v0.1.mjs';
import { installSvgViewport } from './svg-viewport-v0.1.mjs';

// Opt-in presentation bridge for renderers which already own their SVG content.
// Labels are lifted within their own coordinate root; no model values are read.
export function installSvgPlotControls(svg, { root = svg, toolbar, title = 'Plot', scaleText = true, avoidCollisions = true } = {}) {
  let textScale = 1;
  const metrics = new WeakMap();
  const base = svg.viewBox.baseVal;
  const baseViewBox = { x: base.x, y: base.y, w: base.width, h: base.height };
  const controls = document.createElement('div');
  controls.className = 'common-plot-controls';
  controls.setAttribute('aria-label', `${title} controls`);
  const button = (label, text, action) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = text; b.setAttribute('aria-label', `${title} ${label}`);
    if (action) b.addEventListener('click', action);
    controls.append(b); return b;
  };
  const textLabel = document.createElement('span'); textLabel.textContent = 'Text'; controls.append(textLabel);
  const smaller = button('smaller text', '−', () => setText(textScale - .1));
  const textReset = button('reset text', '100%', () => setText(1));
  const larger = button('larger text', '+', () => setText(textScale + .1));
  const sizeLabel = document.createElement('span'); sizeLabel.textContent = 'Size'; controls.append(sizeLabel);
  const zoomOut = button('zoom out', '−');
  const zoomReset = button('reset size', '100%');
  const zoomIn = button('zoom in', '+');
  const reset = button('reset view', 'Reset');
  toolbar.append(controls);
  const viewport = installSvgViewport(svg, {
    baseViewBox, maxZoom: 4, maxZoomOut: 2,
    buttonOnlyZoom: true, panOnlyWhenZoomed: true, allowPageScrollWhenPanDisabled: true,
    zoomInButton: zoomIn, zoomOutButton: zoomOut, fitButton: zoomReset, resetButton: reset,
    onViewBoxChange: box => { zoomReset.textContent = `${Math.round(baseViewBox.w / box.w * 100)}%`; },
  });
  const drag = installSmartLabelDrag(svg);
  function prepare() {
    let layer = root.querySelector(':scope > [data-plot-label-layer]');
    if (layer) return layer;
    layer = svgNode('g', { 'data-plot-label-layer': title });
    const textNodes = [...root.querySelectorAll('text')].filter(n => !n.closest('defs'));
    const used = new Set();
    const occurrences = new Map();
    textNodes.forEach(text => {
      const group = text.closest('.labelGroup');
      const content = group && root.contains(group) ? group : text;
      if (used.has(content)) return;
      used.add(content);
      // Semantic keys survive value changes and conditional neighboring labels.
      const name = content.textContent.replace(/[+−-]?\d+(?:[.,]\d+)*/g, '#').replace(/\s+/g, ' ').trim();
      const occurrence = occurrences.get(name) ?? 0;
      occurrences.set(name, occurrence + 1);
      const outer = svgNode('g', { 'data-movable-label': 'true', 'data-label-key': `${title}-${name}-${occurrence}` });
      const inner = svgNode('g', { 'data-label-content': 'true' });
      inner.append(content); outer.append(inner); layer.append(outer);
      outer.style.cursor = 'move'; outer.style.touchAction = 'none';
      outer.setAttribute('tabindex', '0'); outer.setAttribute('role', 'img');
      outer.setAttribute('aria-label', content.textContent);
    });
    root.append(layer); // Above grid, paths, markers and white plot backgrounds.
    return layer;
  }
  function refresh() {
    const layer = prepare();
    const physical = scaleText ? resolveDiagramTextPhysicalScale(textScale, window.innerWidth) : textScale;
    svg.dataset.textBaseScale = String(scaleText ? resolveDiagramTextPhysicalScale(1, window.innerWidth) : 1);
    svg.dataset.textUserScale = String(textScale);
    const nodes = [...layer.querySelectorAll('text,tspan')];
    for (const node of nodes) {
      if (!metrics.has(node)) metrics.set(node, {
        font: parseFloat(getComputedStyle(node).fontSize),
        dy: node.hasAttribute('dy') ? Number(node.getAttribute('dy')) : null,
      });
    }
    for (const node of nodes) {
      const metric = metrics.get(node);
      node.style.fontSize = `${metric.font * physical}px`;
      if (metric.dy !== null && Number.isFinite(metric.dy)) node.setAttribute('dy', metric.dy * physical);
    }
    const occupied = [];
    for (const group of layer.children) {
      const content = group.querySelector('[data-label-content]');
      content.removeAttribute('transform');
      const b = content.getBBox();
      const pad = 12;
      let dx = Math.max(baseViewBox.x + pad - b.x, Math.min(0, baseViewBox.x + baseViewBox.w - pad - b.x - b.width));
      let dy = Math.max(baseViewBox.y + pad - b.y, Math.min(0, baseViewBox.y + baseViewBox.h - pad - b.y - b.height));
      const overlaps = y => occupied.some(r => b.x + dx < r.x + r.w + 4 && b.x + dx + b.width + 4 > r.x && y < r.y + r.h + 4 && y + b.height + 4 > r.y);
      if (avoidCollisions && overlaps(b.y + dy)) {
        for (let y = baseViewBox.y + pad; y + b.height < baseViewBox.y + baseViewBox.h - pad; y += 12) {
          if (!overlaps(y)) { dy = y - b.y; break; }
        }
      }
      content.setAttribute('transform', `translate(${dx} ${dy})`);
      occupied.push({x:b.x+dx,y:b.y+dy,w:b.width,h:b.height});
      group.querySelector('[data-label-hit]')?.remove();
      const hit = svgNode('rect', { 'data-label-hit': 'true', x:b.x+dx-5,y:b.y+dy-5,width:b.width+10,height:b.height+10,fill:'transparent','pointer-events':'all' });
      group.prepend(hit);
    }
    drag.applyStoredPositions();
    const box = viewport.getViewBox();
    svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
  }
  function setText(value) {
    textScale = Math.round(normalizeDiagramTextUserScale(value) * 10) / 10;
    textReset.textContent = `${Math.round(textScale * 100)}%`;
    smaller.disabled = textScale <= .5; larger.disabled = textScale >= 2;
    refresh();
  }
  window.addEventListener('resize', refresh);
  refresh();
  return { refresh, viewport, drag, setText };
}
