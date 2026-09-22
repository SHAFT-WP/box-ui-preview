import { installSvgPlotControls } from '../../../common/diagram/svg-plot-controls-v0.1.mjs';
import { svgNode } from '../../../common/diagram/svg-primitives-v0.1.mjs';

const topSvg = document.getElementById('svg');
const top = installSvgPlotControls(topSvg, {
  root: document.getElementById('patternLayer'), toolbar: document.querySelector('.primaryViz .vizbar'), title: 'Top View',
});
const profileSvg = document.getElementById('profileWorkSvg');
const profileRoot = document.getElementById('profileWorkRoot');
const profile = installSvgPlotControls(profileSvg, {
  root: profileRoot, toolbar: document.getElementById('profileWorkToolbar'), title: 'Profile',
});
window.boxPlotUi = { top, profile };
const z = installSvgPlotControls(document.getElementById('tpZSvg'), {
  root: document.getElementById('tpZRoot'), toolbar: document.querySelector('.tempZHead'), title: 'Z Diagram', scaleText: false, avoidCollisions: false,
});
window.boxPlotUi.z = z;

// Projection only: existing tracking endpoints and bomb samples, not a new solve.
function renderProfile(p, bomb, prof) {
  z.refresh();
  profileRoot.replaceChildren();
  const width = 840, height = 490, left = 85, floor = 570;
  const range = prof.mapGround;
  const altitudeSpan = Math.max(1, prof.trackMsl - p.targetElevation);
  const project = (x, msl) => ({x:left + x / range * width, y:floor - (msl-p.targetElevation)/altitudeSpan*height});
  const track = project(0, prof.trackMsl);
  const release = project(prof.trackGround, prof.releaseMsl);
  const impact = project(range, p.targetElevation);
  const add = (tag, attrs, text) => { const n=svgNode(tag,attrs,text); profileRoot.append(n); return n; };
  for (let x=left;x<=left+width;x+=84) add('line',{x1:x,x2:x,y1:45,y2:floor,stroke:'#e5e7eb'});
  for (let y=80;y<=floor;y+=70) add('line',{x1:left,x2:left+width,y1:y,y2:y,stroke:'#e5e7eb'});
  add('line',{x1:left,x2:left+width,y1:floor,y2:floor,stroke:'#606e77','stroke-width':2});
  add('line',{x1:track.x,y1:track.y,x2:release.x,y2:release.y,stroke:'#176dac','stroke-width':4});
  const points=bomb.samples.map(s=>project(prof.trackGround+s.x,p.targetElevation+s.altitude));
  add('polyline',{points:points.map(pt=>`${pt.x},${pt.y}`).join(' '),fill:'none',stroke:'#087b4c','stroke-width':4});
  for (const [name,pt,alt] of [['Track Point',track,prof.trackMsl],['Release',release,prof.releaseMsl],['Target',impact,p.targetElevation]]) {
    add('circle',{cx:pt.x,cy:pt.y,r:5,fill:'#bd3333'});
    const label=add('text',{x:pt.x+10,y:pt.y-14,fill:'#111827','font-size':13,'font-weight':800},`${name} · ${Math.round(alt)} ft`);
    label.classList.add('label');
  }
  // Existing BDP targetY for BOX's fixed 90-degree pre-roll axis, in feet.
  // This display is distinct from totalGround/Roll-in Range and is not fed into legacy BOX geometry.
  const baseDistance=(prof.roll.y+prof.mapGround)/6076.11549;
  document.getElementById('baseDistanceDisplay').value=baseDistance.toFixed(1);
  add('text',{x:130,y:620,fill:'#111827','font-size':13,'font-weight':800},`Base Distance ${baseDistance.toFixed(1)} NM · MAP ${(prof.mapGround/6076.11549).toFixed(1)} NM`);
  profile.refresh();
}
window.boxUiProfile = renderProfile;
window.boxUiClear = () => {
  profileRoot.replaceChildren();
  profileRoot.append(svgNode('text',{x:80,y:100,fill:'#bd3333','font-size':24},'Profile unavailable'));
  document.getElementById('baseDistanceDisplay').value='';
};
const initial=window.boxPreviewSnapshot();
if(initial) renderProfile(initial.p,initial.bomb,initial.prof);
const help=document.createElement('p'); help.className='plot-help';
help.textContent='Text 100%: 모바일 2× 기본 크기 · 라벨은 0.5초 누른 뒤 이동 · Reset은 글자 크기와 이동 위치 유지';
document.querySelector('.primaryViz .vizbar').after(help);
