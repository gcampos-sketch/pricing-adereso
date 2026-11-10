import html2canvas from '../dashboard-sales/node_modules/html2canvas-pro/dist/html2canvas-pro.esm.js';

// A compact image PDF keeps the brochure's local fonts, official logos and mockups intact.
function imagePdf(images){
 const encode=value=>new TextEncoder().encode(value),objects=[],literal=value=>String(value).replace(/[\\()]/g,char=>'\\'+char);
 const annotations=image=>(image.links||[]).map(link=>'<< /Type /Annot /Subtype /Link /Rect ['+link.rect.join(' ')+'] /Border [0 0 0] /A << /S /URI /URI ('+literal(link.url)+') >> >>').join(' ');
 objects[1]=encode('<< /Type /Catalog /Pages 2 0 R >>');
 objects[2]=encode('<< /Type /Pages /Count '+images.length+' /Kids ['+images.map((_,i)=>(4+i*3)+' 0 R').join(' ')+'] >>');
 images.forEach((image,i)=>{const imageId=3+i*3,pageId=imageId+1,streamId=imageId+2,binary=atob(image.url.split(',')[1]),jpeg=Uint8Array.from(binary,char=>char.charCodeAt(0));objects[imageId]=new Blob([encode(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,encode('\nendstream')]);objects[pageId]=encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /PageImage ${imageId} 0 R >> >> /Contents ${streamId} 0 R /Annots [${annotations(image)}] >>`);const content=encode('q\n841.89 0 0 595.28 0 0 cm\n/PageImage Do\nQ');objects[streamId]=new Blob([encode(`<< /Length ${content.length} >>\nstream\n`),content,encode('\nendstream')]);});
 const chunks=[encode('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n')],offsets=[0];let length=chunks[0].length;
 for(let i=1;i<objects.length;i++){offsets[i]=length;const blob=new Blob([encode(i+' 0 obj\n'),objects[i],encode('\nendobj\n')]);chunks.push(blob);length+=blob.size;}
 const xref=length;chunks.push(encode('xref\n0 '+objects.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n'));
 return new Blob(chunks,{type:'application/pdf'});
}
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
window.createBrochurePdf=async(root,onProgress)=>{
 const frame=document.createElement('iframe');frame.setAttribute('aria-hidden','true');frame.title='Preparación del PDF';frame.style.cssText='position:fixed;left:-20000px;top:0;width:1440px;height:1000px;border:0;pointer-events:none';document.body.append(frame);
 const pdfDocument=frame.contentDocument;pdfDocument.documentElement.lang='es';pdfDocument.body.className='v-brochure br-public';
 try{await Promise.all([...document.querySelectorAll('link[rel=stylesheet]')].filter(link=>/brand-system\.css|brochure\.css/.test(link.href)).map(link=>new Promise((resolve,reject)=>{const sheet=pdfDocument.createElement('link');sheet.rel='stylesheet';sheet.href=link.href;sheet.onload=resolve;sheet.onerror=reject;pdfDocument.head.append(sheet);})))}catch(error){frame.remove();throw error;}
 const workspace=pdfDocument.createElement('div');workspace.id='br-pdf-export';workspace.className='br-view br-pdf-export';workspace.setAttribute('aria-hidden','true');pdfDocument.body.append(workspace);
 function copy(selector){const element=root.querySelector(selector);if(!element)throw Error('missing section');const result=element.cloneNode(true);result.removeAttribute('id');result.classList.add('br-seen');result.querySelectorAll('details').forEach(item=>item.remove());result.querySelectorAll('[id]').forEach(item=>item.removeAttribute('id'));result.querySelectorAll('img').forEach(image=>image.src=new URL(image.getAttribute('src'),location.href).href);result.querySelectorAll('button,a').forEach(control=>{if(control.tagName==='A'&&/^https:\/\//.test(control.getAttribute('href')||''))control.dataset.pdfUrl=control.href;control.removeAttribute('href');control.removeAttribute('tabindex');});return result;}
 const plans=[
  {title:'Adereso · Tu plataforma all in one',parts:['.br-business-hero','#br-credentials']},
  {title:'Las consultas que podemos resolver',parts:['#br-usecases']},
  {title:'Cómo funciona Adereso',parts:['.br-journey-intro','.br-journey-index']},
  ...Array.from({length:5},(_,i)=>({title:['Desk · Atención omnicanal','Studio · Agentes de IA','Desk + Studio · Atención humana','Engage · Seguimiento proactivo','Experience · Satisfacción'][i],parts:['#br-journey-'+i]})),
  {title:'Una operación conectada, mejoras que puedes medir',parts:['.br-journey-conclusion','#br-impact']},
  {title:'Implementación y acompañamiento',parts:['#br-implementation > .br-section-head','.br-accompany-value','.br-delivery-steps','.br-portal-payoff','.br-delivery-scope','.br-delivery-cta']},
  {title:'Tu portal cliente · Ejemplo ilustrativo',parts:['.br-delivery-layout']}
 ];
 let releaseData=null;
 try{const script=document.querySelector('script[src*="brochure-releases.js"]');if(script){const response=await fetch(new URL('brochure-releases.json',script.src),{credentials:'same-origin'});if(response.ok){releaseData=await response.json();if(releaseData.releases?.length)plans.push({title:'Lo último lanzado · '+releaseData.updatedAt,releases:true});}}}catch{/* The authored brochure remains exportable if the optional news edition is unavailable. */}
 const images=[];
 try{
  await pdfDocument.fonts.ready;
  for(let index=0;index<plans.length;index++){
   onProgress(index+1,plans.length);const plan=plans[index],page=pdfDocument.createElement('section');page.className='br-pdf-page';const logo=new URL('logoadereso.webp',new URL(document.querySelector('script[src*="brochure.js"]').src)).href;
   page.innerHTML='<header class="br-pdf-page-head"><img src="'+escape(logo)+'" alt="Adereso"><span>'+escape(plan.title)+'</span></header><div class="br-pdf-page-body"><div class="br-pdf-page-content"></div></div><footer class="br-pdf-page-foot"><span>adereso.ai · Tu operación conversacional, conectada</span><span>'+String(index+1).padStart(2,'0')+' / '+String(plans.length).padStart(2,'0')+'</span></footer>';
   const content=page.querySelector('.br-pdf-page-content');
   if(plan.releases)content.innerHTML='<div class="br-pdf-news"><span class="br-kicker">NOVEDADES DE ADERESO</span><h2>Qué cambió. <em>Qué ganas tú.</em></h2><div>'+releaseData.releases.slice(0,8).map(item=>'<article><small>'+escape(item.product)+' · '+escape(item.date)+'</small><h3>'+escape(item.title)+'</h3><label>QUÉ CAMBIÓ</label><p>'+escape(item.summary)+'</p><label>QUÉ GANAS TÚ</label><b>'+escape(item.benefit)+'</b><span>'+escape(item.availability)+'</span></article>').join('')+'</div></div>';
   else plan.parts.forEach(selector=>content.append(copy(selector)));
   if(index===0){const note=pdfDocument.createElement('p');note.className='br-pdf-evidence-note';note.textContent=[...root.querySelectorAll('#br-credentials details p')].map(item=>item.textContent).join(' ');content.append(note);}
   if(index===1){const note=pdfDocument.createElement('p');note.className='br-pdf-evidence-note';note.textContent=root.querySelector('#br-usecases .br-source-note p').textContent;content.append(note);}
   workspace.replaceChildren(page);
   await pdfDocument.fonts.ready;await Promise.all([...page.querySelectorAll('img')].map(image=>image.decode()));
   // Bake logo filters into pixels: DOM renderers do not consistently apply SVG CSS filters.
   await Promise.all([...page.querySelectorAll('.br-client-logo img')].map(async image=>{const raster=pdfDocument.createElement('canvas');raster.width=image.naturalWidth*2;raster.height=image.naturalHeight*2;const context=raster.getContext('2d');context.filter='grayscale(1) brightness(0) invert(1)';context.drawImage(image,0,0,raster.width,raster.height);image.src=raster.toDataURL();await image.decode();}));
   const body=page.querySelector('.br-pdf-page-body'),scale=Math.min(1,body.clientHeight/content.scrollHeight);content.style.transform='scale('+scale+')';content.style.transformOrigin='top center';
   const canvas=await html2canvas(page,{width:1280,height:905,scale:2,windowWidth:1440,windowHeight:1000,scrollX:0,scrollY:0,backgroundColor:'#0e0f12',logging:false,ignoreElements:element=>element.parentElement===pdfDocument.body&&element!==workspace,onclone:doc=>{const copy=doc.getElementById('br-pdf-export');copy.style.left='0';copy.style.top='0';}});
   // Paint the fixed page furniture after capture to avoid transformed-content clipping.
   const composed=pdfDocument.createElement('canvas');composed.width=canvas.width;composed.height=canvas.height;const context=composed.getContext('2d');context.drawImage(canvas,0,0);context.setTransform(2,0,0,2,0,0);context.fillStyle='#0e0f12';context.fillRect(0,0,1280,82);context.drawImage(page.querySelector('header img'),46,27,128,26);context.font='10px Work Sans, sans-serif';context.textAlign='right';context.fillStyle='#909aaa';context.fillText(plan.title,1234,44);context.strokeStyle='#ffffff15';context.beginPath();context.moveTo(46,70);context.lineTo(1234,70);context.stroke();
   const pageRect=page.getBoundingClientRect(),links=[...page.querySelectorAll('[data-pdf-url]')].map(anchor=>{const rect=anchor.getBoundingClientRect();return {url:anchor.dataset.pdfUrl,rect:[(rect.left-pageRect.left)/1280*841.89,(905-rect.bottom+pageRect.top)/905*595.28,(rect.right-pageRect.left)/1280*841.89,(905-rect.top+pageRect.top)/905*595.28]};});links.push({url:'https://adereso.ai',rect:[30,9,285,30]});
   images.push({url:composed.toDataURL('image/jpeg',.92),width:composed.width,height:composed.height,links});canvas.width=1;canvas.height=1;composed.width=1;composed.height=1;
  }
  return imagePdf(images);
 }finally{frame.remove();}
};
