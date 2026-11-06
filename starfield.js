/** Shared visual sky for the Hub home and authentication screens.
 * @param {HTMLCanvasElement} c
 * @returns {() => void} Dispose animation and event listeners.
 */
export function mountStarfield(c) {
let aiRaf=0,aiStars=[],aiResize=null;
const aiMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const aiM={x:0,y:0,on:false};
const pointerMove=e=>{
  aiM.on=e.pointerType!=='touch';
  aiM.x=e.clientX;aiM.y=e.clientY;
};
window.addEventListener('pointermove',pointerMove,{passive:true});
const aiPointerReset=()=>{aiM.on=false;};
document.addEventListener('pointerleave',aiPointerReset);
window.addEventListener('blur',aiPointerReset);
window.addEventListener('pointercancel',aiPointerReset);
function aiStarOffset(s,bx,by,mx,my,active,dt){
  let tx=0,ty=0;
  const dx=bx-mx,dy=by-my,d=Math.hypot(dx,dy),reach=64;
  if(active&&d<reach){
    const force=(1-d/reach)**2*(10+(1-s.z)*16);
    const ux=d>.01?dx/d:Math.cos(s.phase),uy=d>.01?dy/d:Math.sin(s.phase);
    tx=ux*force;ty=uy*force;
  }
  const ease=1-Math.exp(-dt*(active&&d<reach?9:3.5));
  s.ox=((s.ox||0)+(tx-(s.ox||0))*ease);
  s.oy=((s.oy||0)+(ty-(s.oy||0))*ease);
}
function aiSeed(w,h){
  const n=Math.min(2800,Math.max(750,Math.round(w*h/380)));
  aiStars=Array.from({length:n},()=>({
    x:Math.random()*2-1,y:Math.random()*2-1,z:.18+Math.random()*.82,
    phase:Math.random()*Math.PI*2,size:.35+Math.random()*.65,
    warm:Math.random()<.16,hero:Math.random()<.022,ox:0,oy:0
  }));
}
function aiBgStart(){
  if(!c||aiRaf||document.hidden)return;
  const ctx=c.getContext('2d');if(!ctx)return;
  let w=0,h=0,previous=0,clock=0,nextMeteor=3;
  let meteors=[],lastMeteorRoute=-1;
  const haze=document.createElement('canvas'),hc=haze.getContext('2d');
  const glow=(color)=>{
    const sprite=document.createElement('canvas');sprite.width=sprite.height=64;
    const sc=sprite.getContext('2d'),g=sc.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,255,255,.95)');
    g.addColorStop(.08,`rgba(${color},.7)`);
    g.addColorStop(.28,`rgba(${color},.13)`);
    g.addColorStop(1,`rgba(${color},0)`);
    sc.fillStyle=g;sc.fillRect(0,0,64,64);return sprite;
  };
  const cool=glow('173,200,255'),warm=glow('255,224,153');
  // Galaxies are painted once, keeping thousands of distant stars off the animation loop.
  const galaxy=document.createElement('canvas');galaxy.width=galaxy.height=480;
  const gc=galaxy.getContext('2d');
  const mist=(radius,color,alpha)=>{
    const g=gc.createRadialGradient(240,240,0,240,240,radius);
    g.addColorStop(0,`rgba(${color},${alpha})`);g.addColorStop(.35,`rgba(${color},${alpha*.35})`);
    g.addColorStop(1,`rgba(${color},0)`);gc.fillStyle=g;gc.fillRect(0,0,480,480);
  };
  mist(225,'133,148,211',.16);
  for(let i=0;i<4600;i++){
    const r=Math.pow(Math.random(),.65)*202;
    const arm=i%3*Math.PI*2/3;
    const angle=arm+r*.024+(Math.random()-.5)*(.3+r*.004);
    const px=240+Math.cos(angle)*r+(Math.random()-.5)*9;
    const py=240+Math.sin(angle)*r+(Math.random()-.5)*9;
    const a=(1-r/225)*(.07+Math.random()*.2);
    gc.fillStyle=`rgba(${i%4?'164,181,235':'228,208,178'},${a})`;
    gc.beginPath();gc.arc(px,py,.3+Math.random()*.8,0,Math.PI*2);gc.fill();
  }
  mist(70,'238,219,188',.3);mist(22,'255,242,218',.36);

  const fit=()=>{
    w=c.clientWidth;h=c.clientHeight;
    const d=Math.min(2,window.devicePixelRatio||1);
    c.width=Math.round(w*d);c.height=Math.round(h*d);ctx.setTransform(d,0,0,d,0,0);
    // Atmospheric light is cached at low resolution, rather than rebuilt each frame.
    haze.width=Math.max(1,Math.round(w/3));haze.height=Math.max(1,Math.round(h/3));
    const hw=haze.width,hh=haze.height;
    hc.fillStyle='#080b13';hc.fillRect(0,0,hw,hh);
    const cloud=(cx,cy,r,color)=>{
      const g=hc.createRadialGradient(cx*hw,cy*hh,0,cx*hw,cy*hh,r*hw);
      g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');
      hc.fillStyle=g;hc.fillRect(0,0,hw,hh);
    };
    cloud(.86,.16,.8,'rgba(63,77,136,.23)');
    cloud(.02,.6,.7,'rgba(48,65,112,.17)');
    cloud(.22,0,.46,'rgba(153,117,52,.10)');
    cloud(.8,.85,.6,'rgba(75,49,105,.12)');
    const distantGalaxy=(cx,cy,size,angle,flatten,alpha)=>{
      hc.save();hc.translate(hw*cx,hh*cy);hc.rotate(angle);hc.scale(1,flatten);
      hc.globalAlpha=alpha;hc.drawImage(galaxy,-size/2,-size/2,size,size);hc.restore();
    };
    distantGalaxy(.88,.14,hw*.5,-.55,.52,.72);
    distantGalaxy(.11,.53,hw*.38,.65,.48,.48);
    distantGalaxy(.8,.86,hw*.48,-.35,.62,.5);

    aiSeed(w,h);
  };
  fit();aiResize=fit;
  const step=t=>{
    const reduced=aiMotion.matches;
    const dt=previous?Math.min((t-previous)/1000,.05):0;previous=t;
    if(!reduced)clock+=dt;
    const rect=c.getBoundingClientRect();
    const mx=aiM.x-rect.left,my=aiM.y-rect.top;
    const pointerActive=!reduced&&aiM.on&&mx>=0&&mx<=w&&my>=0&&my<=h;
    ctx.globalAlpha=1;ctx.drawImage(haze,0,0,w,h);
    for(const s of aiStars){
      if(!reduced){s.z-=dt*.006;if(s.z<.18){s.z=1;s.x=Math.random()*2-1;s.y=Math.random()*2-1;s.ox=s.oy=0;}}
      const depth=1-s.z,spread=.72+s.z*.55;
      const bx=w/2+s.x*w*.68/spread,by=h/2+s.y*h*.68/spread;
      aiStarOffset(s,bx,by,mx,my,pointerActive,dt);
      const px=bx+(reduced?0:s.ox),py=by+(reduced?0:s.oy);
      if(px< -25||py< -25||px>w+25||py>h+25)continue;
      const fade=Math.min(1,(s.z-.18)/.1,(1-s.z)/.12);
      const tw=reduced?1:.84+.16*Math.sin(clock*(.35+s.size*.45)+s.phase);
      const alpha=(.22+depth*.64)*tw*Math.max(0,fade);
      const radius=s.size*(.45+depth*1.35);
      if(s.hero||depth>.66){
        const size=(s.hero?19:10)*( .6+depth);
        ctx.globalAlpha=alpha*(s.hero?.85:.45);
        ctx.drawImage(s.warm?warm:cool,px-size/2,py-size/2,size,size);
      }
      ctx.globalAlpha=alpha;ctx.fillStyle=s.warm?'#ffe6bc':'#dce8ff';
      ctx.beginPath();ctx.arc(px,py,radius,0,Math.PI*2);ctx.fill();
      if(s.hero&&depth>.5){
        const arm=3+depth*4;
        ctx.globalAlpha=alpha*.3;ctx.strokeStyle=s.warm?'#ffe6bc':'#c9dcff';ctx.lineWidth=.55;
        ctx.beginPath();ctx.moveTo(px-arm,py);ctx.lineTo(px+arm,py);
        ctx.moveTo(px,py-arm);ctx.lineTo(px,py+arm);ctx.stroke();
      }
    }
    // Varied, unhurried trajectories: never repeat the previous route family.
    if(!reduced&&clock>=nextMeteor){
      const vh=Math.min(h,window.innerHeight);
      const routes=[
        {x:.06,y:.10,angle:.25}, {x:.94,y:.14,angle:2.85},
        {x:.32,y:.04,angle:.70}, {x:.76,y:.05,angle:2.35},
        {x:.12,y:.30,angle:-.20}, {x:.90,y:.33,angle:3.32}
      ];
      let route=Math.floor(Math.random()*(routes.length-1));
      if(route>=lastMeteorRoute&&lastMeteorRoute>=0)route++;
      lastMeteorRoute=route;
      const r=routes[route],angle=r.angle+(Math.random()-.5)*.22;
      const duration=2.6+Math.random()*1.6;
      const distance=Math.min(w*.6,170+Math.random()*170);
      meteors.push({x:w*(r.x+(Math.random()-.5)*.06),y:vh*(r.y+Math.random()*.06),
        vx:Math.cos(angle)*distance/duration,vy:Math.sin(angle)*distance/duration,
        age:0,duration,tail:38+Math.random()*65,brightness:.38+Math.random()*.28,
        width:.65+Math.random()*.45});
      nextMeteor=clock+10+Math.random()*12;
    }
    meteors=meteors.filter(m=>{
      m.age+=dt;if(m.age>=m.duration)return false;
      m.x+=m.vx*dt;m.y+=m.vy*dt;
      const opacity=Math.sin(Math.PI*m.age/m.duration)**2*m.brightness;
      const speed=Math.hypot(m.vx,m.vy),tail=m.tail;
      const tx=m.x-m.vx/speed*tail,ty=m.y-m.vy/speed*tail;
      const gradient=ctx.createLinearGradient(tx,ty,m.x,m.y);
      gradient.addColorStop(0,'rgba(182,203,237,0)');
      gradient.addColorStop(.7,`rgba(182,203,237,${opacity*.22})`);
      gradient.addColorStop(1,`rgba(230,237,255,${opacity})`);
      ctx.globalAlpha=1;ctx.strokeStyle=gradient;ctx.lineWidth=m.width;
      ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(m.x,m.y);ctx.stroke();
      ctx.globalAlpha=opacity*.7;ctx.drawImage(cool,m.x-5,m.y-5,10,10);
      return true;
    });
    ctx.globalAlpha=1;
    aiRaf=reduced?0:requestAnimationFrame(step);
  };
  aiRaf=requestAnimationFrame(step);
}
function aiBgStop(){if(aiRaf)cancelAnimationFrame(aiRaf);aiRaf=0;aiResize=null;}

let aiFitFrame=0;
const aiFitObserver=new ResizeObserver(()=>{
  cancelAnimationFrame(aiFitFrame);
  aiFitFrame=requestAnimationFrame(()=>{
    if(aiMotion.matches){aiBgStop();aiBgStart();}else if(aiResize)aiResize();
  });
});
aiFitObserver.observe(c);
const visibility=()=>{if(document.hidden)aiBgStop();else aiBgStart();};
const motionChange=()=>{aiBgStop();aiBgStart();};
document.addEventListener('visibilitychange',visibility);
aiMotion.addEventListener('change',motionChange);
aiBgStart();
return ()=>{
  aiBgStop();cancelAnimationFrame(aiFitFrame);aiFitObserver.disconnect();
  window.removeEventListener('pointermove',pointerMove);
  document.removeEventListener('pointerleave',aiPointerReset);
  window.removeEventListener('blur',aiPointerReset);
  window.removeEventListener('pointercancel',aiPointerReset);
  document.removeEventListener('visibilitychange',visibility);
  aiMotion.removeEventListener('change',motionChange);
};
}
