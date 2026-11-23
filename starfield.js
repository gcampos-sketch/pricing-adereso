function softenStarEdge(position, extent) {
  const inset=Math.min(10,extent/2);
  const overflow=position<inset?position-inset:Math.max(0,position-extent+inset);
  return position-overflow+inset*Math.tanh(overflow/inset);
}

const HORIZON_RADIUS=10.5;
const LENS_REACH=94;
const EINSTEIN_RADIUS=30;

function drawBlackHole(ctx,lens) {
  ctx.globalAlpha=Math.min(1,lens.amount*1.6);
  ctx.fillStyle='#02030a';
  ctx.beginPath();
  ctx.arc(lens.x,lens.y,HORIZON_RADIUS*lens.amount,0,Math.PI*2);
  ctx.fill();
}

function createHazeLens(haze,hc,w,h) {
  const span=128,half=span/2;
  const patch=document.createElement('canvas');
  patch.width=patch.height=span;
  const patchContext=patch.getContext('2d');
  const image=patchContext.createImageData(span,span);
  const {width,height}=haze;
  const source=hc.getImageData(0,0,width,height).data;
  let lastX=Infinity,lastY=Infinity,lastAmount=Infinity;
  return (ctx,lens)=>{
    if(Math.abs(lastX-lens.x)>.3||Math.abs(lastY-lens.y)>.3||Math.abs(lastAmount-lens.amount)>.01){
      lastX=lens.x;lastY=lens.y;lastAmount=lens.amount;
      const strength=EINSTEIN_RADIUS**2*lens.amount;
      for(let y=0;y<span;y++){
        const dy=y+.5-half;
        for(let x=0;x<span;x++){
          const dx=x+.5-half;
          const radius=Math.hypot(dx,dy);
          if(radius>=half)continue;
          // Inverse mapping through a point lens, blended into the surrounding sky.
          const fade=Math.max(0,Math.min(1,(half-radius)/18));
          const factor=1-strength*fade/Math.max(1,radius*radius);
          const sx=Math.max(0,Math.min(width-1,(lens.x+dx*factor)/w*width-.5));
          const sy=Math.max(0,Math.min(height-1,(lens.y+dy*factor)/h*height-.5));
          const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
          const row=iy*width,otherRow=Math.min(height-1,iy+1)*width;
          const right=Math.min(width-1,ix+1);
          const target=4*(y*span+x);
          for(let channel=0;channel<3;channel++){
            const a=source[4*(row+ix)+channel]*(1-fx)+source[4*(row+right)+channel]*fx;
            const b=source[4*(otherRow+ix)+channel]*(1-fx)+source[4*(otherRow+right)+channel]*fx;
            image.data[target+channel]=a*(1-fy)+b*fy;
          }
          image.data[target+3]=Math.round(255*fade*Math.min(1,lens.amount*3));
        }
      }
      patchContext.putImageData(image,0,0);
    }
    ctx.drawImage(patch,lens.x-half,lens.y-half);
  };
}

