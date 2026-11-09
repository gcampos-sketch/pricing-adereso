/** A gentle, finite birth-of-stars sequence. No audio, assets, network calls or persisted state. */
export const WELCOME_DURATION=9000;
export function mountWelcomeBurst(canvas:HTMLCanvasElement,onDone:()=>void){
 const ctx=canvas.getContext('2d');if(!ctx){onDone();return()=>{};}
 let frame=0,width=0,height=0,disposed=false;const started=performance.now();
 const particles=Array.from({length:window.innerWidth<600?230:460},()=>({
  angle:Math.random()*Math.PI*2,depth:Math.random()*2-1,distance:.3+Math.pow(Math.random(),.55)*.7,
  size:.4+Math.random()*1.2,warm:Math.random()<.22,phase:Math.random()*Math.PI*2,
 }));
 const resize=()=>{width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,1.75);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);};
 resize();window.addEventListener('resize',resize,{passive:true});
 particles.sort((a,b)=>a.depth-b.depth);
 const clamp=(n:number)=>Math.max(0,Math.min(1,n));
 function glow(x:number,y:number,r:number,alpha:number,warm=true){
  if(alpha<=0||r<=0)return;const g=ctx!.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,`rgba(${warm?'255,235,189':'165,190,235'},${alpha})`);g.addColorStop(.2,`rgba(${warm?'239,202,132':'118,148,214'},${alpha*.3})`);g.addColorStop(1,'rgba(0,0,0,0)');ctx!.fillStyle=g;ctx!.fillRect(x-r,y-r,r*2,r*2);
 }
 const draw=(now:number)=>{
  // Keep the choreography in seven design seconds, stretched with the CSS timeline.
  if(disposed)return;const elapsed=now-started,t=elapsed/WELCOME_DURATION*7,cx=width/2,cy=height*.5,max=Math.hypot(width,height)*.65;
  ctx.clearRect(0,0,width,height);
  // Inward orbital arcs make the pressure readable before the perspective release.
  if(t<5.5){const gather=clamp((t-4)/1.35),fade=Math.min(1,t/.45)*(1-clamp((t-5.35)/.15));
   glow(cx,cy,Math.min(width*.4,300),.07*fade);
   if(gather>0){
    const radius=100*(1-gather)+9;
    ctx.save();ctx.translate(cx,cy);
    for(let i=0;i<3;i++){
     ctx.save();ctx.rotate(i*Math.PI/3+t*.16);
     ctx.strokeStyle=`rgba(${i===1?'245,220,173':'177,206,245'},${(.08+gather*.2)*fade})`;
     ctx.lineWidth=.65+gather*.4;ctx.beginPath();
     ctx.ellipse(0,0,radius*(1+i*.13),radius*.32,t*.25,.2,Math.PI*1.7);ctx.stroke();ctx.restore();
    }
    ctx.restore();glow(cx,cy,52*(1-gather)+14,gather*.38*fade);
   }
  }
  const p=clamp((t-5.35)/1.2),expansion=1-Math.pow(1-p,2),settle=1-clamp((t-6.25)/.5);
  if(p>0){
   // A local, soft pulse marks the release without flashing the whole viewport.
   const release=clamp((t-5.35)/.16),flash=Math.sin(Math.PI*release);
   if(flash>0){glow(cx,cy,18+release*52,flash*.28);glow(cx,cy,4+release*9,flash*.52);}
   glow(cx,cy,18+expansion*max*.5,.34*Math.sin(Math.PI*p));
   // A spherical cloud, sorted back to front and projected through a camera.
   // Near particles grow and accelerate toward the viewer; far particles stay fine.
   const previous=1-Math.pow(1-clamp((t-5.375)/1.2),2);
   for(const star of particles){
    const radial=Math.sqrt(1-star.depth*star.depth),reach=max*star.distance;
    const project=(spread:number)=>{
     const perspective=2.8/(2.8-star.depth*spread*2.35);
     return {x:cx+Math.cos(star.angle)*radial*reach*spread*perspective,
      y:cy+Math.sin(star.angle)*radial*reach*spread*perspective,
      perspective};
    };
    const point=project(expansion),tail=project(previous);
    const alpha=clamp(p*12)*settle*(.4+.2*star.depth)*(.8+.2*Math.sin(star.phase));
    if(alpha<=0)continue;
    const color=star.warm?'255,226,177':'206,225,255',size=star.size*point.perspective;
    ctx.strokeStyle=`rgba(${color},${alpha*.45})`;ctx.lineWidth=Math.max(.35,size*.6);
    ctx.beginPath();ctx.moveTo(tail.x,tail.y);ctx.lineTo(point.x,point.y);ctx.stroke();
    if(star.depth>.65&&size>2)glow(point.x,point.y,size*4,alpha*.16,star.warm);
    ctx.fillStyle=`rgba(${color},${alpha})`;ctx.beginPath();ctx.arc(point.x,point.y,Math.max(.3,size),0,Math.PI*2);ctx.fill();
   }
  }
  if(elapsed>=WELCOME_DURATION){onDone();return;}frame=requestAnimationFrame(draw);
 };
 frame=requestAnimationFrame(draw);
 return()=>{disposed=true;cancelAnimationFrame(frame);window.removeEventListener('resize',resize);ctx.clearRect(0,0,width,height);};
}
