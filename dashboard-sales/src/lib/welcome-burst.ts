/** A gentle, finite birth-of-stars sequence. No audio, assets, network calls or persisted state. */
export const WELCOME_DURATION=7000;
export function mountWelcomeBurst(canvas:HTMLCanvasElement,onDone:()=>void){
 const ctx=canvas.getContext('2d');if(!ctx){onDone();return()=>{};}
 let frame=0,width=0,height=0,disposed=false;const started=performance.now();
 const particles=Array.from({length:window.innerWidth<600?230:460},()=>({
  angle:Math.random()*Math.PI*2,distance:.12+Math.pow(Math.random(),.55)*.88,
  size:.4+Math.random()*1.2,warm:Math.random()<.22,phase:Math.random()*Math.PI*2,
 }));
 const resize=()=>{width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,1.75);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);};
 resize();window.addEventListener('resize',resize,{passive:true});
 const clamp=(n:number)=>Math.max(0,Math.min(1,n));
 function glow(x:number,y:number,r:number,alpha:number,warm=true){
  if(alpha<=0||r<=0)return;const g=ctx!.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,`rgba(${warm?'255,235,189':'165,190,235'},${alpha})`);g.addColorStop(.2,`rgba(${warm?'239,202,132':'118,148,214'},${alpha*.3})`);g.addColorStop(1,'rgba(0,0,0,0)');ctx!.fillStyle=g;ctx!.fillRect(x-r,y-r,r*2,r*2);
 }
 const draw=(now:number)=>{
  if(disposed)return;const elapsed=now-started,t=elapsed/1000,cx=width/2,cy=height*.5,max=Math.hypot(width,height)*.65;
  ctx.clearRect(0,0,width,height);
  // The words withdraw first; the solitary, centered isotype gathers the light.
  if(t<5.05){const gather=clamp((t-4.05)/.75),fade=Math.min(1,t/.45)*(1-clamp((t-4.8)/.25));
   glow(cx,cy,Math.min(width*.45,340),.09*fade);
   for(let i=0;i<5;i++){const a=t*.4+i*Math.PI*2/5,r=(1-gather)*Math.min(width*.28,220)+4;glow(cx+Math.cos(a)*r,cy+Math.sin(a)*r*.28,20+gather*30,(.075+gather*.11)*fade,i%3!==0);}
   glow(cx,cy,24+gather*100,gather*.32*fade);
  }
  const p=clamp((t-4.8)/1.45),ease=1-Math.pow(1-p,3),settle=1-clamp((t-6.05)/.65);
  if(p>0){
   glow(cx,cy,45+ease*max*.58,.3*Math.sin(Math.PI*p));
   const ring=ctx.createRadialGradient(cx,cy,Math.max(.1,ease*max*.65-35),cx,cy,Math.max(.2,ease*max*.65+35));
   ring.addColorStop(0,'rgba(255,222,169,0)');ring.addColorStop(.5,`rgba(255,222,169,${.045*Math.sin(Math.PI*p)})`);ring.addColorStop(1,'rgba(255,222,169,0)');ctx.fillStyle=ring;ctx.fillRect(0,0,width,height);
   for(const star of particles){const reach=max*star.distance,x=cx+Math.cos(star.angle)*reach*ease,y=cy+Math.sin(star.angle)*reach*ease*.75;
    const alpha=Math.sin(Math.min(1,p*3)*Math.PI/2)*settle*(.35+.2*Math.sin(star.phase));
    if(alpha<=0)continue;ctx.strokeStyle=`rgba(${star.warm?'244,216,166':'195,214,246'},${alpha*.22})`;ctx.lineWidth=star.size*.65;
    const tail=(1-ease)*reach*.12;ctx.beginPath();ctx.moveTo(x-Math.cos(star.angle)*tail,y-Math.sin(star.angle)*tail*.75);ctx.lineTo(x,y);ctx.stroke();ctx.fillStyle=`rgba(${star.warm?'255,232,190':'220,231,252'},${alpha})`;ctx.beginPath();ctx.arc(x,y,star.size,0,Math.PI*2);ctx.fill();
   }
  }
  if(elapsed>=WELCOME_DURATION){onDone();return;}frame=requestAnimationFrame(draw);
 };
 frame=requestAnimationFrame(draw);
 return()=>{disposed=true;cancelAnimationFrame(frame);window.removeEventListener('resize',resize);ctx.clearRect(0,0,width,height);};
}
