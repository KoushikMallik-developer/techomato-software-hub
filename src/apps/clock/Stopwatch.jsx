import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { hms } from './util.js';

export default function Stopwatch({ data, now, a }) {
  const sw = data.sw; const running = sw.startAt !== null; const el = running ? sw.base + (now - sw.startAt) : sw.base; const [full, setFull] = useState(false);
  const laps = sw.laps; const splits = laps.map((t, i) => t - (laps[i + 1] || 0)); // newest first
  const best = splits.length > 1 ? Math.min(...splits) : null; const worst = splits.length > 1 ? Math.max(...splits) : null;
  const cur = el - (laps[0] || 0);
  const copy = () => { const txt = [...laps].reverse().map((t, i) => `Lap ${i + 1}\t${hms(splits[laps.length - 1 - i], { cs: true })}\t${hms(t, { cs: true })}`).join('\n'); navigator.clipboard && navigator.clipboard.writeText(txt).then(() => a.toast('Laps copied')).catch(() => {}); };
  const body = (
    <div className={'clk-sw' + (full ? ' full' : '')}>
      <div className="clk-swtime" data-testid="sw-time" role="timer">{hms(el, { cs: true })}</div>
      <div className="clk-btns">
        <button className="fb pri lg" onClick={() => a.swToggle()}><Icon name={running ? 'pause' : 'play'} size={16} />{running ? 'Pause' : el > 0 ? 'Resume' : 'Start'}</button>
        <button className="fb lg" disabled={!running} onClick={() => a.swLap()}><Icon name="flag" size={15} />Lap</button>
        <button className="fb sub lg" disabled={el === 0} onClick={() => a.swReset()}><Icon name="refresh" size={15} />Reset</button>
        <button className="fb sub ico lg" aria-label={full ? 'Exit full screen' : 'Full screen'} onClick={() => setFull((f) => !f)}><Icon name="fullscreen" size={16} /></button>
      </div>
      {(laps.length > 0 || running) && (
        <div className="clk-laps" role="table" aria-label="Laps">
          <div className="clk-lap head" role="row"><span>Lap</span><span>Lap time</span><span>Total</span></div>
          {running || el > 0 ? <div className="clk-lap cur" role="row"><span>{laps.length + 1}</span><span>{hms(cur, { cs: true })}</span><span>{hms(el, { cs: true })}</span></div> : null}
          {laps.map((t, i) => <div key={i} className={'clk-lap' + (splits[i] === best ? ' best' : splits[i] === worst ? ' worst' : '')} role="row"><span>{laps.length - i}</span><span>{hms(splits[i], { cs: true })}</span><span>{hms(t, { cs: true })}</span></div>)}
        </div>
      )}
      {laps.length > 0 && <button className="fb sub sm" style={{ alignSelf: 'center' }} onClick={copy}><Icon name="copy" size={14} />Copy laps</button>}
    </div>
  );
  return full ? <div className="clk-fs">{body}</div> : body;
}