function mountDraggableStars(canvas, motion) {
  const stage=canvas.parentElement;
  const controls='button, a, input, select, textarea, label, [role="button"], [contenteditable], h1, p, .home-brand img';
  let stars=[];
  const particles=[];
  const cardSurfaces=new Map();
  let nextSurfaceRead=0;
  let drag=null,hovered=null,hole=null;
  const originalCursor=stage.style.cursor;
  const updateCursor=()=>{
    stage.style.cursor=drag?'grabbing':hovered?(hole?.star===hovered?'pointer':'grab'):originalCursor;
  };
  const canGrab=event=>!motion.matches&&event.pointerType!=='touch'&&!event.target.closest?.(controls);
  function layout(w,h){
    const skyHeight=Math.min(h,window.innerHeight);
    const compact=w<600;
    const rect=canvas.getBoundingClientRect();
    const obstacles=Array.from(stage.querySelectorAll(controls),el=>el.getBoundingClientRect());
    const inset=Math.max(20,Math.min(38,w*.035));
    const upper=Math.max(66,skyHeight*.16);
    const candidates=compact
      ? [[.1*w,22],[.39*w,23],[.66*w,20],[.9*w,24],[w-inset,upper],[inset,upper],[.7*w,74]]
      : [[.91*w,upper],[.08*w,25],[.35*w,33],[.64*w,24],[.74*w,upper*.8],
        [w-inset,skyHeight*.69],[inset,skyHeight*.58],[w-inset,skyHeight*.39],[inset,skyHeight*.79],
        [.71*w,skyHeight*.53],[.77*w,skyHeight*.81],[.36*w,skyHeight*.86],
        [.49*w,24],[.79*w,24],[.94*w,31],[.21*w,37],[.60*w,78],[.84*w,76]];
    stars=[];
    for(const [x,y] of candidates){
      if(x<18||x>w-18||y<18||y>skyHeight-18)continue;
      const px=rect.left+x,py=rect.top+y;
      if(obstacles.some(box=>box.width&&box.height&&px>box.left-18&&px<box.right+18&&py>box.top-18&&py<box.bottom+18))continue;
      if(stars.some(star=>Math.hypot(star.x-x,star.y-y)<48))continue;
      const index=stars.length;
      stars.push({x,y,warm:index%3===0,phase:index*1.4,px:x,py:y,rawX:x,rawY:y,
        dx:0,dy:0,vx:0,vy:0,glow:0,flash:0,flight:null});
      if(stars.length===(compact?5:8))break;
    }
  }
  const hit=event=>{
    if(!canGrab(event))return null;
    const rect=canvas.getBoundingClientRect();
    const x=event.clientX-rect.left,y=event.clientY-rect.top;
    if(hole&&Math.hypot(x-hole.x,y-hole.y)<Math.max(18,HORIZON_RADIUS*hole.amount+4))return hole.star;
    let nearest=null, distance=18;
    for(const star of stars){
      const d=Math.hypot(x-star.px,y-star.py);
      if(d<distance){nearest=star;distance=d;}
    }
    return nearest;
  };
  const move=event=>{
    if(drag?.id===event.pointerId){
      const rect=canvas.getBoundingClientRect();
      const samples=event.getCoalescedEvents?.()||[];
      for(const sample of samples)trace(sample,rect);
      trace(event,rect);
      return;
    }
    hovered=hit(event);
    updateCursor();
  };
  function trace(event,rect){
    if(drag.transformed)return;
    const x=Math.max(0,Math.min(canvas.clientWidth,event.clientX-rect.left+drag.grabX));
    const y=Math.max(0,Math.min(canvas.clientHeight,event.clientY-rect.top+drag.grabY));
    if(!drag.moved){
      if(Math.hypot(x-drag.x,y-drag.y)<7)return;
      drag.moved=true;
    }
    const dx=x-drag.x,dy=y-drag.y;
    if(dx||dy){
      const elapsed=Math.max(.008,(event.timeStamp-drag.lastMotion)/1000);
      const blend=1-Math.exp(-elapsed/.026);
      drag.vx+=(dx/elapsed-drag.vx)*blend;
      drag.vy+=(dy/elapsed-drag.vy)*blend;
      drag.lastMotion=event.timeStamp;
    }
    drag.x=x;
    drag.y=y;
    emitTrail(drag,softenStarEdge(x,canvas.clientWidth),softenStarEdge(y,canvas.clientHeight),drag.star.warm);
  }
  function emitTrail(path,x,y,warm,strength=1){
    const dx=x-path.trailX,dy=y-path.trailY;
    const distance=Math.hypot(dx,dy);
    const spacing=4;
    const count=Math.floor(distance/spacing);
    if(!count)return;
    const ux=dx/distance,uy=dy/distance;
    const skipped=Math.max(0,count-170);
    path.trailX+=ux*spacing*skipped;
    path.trailY+=uy*spacing*skipped;
    for(let i=skipped;i<count;i++){
      path.trailX+=ux*spacing;
      path.trailY+=uy*spacing;
      for(let layer=0;layer<2;layer++){
        const spread=layer===0?2.5:9;
        const offset=(Math.random()*2-1)*spread;
        const drift=offset*2.4;
        const falls=layer===1&&Math.random()<.8;
        particles.push({
          x:path.trailX-uy*offset,y:path.trailY+ux*offset,
          vx:-ux*18-uy*drift,vy:-uy*18+ux*drift,
          age:0,life:falls?2.65+Math.random()*.7:.78+Math.random()*.48,size:2.5+Math.random()*4.3,
          fallAfter:falls?.16+Math.random()*.19:Infinity,clearance:1+Math.random()*4,
          warm,strength,rest:null
        });
      }
    }
    if(particles.length>420)particles.splice(0,particles.length-420);
  }
  function readCardSurfaces(clock){
    const rect=canvas.getBoundingClientRect();
    cardSurfaces.clear();
    for(const card of stage.querySelectorAll('.hg-card')){
      const box=card.getBoundingClientRect();
      if(!box.width||!box.height||box.top<rect.top||box.top>rect.bottom)continue;
      cardSurfaces.set(card,{left:box.left-rect.left+9,right:box.right-rect.left-9,y:box.top-rect.top});
    }
    nextSurfaceRead=clock+.12;
  }
  function advanceParticle(particle,dt){
    if(particle.rest){
      const surface=cardSurfaces.get(particle.rest.card);
      if(surface){
        particle.x=surface.left+particle.rest.offset;
        particle.y=surface.y-particle.clearance;
        return Math.max(0,1-(particle.age-particle.rest.since)/.78);
      }
      particle.rest=null;
    }
    const falling=particle.age>particle.fallAfter;
    if(falling){
      const easedFall=1-Math.exp(-(particle.age-particle.fallAfter)*4.2);
      const terminalSpeed=155+particle.size*9;
      particle.vy+=(terminalSpeed-particle.vy)*(1-Math.exp(-dt*1.6*easedFall));
    }
    particle.x+=particle.vx*dt;
    const nextY=particle.y+particle.vy*dt;
    if(falling&&particle.vy>0){
      let landing=null;
      for(const [card,surface] of cardSurfaces){
        const edge=surface.y-particle.clearance;
        if(particle.x<surface.left||particle.x>surface.right||edge<particle.y||edge>nextY)continue;
        if(!landing||edge<landing.edge)landing={card,surface,edge};
      }
      if(landing){
        particle.y=landing.edge;
        particle.vx*=.72;
        particle.vy*=-.26;
        if(particle.vy> -24){
          particle.rest={card:landing.card,offset:particle.x-landing.surface.left,since:particle.age};
        }
        return 1;
      }
    }
    particle.y=nextY;
    return 1;
  }
  const invalidateSurfaces=()=>{nextSurfaceRead=0;};
  const start=event=>{
    if(drag||event.button!==0)return;
    const star=hit(event);
    if(!star)return;
    if(hole?.star===star){
      hole.closing=true;
      event.preventDefault();
      return;
    }
    const rect=canvas.getBoundingClientRect();
    star.flight=null;
    star.vx=star.vy=0;
    star.flash=1;
    drag={id:event.pointerId,star,x:star.px,y:star.py,trailX:star.px,trailY:star.py,
      vx:0,vy:0,lastMotion:event.timeStamp,held:0,moved:false,transformed:false,
      grabX:star.px-(event.clientX-rect.left),grabY:star.py-(event.clientY-rect.top)};
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
    updateCursor();
  };
  const clearHover=()=>{hovered=null;updateCursor();};
  const stop=()=>{
    const id=drag?.id;
    drag=null;
    clearHover();
    if(id!==undefined&&stage.hasPointerCapture(id))stage.releasePointerCapture(id);
  };
  const end=event=>{
    if(drag?.id!==event.pointerId)return;
    if(event.type==='pointerup'){
      trace(event,canvas.getBoundingClientRect());
      const speed=Math.hypot(drag.vx,drag.vy);
      if(speed>0){
        const idle=Math.max(0,event.timeStamp-drag.lastMotion);
        const launchSpeed=1900*Math.tanh(speed/1900)*Math.exp(-idle/62);
        const headingX=drag.vx/speed,headingY=drag.vy/speed;
        drag.star.vx=headingX*launchSpeed;
        drag.star.vy=headingY*launchSpeed;
        drag.star.flight={age:0,impulse:Math.min(1,launchSpeed/1100),headingX,headingY,
          trailX:drag.trailX,trailY:drag.trailY};
      }
    }
    drag.star.dx+=drag.x-drag.star.rawX;
    drag.star.dy+=drag.y-drag.star.rawY;
    stop();
  };
  stage.addEventListener('pointermove',move);
  stage.addEventListener('pointerdown',start);
  stage.addEventListener('pointerup',end);
  stage.addEventListener('pointercancel',end);
  stage.addEventListener('lostpointercapture',end);
  stage.addEventListener('pointerleave',clearHover);
  stage.addEventListener('scroll',invalidateSurfaces,{passive:true});
  window.addEventListener('blur',stop);

  function updateHole(dt,w,h){
    if(drag&&!drag.moved&&!drag.transformed&&!hole){
      drag.held+=dt;
      if(drag.held>=.64){
        drag.transformed=true;
        hole={star:drag.star,x:drag.star.px,y:drag.star.py,amount:0,closing:false};
      }
    }
    if(!hole)return null;
    hole.amount+=((hole.closing?0:1)-hole.amount)*(1-Math.exp(-dt*(hole.closing?5.8:4.1)));
    if(hole.closing&&hole.amount<.008){hole=null;updateCursor();return null;}
    const inset=Math.min(25,w/2,h/2);
    const {px,py}=hole.star;
    hole.x=px+(Math.max(inset,Math.min(w-inset,px))-px)*hole.amount;
    hole.y=py+(Math.max(inset,Math.min(h-inset,py))-py)*hole.amount;
    return hole.amount>0?hole:null;
  }

  return {
    get isDragging(){return Boolean(drag);},
    layout,
    updateHole,
    draw(ctx,w,h,clock,dt,reduced,warmSprite,coolSprite){
      if(particles.length&&clock>=nextSurfaceRead)readCardSurfaces(clock);
      let liveCount=0;
      for(const particle of particles){
        particle.age+=dt;
        if(particle.age>=particle.life)continue;
        const restingFade=advanceParticle(particle,dt);
        if(!restingFade||particle.y>h+10)continue;
        particles[liveCount++]=particle;
        const fade=(1-particle.age/particle.life)*restingFade;
        const size=particle.size*(.65+.35*fade);
        ctx.globalAlpha=fade**1.25*.92*particle.strength;
        ctx.drawImage(particle.warm?warmSprite:coolSprite,particle.x-size,particle.y-size,size*2,size*2);
        ctx.globalAlpha=fade**1.45*.84*particle.strength;
        ctx.fillStyle=particle.warm?'#ffedc7':'#d8e8ff';
        const core=Math.max(.75,size*.39);
        ctx.fillRect(particle.x-core/2,particle.y-core/2,core,core);
      }
      particles.length=liveCount;
      for(const star of stars){
        const active=drag?.star===star;
        if(active){
          star.dx=drag.x-star.x;
          star.dy=drag.y-star.y;
        }else{
          const flight=star.flight;
          if(flight)flight.age+=dt;
          // Carry release velocity through a damped spring and ease the pull in.
          const spring=4.1-(flight?3.1*flight.impulse*Math.exp(-flight.age*1.8):0);
          const decay=Math.exp(-dt*spring);
          const returnX=star.vx+spring*star.dx,returnY=star.vy+spring*star.dy;
          star.dx=(star.dx+returnX*dt)*decay;
          star.dy=(star.dy+returnY*dt)*decay;
          star.vx=(star.vx-spring*returnX*dt)*decay;
          star.vy=(star.vy-spring*returnY*dt)*decay;
        }
        star.rawX=star.x+star.dx;
        star.rawY=star.y+star.dy;
        star.px=softenStarEdge(star.rawX,w);
        star.py=softenStarEdge(star.rawY,h);
        const flight=star.flight;
        if(flight){
          const forwardSpeed=star.vx*flight.headingX+star.vy*flight.headingY;
          const strength=Math.min(1,Math.max(0,forwardSpeed)/800)*Math.exp(-flight.age*2);
          if(strength>.04)emitTrail(flight,star.px,star.py,star.warm,strength);
          if(flight.age>2.5)star.flight=null;
        }
        const sprite=star.warm?warmSprite:coolSprite;
        const engaged=active||hovered===star?1:0;
        star.glow+=(engaged-star.glow)*(1-Math.exp(-dt*13));
        star.flash*=Math.exp(-dt*12);
        const pulse=reduced?.4:(1+Math.sin(clock*2+star.phase))/2;
        const transformation=hole?.star===star?hole.amount:0;
        const starlight=1-transformation;
        const halo=(28+pulse*10+star.glow*12+star.flash*12)*(1+transformation*.85);
        ctx.globalAlpha=(.53+pulse*.22+star.glow*.18)*starlight;
        ctx.drawImage(sprite,star.px-halo/2,star.py-halo/2,halo,halo);
        ctx.globalAlpha=(.82+pulse*.18)*starlight;
        ctx.fillStyle=star.warm?'#fff1d5':'#eaf2ff';
        ctx.beginPath();
        ctx.arc(star.px,star.py,1.45+pulse*.55+star.glow*.6+star.flash*.75,0,Math.PI*2);
        ctx.fill();
        const arm=4+pulse*3+star.glow*2;
        ctx.globalAlpha=(.25+pulse*.22+star.glow*.15)*starlight;
        ctx.strokeStyle=star.warm?'#ffe6bc':'#c9dcff';
        ctx.lineWidth=.65;
        ctx.beginPath();
        ctx.moveTo(star.px-arm,star.py);ctx.lineTo(star.px+arm,star.py);
        ctx.moveTo(star.px,star.py-arm);ctx.lineTo(star.px,star.py+arm);
        ctx.stroke();
      }
      if(hole?.amount)drawBlackHole(ctx,hole);
    },
    reset(){
      stop();
      particles.length=0;
      cardSurfaces.clear();
      invalidateSurfaces();
      stars=[];
      hole=null;
    },
    dispose(){
      stop();
      stage.removeEventListener('pointermove',move);
      stage.removeEventListener('pointerdown',start);
      stage.removeEventListener('pointerup',end);
      stage.removeEventListener('pointercancel',end);
      stage.removeEventListener('lostpointercapture',end);
      stage.removeEventListener('pointerleave',clearHover);
      stage.removeEventListener('scroll',invalidateSurfaces);
      window.removeEventListener('blur',stop);
    }
  };
}

