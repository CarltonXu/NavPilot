import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

const VIEWPORT = 240;

export default function AvatarCropper({ file, locale='zh-CN', busy=false, onCancel, onConfirm }) {
  const zh = locale !== 'en';
  const imageRef = useRef(null), dragRef = useRef(null);
  const [source,setSource] = useState(''),[size,setSize]=useState({width:1,height:1}),[zoom,setZoom]=useState(1),[offset,setOffset]=useState({x:0,y:0});
  useEffect(()=>{
    const url=URL.createObjectURL(file),image=new Image();
    image.onload=()=>{imageRef.current=image;setSize({width:image.naturalWidth,height:image.naturalHeight});setZoom(1);setOffset({x:0,y:0});};
    image.src=url;setSource(url);
    return()=>URL.revokeObjectURL(url);
  },[file]);
  const baseScale=useMemo(()=>Math.max(VIEWPORT/size.width,VIEWPORT/size.height),[size]);
  const drawn={width:size.width*baseScale*zoom,height:size.height*baseScale*zoom};
  const previewScale=52/VIEWPORT;
  const clamp=(next)=>({x:Math.max((VIEWPORT-drawn.width)/2,Math.min((drawn.width-VIEWPORT)/2,next.x)),y:Math.max((VIEWPORT-drawn.height)/2,Math.min((drawn.height-VIEWPORT)/2,next.y))});
  useEffect(()=>setOffset(current=>clamp(current)),[zoom,size.width,size.height]);
  function pointerDown(event){if(busy)return;event.currentTarget.setPointerCapture(event.pointerId);dragRef.current={x:event.clientX,y:event.clientY,offset};}
  function pointerMove(event){if(!dragRef.current)return;setOffset(clamp({x:dragRef.current.offset.x+event.clientX-dragRef.current.x,y:dragRef.current.offset.y+event.clientY-dragRef.current.y}));}
  function finish(){dragRef.current=null;}
  async function confirm(){
    const image=imageRef.current;if(!image)return;
    const output=512,canvas=document.createElement('canvas');canvas.width=output;canvas.height=output;
    const context=canvas.getContext('2d'),scale=output/VIEWPORT;
    context.drawImage(image,(VIEWPORT-drawn.width)/2*scale+offset.x*scale,(VIEWPORT-drawn.height)/2*scale+offset.y*scale,drawn.width*scale,drawn.height*scale);
    await onConfirm(canvas.toDataURL('image/png'));
  }
  return createPortal(<div className="modal-mask avatar-crop-mask"><section className="modal avatar-crop-dialog" role="dialog" aria-modal="true"><header><div><h3>{zh?'裁剪个人头像':'Crop avatar'}</h3><p>{zh?'拖动图片调整位置，使用滑杆缩放':'Drag to reposition and use the slider to zoom'}</p></div><button className="mini-btn" disabled={busy} onClick={onCancel}><Icon name="close" size={15}/></button></header><main><div className="avatar-crop-stage" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={finish} onPointerCancel={finish}><img src={source} alt="" draggable="false" style={{width:drawn.width,height:drawn.height,transform:`translate(calc(-50% + ${offset.x}px),calc(-50% + ${offset.y}px))`}}/><span className="avatar-crop-guide"/></div><div className="avatar-zoom-control"><Icon name="minus" size={15}/><input type="range" min="1" max="3" step="0.01" value={zoom} onChange={event=>setZoom(Number(event.target.value))} aria-label={zh?'缩放头像':'Avatar zoom'}/><Icon name="plus" size={15}/></div><div className="avatar-crop-preview"><span><img src={source} alt="" style={{width:drawn.width*previewScale,height:drawn.height*previewScale,transform:`translate(calc(-50% + ${offset.x*previewScale}px),calc(-50% + ${offset.y*previewScale}px))`}}/></span><div><strong>{zh?'头像预览':'Avatar preview'}</strong><small>{zh?'主页和个人空间将使用此头像':'Used on the home page and in My Space'}</small></div></div></main><footer><button className="icon-btn" disabled={busy} onClick={onCancel}>{zh?'取消':'Cancel'}</button><button className="icon-btn primary" disabled={busy||!imageRef.current} onClick={confirm}><Icon name="check" size={15}/>{busy?(zh?'正在上传…':'Uploading…'):(zh?'裁剪并上传':'Crop & upload')}</button></footer></section></div>,document.body);
}
