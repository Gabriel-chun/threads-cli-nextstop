"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeywordNetworkNode, KeywordNetworkEdge } from "../lib/keywordNetwork";
import { createKeywordParticles, linkedKeywordIds, nearestKeywordParticle, stepKeywordParticles, type Particle } from "../lib/keywordPhysics";
import { useI18n } from "./I18nProvider";

type Props={nodes:KeywordNetworkNode[];edges:KeywordNetworkEdge[];selectedId:string|null;onSelect:(id:string|null)=>void;resetKey:number};
const palette:Record<KeywordNetworkNode["layer"],string>={recall:"#a84328",language:"#8a6a59",need:"#426a53",keyword:"#987d68"};

export function KeywordParticleCanvas({nodes,edges,selectedId,onSelect,resetKey}:Props){
  const {t}=useI18n();
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const particlesRef=useRef<Particle[]>([]);
  const selectedRef=useRef(selectedId);
  const pointerRef=useRef<{x:number;y:number}|null>(null);
  const dragRef=useRef<{id:string;originX:number;originY:number;moved:boolean}|null>(null);
  const [hovered,setHovered]=useState<string|null>(null);
  const [keyboardIndex,setKeyboardIndex]=useState(-1);
  const [size,setSize]=useState({w:900,h:580});
  const ids=useMemo(()=>new Map(nodes.map(n=>[n.id,n])),[nodes]);
  const links=useMemo(()=>edges.filter(e=>ids.has(e.source)&&ids.has(e.target)),[edges,ids]);
  const connected=useMemo(()=>linkedKeywordIds(links,selectedId),[links,selectedId]);
  const hoveredNode=hovered?ids.get(hovered):null;
  const hoveredParticle=particlesRef.current.find(p=>p.id===hovered);
  useEffect(()=>{selectedRef.current=selectedId;},[selectedId]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const sync=()=>{
      const rect=canvas.getBoundingClientRect(),w=Math.max(280,Math.round(rect.width)),h=Math.max(340,Math.round(rect.height));
      setSize({w,h});
    };
    sync();
    const observer=new ResizeObserver(sync);observer.observe(canvas);
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    particlesRef.current=createKeywordParticles(nodes,size.w,size.h);
    setHovered(null);setKeyboardIndex(-1);
  },[nodes,size.w,size.h,resetKey]);

  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas?.getContext("2d");
    if(!canvas||!ctx)return;
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf=0,last=0;
    const draw=(time:number)=>{
      raf=requestAnimationFrame(draw);
      if(document.hidden||time-last<22)return;
      last=time;
      const dpr=Math.min(2,window.devicePixelRatio||1);
      if(canvas.width!==Math.round(size.w*dpr)||canvas.height!==Math.round(size.h*dpr)){
        canvas.width=Math.round(size.w*dpr);canvas.height=Math.round(size.h*dpr);
      }
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size.w,size.h);
      const parts=particlesRef.current,byId=new Map(parts.map(p=>[p.id,p]));
      const selected=selectedRef.current,related=linkedKeywordIds(links,selected);
      if(!reduced.matches)stepKeywordParticles(parts,size.w,size.h,time,pointerRef.current,dragRef.current?.id);
      for(const edge of links){
        const a=byId.get(edge.source),b=byId.get(edge.target);
        if(!a||!b)continue;
        const selectedEdge=selected&&(edge.source===selected||edge.target===selected);
        const dim=selected&&!selectedEdge;
        const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
        const sway=reduced.matches?0:Math.sin(time*.00065+(edge.weight%11))*4;
        const mx=(a.x+b.x)/2-dy/len*sway,my=(a.y+b.y)/2+dx/len*sway;
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(mx,my,b.x,b.y);
        ctx.strokeStyle=selectedEdge?"rgba(168,67,40,.78)":"rgba(137,126,115,.48)";
        ctx.lineWidth=Math.min(2.6,.8+Math.sqrt(Math.max(0,edge.weight))*.22);
        ctx.globalAlpha=dim?.09:selectedEdge?1:.45;ctx.stroke();
        if(!reduced.matches&&!dim){
          const phase=(time*.00015+(edge.weight%17)/17)%1;
          const u=1-phase;
          const x=u*u*a.x+2*u*phase*mx+phase*phase*b.x;
          const y=u*u*a.y+2*u*phase*my+phase*phase*b.y;
          ctx.beginPath();ctx.arc(x,y,1.8,0,Math.PI*2);
          ctx.fillStyle="#a84328";ctx.globalAlpha=selectedEdge?.95:.42;ctx.fill();
        }
      }
      ctx.globalAlpha=1;
      for(const p of parts){
        const data=ids.get(p.id);
        if(!data)continue;
        const active=p.id===selected,over=p.id===hovered;
        const dim=Boolean(selected&&!related.has(p.id));
        ctx.globalAlpha=dim?.17:1;
        if(active||over){ctx.beginPath();ctx.arc(p.x,p.y,p.radius+8,0,Math.PI*2);ctx.strokeStyle="rgba(168,67,40,.28)";ctx.lineWidth=2;ctx.stroke();}
        ctx.beginPath();ctx.arc(p.x,p.y,p.radius+(over?2:0),0,Math.PI*2);
        ctx.fillStyle=palette[data.layer];ctx.fill();
        ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1.4,p.radius*.19),0,Math.PI*2);ctx.fillStyle="#fffaf3";ctx.fill();
        if(active||over){
          ctx.font="600 13px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
          const text=data.label,tw=ctx.measureText(text).width;
          const tx=Math.max(12,Math.min(size.w-tw-12,p.x-tw/2));
          const ty=Math.max(22,p.y-p.radius-12);
          ctx.fillStyle="#292724";ctx.fillText(text,tx,ty);
        }
      }
      ctx.globalAlpha=1;
    };
    raf=requestAnimationFrame(draw);
    return()=>cancelAnimationFrame(raf);
  },[size,links,ids,hovered]);

  function localPoint(e:React.PointerEvent<HTMLCanvasElement>){
    const rect=e.currentTarget.getBoundingClientRect();
    return{x:e.clientX-rect.left,y:e.clientY-rect.top};
  }
  function onDown(e:React.PointerEvent<HTMLCanvasElement>){
    const p=localPoint(e),hit=nearestKeywordParticle(particlesRef.current,p);
    if(hit){
      dragRef.current={id:hit.id,originX:p.x,originY:p.y,moved:false};
      e.currentTarget.setPointerCapture(e.pointerId);
    } else onSelect(null);
  }
  function onMove(e:React.PointerEvent<HTMLCanvasElement>){
    const p=localPoint(e);pointerRef.current=p;
    const drag=dragRef.current;
    if(drag){
      const target=particlesRef.current.find(n=>n.id===drag.id);
      if(target){
        if(Math.hypot(p.x-drag.originX,p.y-drag.originY)>4)drag.moved=true;
        if(drag.moved){target.x=Math.max(target.radius+12,Math.min(size.w-target.radius-12,p.x));target.y=Math.max(target.radius+12,Math.min(size.h-target.radius-12,p.y));target.vx=0;target.vy=0;}
      }
    }
    setHovered(nearestKeywordParticle(particlesRef.current,p)?.id||null);
  }
  function onUp(e:React.PointerEvent<HTMLCanvasElement>){
    const drag=dragRef.current;dragRef.current=null;
    if(drag&&!drag.moved)onSelect(selectedRef.current===drag.id?null:drag.id);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function onKeyDown(e:React.KeyboardEvent<HTMLCanvasElement>){
    if(["ArrowDown","ArrowRight","ArrowUp","ArrowLeft"].includes(e.key)){
      e.preventDefault();if(!nodes.length)return;
      const next=(keyboardIndex+(e.key==="ArrowRight"||e.key==="ArrowDown"?1:-1)+nodes.length)%nodes.length;
      setKeyboardIndex(next);setHovered(nodes[next].id);
    }else if((e.key==="Enter"||e.key===" ")&&keyboardIndex>=0){
      e.preventDefault();onSelect(nodes[keyboardIndex].id);
    }else if(e.key==="Escape"){setHovered(null);onSelect(null);}
  }
  return <div className="keywordParticleStage">
    <canvas ref={canvasRef} className="keywordParticleCanvas" tabIndex={0} role="img"
      aria-label={t("network.particleAria")}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={()=>{dragRef.current=null;}}
      onPointerLeave={()=>{if(!dragRef.current){pointerRef.current=null;setHovered(null);}}}
      onKeyDown={onKeyDown} onBlur={()=>{setHovered(null);setKeyboardIndex(-1);}}
    />
    {hoveredNode&&hoveredParticle?<div className="keywordParticleTooltip" style={{
      left:Math.max(12,Math.min(size.w-205,hoveredParticle.x+22)),top:Math.max(12,Math.min(size.h-80,hoveredParticle.y-30))
    }} role="status">
      <strong>{hoveredNode.label}</strong><small>{t("network.layer."+hoveredNode.layer)} · {t("network.count",{count:hoveredNode.count})}</small>
    </div>:null}
    <div className="keywordParticleLegend" aria-hidden="true">
      {(["recall","language","need","keyword"] as const).map(layer=><span key={layer}><i style={{backgroundColor:palette[layer]}}/>{t("network.layer."+layer)}</span>)}
    </div>
  </div>;
}
