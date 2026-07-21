"use client";
import {useEffect,useState} from "react";
import Image from "next/image";

export type LabelSpool={spoolCode:string;material:string;brand:string;colorName:string;colorCode:string;colorHex:string;remainingNetGrams:number;state:string};

export default function SpoolLabel({spool,onClose}:{spool:LabelSpool;onClose:()=>void}){
 const [qr,setQr]=useState("");
 useEffect(()=>{let active=true;void import("qrcode").then(({toDataURL})=>toDataURL(`LT:SPOOL:${spool.spoolCode}`,{errorCorrectionLevel:"M",margin:1,width:360,color:{dark:"#172126",light:"#ffffff"}})).then(value=>{if(active)setQr(value)});return()=>{active=false}},[spool.spoolCode]);
 return <div className="spool-label-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><section className="spool-label-dialog" role="dialog" aria-modal="true" aria-labelledby="spool-label-title"><header><div><h2 id="spool-label-title">实体耗材卷标签</h2><p>打印后贴在卷盘侧面；扫码内容只包含系统卷码，不含任何设备密钥。</p></div><button onClick={onClose} aria-label="关闭">×</button></header><div className="spool-label-sheet"><div className="spool-label-color" style={{background:`#${String(spool.colorHex||"").replace("#","").slice(0,6)}`}}/><div className="spool-label-copy"><small>LAYERTRACE · MATERIAL SPOOL</small><h3>{spool.spoolCode}</h3><strong>{spool.material} · {spool.colorName||"未命名颜色"}</strong><span>{spool.brand}{spool.colorCode?` · ${spool.colorCode}`:""}</span><b>{Number(spool.remainingNetGrams).toFixed(0)} g</b></div><div className="spool-label-qr">{qr?<Image src={qr} width={170} height={170} unoptimized alt={`耗材卷 ${spool.spoolCode} 二维码`}/>:<span>正在生成二维码…</span>}<small>LT:SPOOL:{spool.spoolCode}</small></div></div><footer><button onClick={onClose}>取消</button><button className="primary" disabled={!qr} onClick={()=>window.print()}>打印标签</button></footer></section></div>
}