/** Shared visual sky for the Hub home and authentication screens.
 * @param {HTMLCanvasElement} c
 * @param {{ animate?: boolean, interactiveGlow?: boolean }} [options]
 * @returns {() => void} Dispose animation and event listeners.
 */
export function mountStarfield(c, options = {}) {
let aiRaf=0,aiStars=[],aiResize=null;
const aiMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const interactiveGlow=options.interactiveGlow===true;
const draggableStars=interactiveGlow&&options.animate!==false&&c.parentElement
  ? mountDraggableStars(c,aiMotion)
  : null;
const pointerReach=interactiveGlow?52:64;
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
  const dx=bx-mx,dy=by-my,d=Math.hypot(dx,dy);
  const proximity=active?Math.max(0,1-d/pointerReach):0;
  if(proximity>0){
    const force=proximity**2*(interactiveGlow?5+(1-s.z)*6:10+(1-s.z)*16);
    const ux=d>.01?dx/d:Math.cos(s.phase),uy=d>.01?dy/d:Math.sin(s.phase);
    tx=ux*force;ty=uy*force;
  }
  const ease=1-Math.exp(-dt*(proximity>0?9:3.5));
  s.ox+=(tx-s.ox)*ease;
  s.oy+=(ty-s.oy)*ease;
  s.hover+=(proximity**2-s.hover)*ease;
}
function aiSeed(w,h){
  const n=Math.min(2800,Math.max(750,Math.round(w*h/380)));
  aiStars=Array.from({length:n},()=>({
    x:Math.random()*2-1,y:Math.random()*2-1,z:.18+Math.random()*.82,
    phase:Math.random()*Math.PI*2,size:.35+Math.random()*.65,
    warm:Math.random()<.16,hero:Math.random()<.022,ox:0,oy:0,hover:0
  }));
}
function aiBgStart(){
  if(!c||aiRaf||document.hidden)return;
  const ctx=c.getContext('2d');if(!ctx)return;
  let w=0,h=0,previous=0,clock=0,nextMeteor=3;
  let meteors=[],lastMeteorRoute=-1;
  let paintLensedHaze=null;
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
    paintLensedHaze=null;
    draggableStars?.reset();
    draggableStars?.layout(w,h);
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
    const reduced=aiMotion.matches||options.animate===false;
    const dt=previous?Math.min((t-previous)/1000,.05):0;previous=t;
    if(!reduced)clock+=dt;
    const rect=c.getBoundingClientRect();
    const mx=aiM.x-rect.left,my=aiM.y-rect.top;
    const lens=reduced?null:draggableStars?.updateHole(dt,w,h);
    const pointerActive=!reduced&&!lens&&!draggableStars?.isDragging&&aiM.on&&mx>=0&&mx<=w&&my>=0&&my<=h;
    ctx.globalAlpha=1;ctx.drawImage(haze,0,0,w,h);
    if(lens&&w>0&&h>0){
      paintLensedHaze??=createHazeLens(haze,hc,w,h);
      paintLensedHaze(ctx,lens);
    }
    for(const s of aiStars){
      if(!reduced){s.z-=dt*.006;if(s.z<.18){s.z=1;s.x=Math.random()*2-1;s.y=Math.random()*2-1;s.ox=s.oy=s.hover=0;}}
      const depth=1-s.z,spread=.72+s.z*.55;
      const bx=w/2+s.x*w*.68/spread,by=h/2+s.y*h*.68/spread;
      if(!reduced)aiStarOffset(s,bx,by,mx,my,pointerActive,dt);
      let px=bx+(reduced?0:s.ox),py=by+(reduced?0:s.oy);
      let stretch=1,lensAngle=0,mirroredDistance=0,imageDistance=0,ux=0,uy=0;
      if(lens){
        const dx=px-lens.x,dy=py-lens.y,distance=Math.hypot(dx,dy);
        if(distance<LENS_REACH){
          const falloff=Math.max(0,Math.min(1,(LENS_REACH-distance)/35));
          const strength=EINSTEIN_RADIUS**2*lens.amount*falloff;
          mirroredDistance=(Math.sqrt(distance*distance+4*strength)-distance)/2;
          imageDistance=distance+mirroredDistance;
          lensAngle=distance>.01?Math.atan2(dy,dx):s.phase;
          ux=Math.cos(lensAngle);uy=Math.sin(lensAngle);
          px+=ux*mirroredDistance;
          py+=uy*mirroredDistance;
          stretch=1+Math.min(3,mirroredDistance/Math.max(3,distance));
        }
      }
      if(px< -25||py< -25||px>w+25||py>h+25)continue;
      const fade=Math.min(1,(s.z-.18)/.1,(1-s.z)/.12);
      const tw=reduced?1:.84+.16*Math.sin(clock*(.35+s.size*.45)+s.phase);
      const hover=interactiveGlow&&!reduced?s.hover:0;
      const scintillation=interactiveGlow&&!reduced&&s.hero
        ? ((1+Math.sin(clock*(1.05+s.size*.85)+s.phase))/2)**6
        : 0;
      const alpha=Math.min(1,(.22+depth*.64)*tw*(1+hover*.85+scintillation*.65))*Math.max(0,fade);
      const radius=s.size*(.45+depth*1.35)*(1+hover*.2+scintillation*.23);
      const glowStrength=s.hero?.85:depth>.66?.45:0;
      if(glowStrength||hover>.02){
        const size=(s.hero?19:10)*(.6+depth)*(1+hover*.7+scintillation*.6);
        ctx.globalAlpha=alpha*Math.min(1,glowStrength+hover*.65+scintillation*.15);
        ctx.drawImage(s.warm?warm:cool,px-size/2,py-size/2,size,size);
      }
      ctx.globalAlpha=alpha;ctx.fillStyle=s.warm?'#ffe6bc':'#dce8ff';
      ctx.beginPath();
      if(stretch>1.06)ctx.ellipse(px,py,radius,radius*stretch,lensAngle,0,Math.PI*2);
      else ctx.arc(px,py,radius,0,Math.PI*2);
      ctx.fill();
      if(lens&&stretch>1.18){
        const arcHalfWidth=Math.min(.46,(radius+1.8)*stretch/imageDistance);
        ctx.globalAlpha=alpha*Math.min(.46,(stretch-1)*.58);
        ctx.strokeStyle=ctx.fillStyle;
        ctx.lineWidth=radius*.82;
        ctx.beginPath();
        ctx.arc(lens.x,lens.y,imageDistance,lensAngle-arcHalfWidth,lensAngle+arcHalfWidth);
        ctx.stroke();
      }
      if(lens&&mirroredDistance>HORIZON_RADIUS*lens.amount){
        const ratio=mirroredDistance/EINSTEIN_RADIUS;
        ctx.globalAlpha=alpha*Math.min(.62,ratio*ratio);
        ctx.beginPath();
        ctx.ellipse(lens.x-ux*mirroredDistance,lens.y-uy*mirroredDistance,radius*.65,
          radius*Math.max(.65,stretch*.72),lensAngle,0,Math.PI*2);
        ctx.fill();
      }
      if(s.hero&&depth>.5&&stretch<1.18){
        const arm=3+depth*4+scintillation*4;
        ctx.globalAlpha=alpha*(.3+scintillation*.38);ctx.strokeStyle=s.warm?'#ffe6bc':'#c9dcff';ctx.lineWidth=.55;
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
    draggableStars?.draw(ctx,w,h,clock,dt,reduced,warm,cool);
    ctx.globalAlpha=1;
    aiRaf=reduced?0:requestAnimationFrame(step);
  };
  aiRaf=requestAnimationFrame(step);
}
function aiBgStop(){if(aiRaf)cancelAnimationFrame(aiRaf);aiRaf=0;aiResize=null;draggableStars?.reset();}

let aiFitFrame=0;
const aiFitObserver=new ResizeObserver(()=>{
  cancelAnimationFrame(aiFitFrame);
  aiFitFrame=requestAnimationFrame(()=>{
    if(aiMotion.matches||options.animate===false){aiBgStop();aiBgStart();}else if(aiResize)aiResize();
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
  draggableStars?.dispose();
  window.removeEventListener('pointermove',pointerMove);
  document.removeEventListener('pointerleave',aiPointerReset);
  window.removeEventListener('blur',aiPointerReset);
  window.removeEventListener('pointercancel',aiPointerReset);
  document.removeEventListener('visibilitychange',visibility);
  aiMotion.removeEventListener('change',motionChange);
};
}
