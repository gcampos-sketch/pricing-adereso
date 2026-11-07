import { useEffect, useState } from 'react';
import { useAccountEmail } from '@/components/AuthGate';
import { COMMISSION_BANDS, commissionRate } from '@/lib/quarter-performance';

export function CommissionRate({attainment,scope,simulated=false}:{attainment:number|null;scope:string;simulated?:boolean}) {
  const account=useAccountEmail();
  const key=`commission-target/v1:${account??'unknown'}:${scope}`;
  const [target,setTarget]=useState('');
  useEffect(()=>{const read=()=>{try{setTarget(localStorage.getItem(key)??'');}catch{setTarget('');}};read();window.addEventListener('commission-target-changed',read);return()=>window.removeEventListener('commission-target-changed',read);},[key]);
  const result=commissionRate(attainment,target.trim()?Number(target):null);
  return <div className="commission-inline">
    <label>Comisión objetivo <input aria-label={`Comisión objetivo de ${scope}`} type="number" min="0" max="100" step=".01" placeholder="%" value={target} onChange={e=>{setTarget(e.target.value);try{localStorage.setItem(key,e.target.value);window.dispatchEvent(new Event("commission-target-changed"));}catch{/* optional preference */}}}/>%</label>
    <span>{simulated?'Comisión simulada':'Comisión obtenida'} <strong>{result?`${result.rate.toFixed(2)}%${result.asterisk?'*':''}`:'Sin objetivo'}</strong></span>
    {result?<small>Cumplimiento {attainment?.toFixed(1)}% · objetivo ×{result.factor}</small>:null}
    <details><summary>Tabla de comisión</summary><table><thead><tr><th>Cumplimiento</th><th>Factor</th><th>Con objetivo 9,09%</th></tr></thead><tbody>{COMMISSION_BANDS.map(b=><tr key={b.from}><td>{b.from}–{Number.isFinite(b.to)?b.to:'∞'}%{b.asterisk?'*':''}</td><td>×{b.factor}</td><td>{commissionRate(b.from,9.09)!.rate.toFixed(2)}%{b.asterisk?'*':''}</td></tr>)}</tbody></table><p>Límite exacto entra al tramo superior. * Condición de los tramos superiores pendiente de especificar. Porcentaje orientativo; no calcula pago monetario. Objetivo guardado solo en este navegador para esta cuenta y alcance.</p></details>
  </div>;
}
